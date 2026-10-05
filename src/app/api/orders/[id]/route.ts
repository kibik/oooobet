import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { money } from "@/lib/money";

function getAvatarUrl(user: { id: bigint; photoUrl: string | null; photoFileId: string | null }): string | null {
  if (user.photoUrl) return user.photoUrl;
  if (user.photoFileId) return `/api/avatar/${user.id}`;
  return null;
}

function serializeSession(session: {
  admin?: { id: bigint; photoUrl: string | null; photoFileId: string | null };
  deliveryFee?: unknown;
  serviceFee?: unknown;
  items?: Array<{
    price?: unknown;
    user?: { id: bigint; photoUrl: string | null; photoFileId: string | null };
  }>;
} & Record<string, unknown>) {
  const withAvatars = {
    ...session,
    // Decimal → number, otherwise the client gets strings and arithmetic breaks
    deliveryFee: money(session.deliveryFee as never),
    serviceFee: money(session.serviceFee as never),
    admin: session.admin
      ? { ...session.admin, avatarUrl: getAvatarUrl(session.admin) }
      : undefined,
    items: session.items?.map((item) => ({
      ...item,
      price: money((item as { price?: never }).price),
      ...(item.user
        ? { user: { ...item.user, avatarUrl: getAvatarUrl(item.user) } }
        : {}),
    })),
  };
  return JSON.parse(
    JSON.stringify(withAvatars, (_, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

// GET /api/orders/[id] - Get order session with items
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    const orderSession = await prisma.orderSession.findUnique({
      where: { id },
      include: {
        admin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            photoUrl: true,
            photoFileId: true,
            phoneNumber: true,
          },
        },
        items: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                username: true,
                photoUrl: true,
                photoFileId: true,
              },
            },
          },
          orderBy: { id: "asc" },
        },
        payments: {
          select: { userId: true, createdAt: true },
        },
        participants: {
          select: { userId: true, readyAt: true },
        },
      },
    });

    if (!orderSession) {
      return NextResponse.json(
        { error: "Order session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      session: serializeSession(orderSession),
      currentUserId: session.userId || null,
    });
  } catch (error) {
    console.error("Get order error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
