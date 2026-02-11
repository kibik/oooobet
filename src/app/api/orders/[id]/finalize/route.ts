import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getBot } from "@/lib/bot";
import { generatePaymentLinks } from "@/lib/telegram";

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

    // Update session
    await prisma.orderSession.update({
      where: { id },
      data: {
        status: "ORDERED",
        deliveryFee,
        serviceFee,
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
      const total = Math.round(data.total + extraPerPerson);
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
            const t = Math.round(d.total + extraPerPerson);
            return `  ${d.firstName}\u00A0— ${fmtPrice(t)}`;
          });

          const totalToReceive = Math.round(
            others.reduce((s, [, d]) => s + d.total + extraPerPerson, 0)
          );

          const summaryText =
            lines.length > 0
              ? `Обед заказан! Ждём переводов:\n\n${lines.join("\n")}\n\nВсего к\u00A0получению: ${fmtPrice(totalToReceive)}`
              : "Обед заказан! Ты был единственным участником.";

          await bot.api.sendMessage(Number(userId), summaryText);
          notifiedCount++;
        } else {
          // Other participants get payment links for 3 banks
          const links = generatePaymentLinks(adminPhone, total);
          const foodPrice = data.total;
          const extra = Math.round(extraPerPerson);

          await bot.api.sendMessage(
            Number(userId),
            `Обед заказан. С\u00A0тебя ${fmtPrice(total)}. ` +
              `${fmtPrice(foodPrice)} за\u00A0еду и\u00A0${fmtPrice(extra)} монополисту Яндексу.`,
            {
              parse_mode: "HTML",
              link_preview_options: { is_disabled: true },
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "Альфа", url: links.alfa },
                    { text: "Сбер", url: links.sber },
                    { text: "Т\u2011банк", url: links.tbank },
                  ],
                ],
              },
            }
          );
          notifiedCount++;
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
