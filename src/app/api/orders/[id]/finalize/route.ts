import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getBot } from "@/lib/bot";
import { paymentDetails, payTarget } from "@/lib/telegram";
import { detectProvider } from "@/lib/providers";
import { money, roundIn, formatMoney } from "@/lib/money";
import { scheduleFirstReminder } from "@/lib/reminders";

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

    const currency = orderSession.currency;
    // Name the service that actually took the fee
    const provider = detectProvider(orderSession.url);
    // Keep the old joke for Yandex orders; name the service for the rest
    const serviceFeeLine =
      !provider || provider.id === "yandex"
        ? "монополисту Яндексу"
        : `сервису ${provider.title}`;
    const fmt = (value: number) => formatMoney(value, currency);
    const round = (value: number) => roundIn(value, currency);

    const body = await req.json();
    const deliveryFee = round(Number(body.deliveryFee) || 0);
    const serviceFee = round(Number(body.serviceFee) || 0);
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
      {
        userId: bigint;
        total: number;
        firstName: string;
        dishes: Array<{ name: string; options: string | null; price: number }>;
      }
    >();

    for (const item of orderSession.items) {
      const key = item.userId.toString();
      const dish = {
        name: item.dishName,
        options: item.options,
        price: money(item.price),
      };
      const existing = userTotals.get(key);
      if (existing) {
        existing.total += money(item.price);
        existing.dishes.push(dish);
      } else {
        userTotals.set(key, {
          userId: item.userId,
          total: money(item.price),
          firstName: item.user.firstName,
          dishes: [dish],
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
      const total = round(foodDiscounted + extraPerPerson);
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
            const t = round(d.total * discountMultiplier + extraPerPerson);
            return `  ${d.firstName}\u00A0— ${fmt(t)}`;
          });

          const totalToReceive = round(
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
              ? `Обед заказан! Ждём переводов:\n\n${lines.join("\n")}${discountLine}\n\nВсего к\u00A0получению: ${fmt(totalToReceive)}`
              : "Обед заказан! Ты был единственным участником.";

          await bot.api.sendMessage(Number(userId), summaryText);
          notifiedCount++;
        } else {
          const foodPrice = round(foodDiscounted);
          const extra = round(extraPerPerson);
          const discountNote =
            discountPercent > 0
              ? ` Еда уже со скидкой ${discountPercent}%.`
              : "";

          // What exactly they ordered, so the sum is verifiable
          const dishLines = data.dishes
            .map((dish) => {
              const options = dish.options ? ` ${dish.options}.` : "";
              return `— ${dish.name}.${options} ${fmt(dish.price)}`;
            })
            .join("\n");

          // Phone and amount as tappable copy targets — Telegram copies a
          // <code> block on tap, which works in every bank app.
          // SBP transfers by phone exist for roubles only; elsewhere we just
          // make the amount easy to copy and let people settle it their way.
          const details = currency === "RUB" ? paymentDetails(adminPhone, total) : null;
          const requisites = details
            ? `\n\nПеревести <code>${details.amount}</code>\u00A0₽ по\u00A0номеру <code>+${details.phone}</code>` +
              `\n<i>Нажми на\u00A0номер или\u00A0сумму, чтобы скопировать</i>`
            : currency === "RUB"
              ? "\n\nНомер для перевода не\u00A0указан — спроси у\u00A0заказавшего."
              : `\n\nК\u00A0переводу <code>${roundIn(total, currency)}</code> ${currency}` +
                `\n<i>Нажми на\u00A0сумму, чтобы скопировать</i>`;

          // A one-tap link exists only if the recipient told us their bank
          const target = payTarget(orderSession.admin, total, currency);
          const buttons = [
            ...(target ? [[{ text: target.title, url: target.url }]] : []),
            [{ text: "✅ Я перевёл", callback_data: `paid:${id}` }],
          ];

          await bot.api.sendMessage(
            Number(userId),
            `Обед заказан. С\u00A0тебя ${fmt(total)}. ` +
              `${fmt(foodPrice)} за\u00A0еду и\u00A0${fmt(extra)} ${serviceFeeLine}.${discountNote}` +
              `\n\n${dishLines}` +
              requisites,
            {
              parse_mode: "HTML",
              link_preview_options: { is_disabled: true },
              reply_markup: { inline_keyboard: buttons },
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
      extraPerPerson: round(extraPerPerson),
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
