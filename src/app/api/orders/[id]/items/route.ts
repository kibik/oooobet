import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// POST /api/orders/[id]/items - Add item to order
export async function POST(
  req: NextRequest,
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
    });

    if (!orderSession) {
      return NextResponse.json(
        { error: "Сессия заказа не найдена" },
        { status: 404 }
      );
    }

    if (orderSession.status !== "OPEN") {
      return NextResponse.json(
        { error: "Сбор заказов уже завершен" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { dishName, price } = body;

    if (!dishName || typeof dishName !== "string" || dishName.trim() === "") {
      return NextResponse.json(
        { error: "Укажите название блюда" },
        { status: 400 }
      );
    }

    const numPrice = Number(price);
    if (!numPrice || numPrice <= 0) {
      return NextResponse.json(
        { error: "Укажите корректную цену" },
        { status: 400 }
      );
    }

    // Ensure user exists in DB
    const userExists = await prisma.user.findUnique({
      where: { id: BigInt(session.userId) },
    });

    if (!userExists) {
      return NextResponse.json(
        { error: "Пользователь не найден. Перелогиньтесь." },
        { status: 400 }
      );
    }

    const item = await prisma.orderItem.create({
      data: {
        sessionId: id,
        userId: BigInt(session.userId),
        dishName: dishName.trim(),
        price: Math.round(numPrice),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
      },
    });

    return NextResponse.json({
      item: JSON.parse(
        JSON.stringify(item, (_, v) =>
          typeof v === "bigint" ? v.toString() : v
        )
      ),
    });
  } catch (error) {
    console.error("Add item error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/orders/[id]/items - Delete item from order
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    if (!session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");

    if (!itemId) {
      return NextResponse.json(
        { error: "Item ID required" },
        { status: 400 }
      );
    }

    // Verify item belongs to current user and session
    const item = await prisma.orderItem.findFirst({
      where: {
        id: itemId,
        sessionId: id,
        userId: BigInt(session.userId),
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Check session is still open
    const orderSession = await prisma.orderSession.findUnique({
      where: { id },
    });

    if (orderSession?.status !== "OPEN") {
      return NextResponse.json(
        { error: "Сбор заказов уже завершен" },
        { status: 400 }
      );
    }

    await prisma.orderItem.delete({ where: { id: itemId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete item error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
