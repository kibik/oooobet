import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

// POST /api/auth/token — create a new auth token for bot-based login
export async function POST() {
  try {
    const token = randomBytes(16).toString("hex");

    await prisma.authToken.create({
      data: { token },
    });

    // Clean up old unconfirmed tokens (older than 10 min)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    await prisma.authToken.deleteMany({
      where: {
        confirmed: false,
        createdAt: { lt: tenMinAgo },
      },
    });

    return NextResponse.json({ token });
  } catch (error) {
    console.error("Create auth token error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
