import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getBot } from "@/lib/bot";
import { paymentDetails } from "@/lib/telegram";
import { scheduleFirstReminder } from "@/lib/reminders";

// Format number with thin space thousands separator and before ₽
function fmtPrice(n: number): string {
  const formatted = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u2009");
  return `${formatted}\u2009₽`;
}

// POST /api/orders/[id]/finalize - Admin finalizes order with delivery/service fees
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orderSession = await prisma.orderSession.findUnique({
      where: { id },
      include: {
        admin: true,
        items: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!orderSession) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Check that current user is admin
    if (orderSession.adminId.toString() !== session.userId) {
      return NextResponse.json(
        { error: "Только администратор может завершить сбор заказов" },
        { status: 403 }
      );
    }

    if (orderSession.status !== "OPEN") {
      return NextResponse.json(
        { error: "Заказ уже завершен" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const deliveryFee = Math.round(Number(body.deliveryFee) || 0);
    const serviceFee = Math.round(Number(body.serviceFee) || 0);
    const discountPercent = Math.min(
      100,
      Math.max(0, Math.round(Number(body.discountPercent) || 0))
    );

    // Update session
    await prisma.orderSession.update({
      where: { id },
      data: {
        status: "ORDERED",
        deliveryFee,
        serviceFee,
        discountPercent,
      },
    });

    // Calculate totals per user
    const userTotals = new Map<
      string,
      { userId: bigint; total: number; firstName: string }
    >();

    for (const item of orderSession.items) {
      const key = item.userId.toString();
      const existing = userTotals.get(key);
      if (existing) {
        existing.total += item.price;
      } else {
        userTotals.set(key, {
          userId: item.userId,
          total: item.price,
          firstName: item.user.firstName,
        });
      }
    }

    const uniqueUsers = userTotals.size;
    const extraPerPerson =
      uniqueUsers > 0 ? (deliveryFee + serviceFee) / uniqueUsers : 0;
    const discountMultiplier = 1 - discountPercent / 100;

    // Send notifications via bot
    const bot = getBot();
    const adminPhone = orderSession.admin.phoneNumber || "";
    const results: Array<{
      userId: string;
      firstName: string;
      total: number;
    }> = [];

    let notifiedCount = 0;
    let failedCount = 0;

    for (const [userId, data] of userTotals) {
      const foodDiscounted = data.total * discountMultiplier;
      const total = Math.round(foodDiscounted + extraPerPerson);
      results.push({
        userId,
        firstName: data.firstName,
        total,
      });

      const isAdmin = userId === session.userId;

      try {
        if (isAdmin) {
          // Admin gets a summary without payment button
          const others = Array.from(userTotals.entries())
            .filter(([uid]) => uid !== session.userId);

          const lines = others.map(([, d]) => {
            const t = Math.round(d.total * discountMultiplier + extraPerPerson);
            return `  ${d.firstName}\u00A0— ${fmtPrice(t)}`;
          });

          const totalToReceive = Math.round(
            others.reduce(
              (s, [, d]) => s + d.total * discountMultiplier + extraPerPerson,
              0
            )
          );

          const discountLine =
            discountPercent > 0
              ? `\nСкидка на блюда: ${discountPercent}%`
              : "";

          const summaryText =
            lines.length > 0
              ? `Обед заказан! Ждём переводов:\n\n${lines.join("\n")}${discountLine}\n\nВсего к\u00A0получению: ${fmtPrice(totalToReceive)}`
              : "Обед заказан! Ты был единственным участником.";

          await bot.api.sendMessage(Number(userId), summaryText);
          notifiedCount++;
        } else {
          const foodPrice = Math.round(foodDiscounted);
          const extra = Math.round(extraPerPerson);
          const discountNote =
            discountPercent > 0
              ? ` Еда уже со скидкой ${discountPercent}%.`
              : "";

          // Phone and amount as tappable copy targets — Telegram copies a
          // <code> block on tap, which works in every bank app.
          const details = paymentDetails(adminPhone, total);
          const requisites = details
            ? `\n\nПеревести <code>${details.amount}</code>\u00A0₽ по\u00A0номеру <code>+${details.phone}</code>` +
              `\n<i>Нажми на\u00A0номер или\u00A0сумму, чтобы скопировать</i>`
            : "\n\nНомер для перевода не\u00A0указан — спроси у\u00A0заказавшего.";

          await bot.api.sendMessage(
            Number(userId),
            `Обед заказан. С\u00A0тебя ${fmtPrice(total)}. ` +
              `${fmtPrice(foodPrice)} за\u00A0еду и\u00A0${fmtPrice(extra)} монополисту Яндексу.${discountNote}` +
              requisites,
            {
              parse_mode: "HTML",
              link_preview_options: { is_disabled: true },
              reply_markup: {
                inline_keyboard: [
                  [{ text: "✅ Я перевёл", callback_data: `paid:${id}` }],
                ],
              },
            }
          );
          notifiedCount++;

          // Nudge them later if they never tap the button
          await scheduleFirstReminder(id, data.userId, total);
        }
      } catch (err) {
        console.error(`Failed to notify user ${userId}:`, err);
        failedCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      results,
      extraPerPerson: Math.round(extraPerPerson),
      notifiedCount,
      failedCount,
    });
  } catch (error) {
    console.error("Finalize error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
