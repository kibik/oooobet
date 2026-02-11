import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// GET /api/auth/token/[token] — poll to check if token was confirmed via bot
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const authToken = await prisma.authToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!authToken) {
      return NextResponse.json({ confirmed: false, expired: true });
    }

    // Token older than 5 minutes — expired
    const age = Date.now() - authToken.createdAt.getTime();
    if (age > 5 * 60 * 1000) {
      await prisma.authToken.delete({ where: { id: authToken.id } });
      return NextResponse.json({ confirmed: false, expired: true });
    }

    if (!authToken.confirmed || !authToken.user) {
      return NextResponse.json({ confirmed: false, expired: false });
    }

    // Token confirmed — create session
    const user = authToken.user;
    const session = await getSession();
    session.userId = user.id.toString();
    session.firstName = user.firstName;
    session.lastName = user.lastName || undefined;
    session.username = user.username || undefined;
    session.photoUrl = user.photoUrl || undefined;
    await session.save();

    // Clean up used token
    await prisma.authToken.delete({ where: { id: authToken.id } });

    return NextResponse.json({ confirmed: true });
  } catch (error) {
    console.error("Check auth token error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
