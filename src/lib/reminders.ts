/**
 * Nudges for participants who never tap "Я перевёл".
 *
 * Telegram gives bots no read receipts, so "read but ignored" is not
 * observable — we nudge whoever hasn't tapped the button. Cadence: 5 minutes
 * after the order is placed, then 15 minutes later, then hourly.
 *
 * The schedule lives in the database and is walked by a single in-process
 * ticker, so a restart resumes where it left off instead of losing nudges.
 */

import { prisma } from "@/lib/prisma";
import { getBot } from "@/lib/bot";
import { paymentDetails } from "@/lib/telegram";

const FIRST_DELAY_MS = 5 * 60 * 1000;
const SECOND_DELAY_MS = 15 * 60 * 1000;
const HOURLY_MS = 60 * 60 * 1000;
const TICK_MS = 60 * 1000;
/** Stop pestering after this many nudges (~a working day of hourly ones). */
const MAX_REMINDERS = 12;

/** 5 min after the order, then +15 min, then hourly. */
export function delayAfter(sentCount: number): number {
  if (sentCount === 0) return FIRST_DELAY_MS;
  if (sentCount === 1) return SECOND_DELAY_MS;
  return HOURLY_MS;
}

function fmtPrice(n: number): string {
  const formatted = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${formatted} ₽`;
}

const NUDGES = [
  "Напоминаю про обед",
  "Всё ещё жду перевод",
  "Обед был вкусный, а долг остался",
  "Деньги сами себя не переведут",
  "Тук-тук. Это твой долг за обед",
];

export async function scheduleFirstReminder(
  sessionId: string,
  userId: bigint,
  amount: number
): Promise<void> {
  const nextAt = new Date(Date.now() + FIRST_DELAY_MS);
  await prisma.paymentReminder.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    update: { amount, nextAt, sentCount: 0, doneAt: null },
    create: { sessionId, userId, amount, nextAt },
  });
}

/** Called when the user finally taps the button (or is marked paid). */
export async function stopReminders(
  sessionId: string,
  userId: bigint
): Promise<void> {
  await prisma.paymentReminder
    .update({
      where: { sessionId_userId: { sessionId, userId } },
      data: { doneAt: new Date() },
    })
    .catch(() => {
      /* nothing scheduled for this user — fine */
    });
}

/** Send every nudge that is due. Returns how many went out. */
export async function sendDueReminders(): Promise<number> {
  const due = await prisma.paymentReminder.findMany({
    where: { doneAt: null, nextAt: { lte: new Date() } },
    include: {
      session: { select: { id: true, status: true, admin: true } },
    },
    take: 25,
  });

  if (due.length === 0) return 0;

  const bot = getBot();
  let sent = 0;

  for (const reminder of due) {
    // Claim it atomically, so two server instances can't both send the same nudge
    const claimed = await prisma.paymentReminder.updateMany({
      where: { id: reminder.id, doneAt: null, nextAt: { lte: new Date() } },
      data: { nextAt: new Date(Date.now() + delayAfter(reminder.sentCount)) },
    });
    if (claimed.count === 0) continue;

    // Someone may have marked the payment on the web page instead
    const paid = await prisma.payment.findUnique({
      where: {
        sessionId_userId: {
          sessionId: reminder.sessionId,
          userId: reminder.userId,
        },
      },
    });

    if (paid || reminder.session.status === "CLOSED") {
      await prisma.paymentReminder.update({
        where: { id: reminder.id },
        data: { doneAt: new Date() },
      });
      continue;
    }

    const nudge = NUDGES[reminder.sentCount % NUDGES.length];
    const details = paymentDetails(
      reminder.session.admin.phoneNumber || "",
      reminder.amount
    );
    const requisites = details
      ? `\n\n<code>${details.amount}</code> ₽ на <code>+${details.phone}</code>`
      : "";

    try {
      await bot.api.sendMessage(
        Number(reminder.userId),
        `${nudge}: с тебя ${fmtPrice(reminder.amount)}.${requisites}\n\nЕсли уже перевёл — нажми кнопку, и я перестану напоминать.`,
        {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Я перевёл",
                  callback_data: `paid:${reminder.sessionId}`,
                },
              ],
            ],
          },
        }
      );
      sent++;
    } catch (err) {
      // Blocked the bot, deleted the chat — stop trying
      console.error(`Reminder to ${reminder.userId} failed:`, err);
      await prisma.paymentReminder.update({
        where: { id: reminder.id },
        data: { doneAt: new Date() },
      });
      continue;
    }

    const sentCount = reminder.sentCount + 1;
    await prisma.paymentReminder.update({
      where: { id: reminder.id },
      data: {
        sentCount,
        // Reschedule from the moment it was actually delivered
        nextAt: new Date(Date.now() + delayAfter(sentCount)),
        ...(sentCount >= MAX_REMINDERS ? { doneAt: new Date() } : {}),
      },
    });
  }

  return sent;
}

// --- Ticker ---

declare global {
  var __reminderTicker: NodeJS.Timeout | undefined;
}

/** Start the once-a-minute sweep (idempotent across hot reloads). */
export function startReminderTicker(): void {
  if (globalThis.__reminderTicker) return;

  globalThis.__reminderTicker = setInterval(() => {
    sendDueReminders().catch((err) =>
      console.error("Reminder sweep failed:", err)
    );
  }, TICK_MS);

  // Don't keep the process alive just for this
  globalThis.__reminderTicker.unref?.();
  console.log("Payment reminder ticker started");
}
