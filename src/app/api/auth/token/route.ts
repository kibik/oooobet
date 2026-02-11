import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

// GET /api/auth/token — debug: check DB connection and AuthToken table (remove in prod later if needed)
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await prisma.authToken.count();
    return NextResponse.json({ ok: true, message: "DB and AuthToken table OK" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error && typeof (error as { code?: string }).code === "string" ? (error as { code: string }).code : undefined;
    console.error("Auth token health check error:", message, code, error);
    return NextResponse.json(
      { ok: false, error: message, code: code ?? null },
      { status: 500 }
    );
  }
}

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
    const message = error instanceof Error ? error.message : String(error);
    const code = error && typeof (error as { code?: string }).code === "string" ? (error as { code: string }).code : undefined;
    console.error("Create auth token error:", message, code ?? "", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        ...(process.env.NODE_ENV === "development" && { detail: message }),
        ...(code && { code }),
      },
      { status: 500 }
    );
  }
}
