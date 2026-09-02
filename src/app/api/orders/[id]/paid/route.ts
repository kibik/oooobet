import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getBot } from "@/lib/bot";
import { stopReminders } from "@/lib/reminders";

// POST /api/orders/[id]/paid — mark my transfer from the web page
// (the same thing the "Я перевёл" button in the bot does)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session.userId) {
      return NextResponse.json(
        { error: "Необходимо авторизоваться" },
        { status: 401 }
      );
    }

    const orderSession = await prisma.orderSession.findUnique({
      where: { id },
      select: { adminId: true },
    });
    if (!orderSession) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    const userId = BigInt(session.userId);
    const existing = await prisma.payment.findUnique({
      where: { sessionId_userId: { sessionId: id, userId } },
    });

    if (!existing) {
      await prisma.payment.create({ data: { sessionId: id, userId } });
    }
    await stopReminders(id, userId);

    // Tell the person who paid for everything
    if (!existing && orderSession.adminId !== userId) {
      const who = [session.firstName, session.lastName]
        .filter(Boolean)
        .join(" ");
      try {
        await getBot().api.sendMessage(
          Number(orderSession.adminId),
          `💸 ${who || "Участник"} отметил перевод по заказу`
        );
      } catch {
        /* admin may have blocked the bot */
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Mark paid error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
