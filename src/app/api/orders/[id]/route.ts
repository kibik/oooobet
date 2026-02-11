import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function getAvatarUrl(user: { id: bigint; photoUrl: string | null; photoFileId: string | null }): string | null {
  if (user.photoUrl) return user.photoUrl;
  if (user.photoFileId) return `/api/avatar/${user.id}`;
  return null;
}

function serializeSession(session: {
  admin?: { id: bigint; photoUrl: string | null; photoFileId: string | null };
  items?: Array<{ user?: { id: bigint; photoUrl: string | null; photoFileId: string | null } }>;
} & Record<string, unknown>) {
  const withAvatars = {
    ...session,
    admin: session.admin
      ? { ...session.admin, avatarUrl: getAvatarUrl(session.admin) }
      : undefined,
    items: session.items?.map((item) =>
      item.user
        ? { ...item, user: { ...item.user, avatarUrl: getAvatarUrl(item.user) } }
        : item
    ),
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
