import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// POST /api/orders/[id]/ready — "I'm done choosing"
// DELETE — take it back and keep picking
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
      select: { status: true },
    });

    if (!orderSession) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }
    if (orderSession.status !== "OPEN") {
      return NextResponse.json(
        { error: "Сбор заказов уже завершён" },
        { status: 400 }
      );
    }

    const userId = BigInt(session.userId);
    const itemCount = await prisma.orderItem.count({
      where: { sessionId: id, userId },
    });
    if (itemCount === 0) {
      return NextResponse.json(
        { error: "Сначала добавь хотя бы одно блюдо" },
        { status: 400 }
      );
    }

    await prisma.participant.upsert({
      where: { sessionId_userId: { sessionId: id, userId } },
      update: { readyAt: new Date() },
      create: { sessionId: id, userId },
    });

    return NextResponse.json({ ok: true, ready: true });
  } catch (error) {
    console.error("Ready error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.participant
      .delete({
        where: {
          sessionId_userId: { sessionId: id, userId: BigInt(session.userId) },
        },
      })
      .catch(() => {
        /* wasn't marked ready — nothing to undo */
      });

    return NextResponse.json({ ok: true, ready: false });
  } catch (error) {
    console.error("Unready error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
