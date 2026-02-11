import { NextRequest, NextResponse } from "next/server";
import { verifyTelegramAuth, TelegramUser } from "@/lib/telegram";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body: TelegramUser = await req.json();

    // Verify Telegram auth data
    if (!verifyTelegramAuth(body)) {
      return NextResponse.json(
        { error: "Invalid Telegram authorization" },
        { status: 401 }
      );
    }

    // Check auth_date is not too old (allow 1 day)
    const now = Math.floor(Date.now() / 1000);
    if (now - body.auth_date > 86400) {
      return NextResponse.json(
        { error: "Authorization expired" },
        { status: 401 }
      );
    }

    // Upsert user in database
    await prisma.user.upsert({
      where: { id: BigInt(body.id) },
      update: {
        firstName: body.first_name,
        lastName: body.last_name || null,
        username: body.username || null,
        photoUrl: body.photo_url || null,
      },
      create: {
        id: BigInt(body.id),
        firstName: body.first_name,
        lastName: body.last_name || null,
        username: body.username || null,
        photoUrl: body.photo_url || null,
      },
    });

    // Set session
    const session = await getSession();
    session.userId = body.id.toString();
    session.firstName = body.first_name;
    session.lastName = body.last_name;
    session.username = body.username;
    session.photoUrl = body.photo_url;
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Auth callback error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
