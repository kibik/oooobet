import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// Serialize BigInt values for JSON
function serializeSession(session: Record<string, unknown>) {
  return JSON.parse(
    JSON.stringify(session, (_, value) =>
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
