import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBot } from "@/lib/bot";

// GET /api/avatar/[userId] — proxy Telegram profile photo (keeps bot token secret)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const user = await prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { photoUrl: true, photoFileId: true },
    });

    if (!user) {
      return new NextResponse(null, { status: 404 });
    }

    if (user.photoUrl) {
      return NextResponse.redirect(user.photoUrl);
    }

    if (!user.photoFileId) {
      return new NextResponse(null, { status: 404 });
    }

    const bot = getBot();
    const file = await bot.api.getFile(user.photoFileId);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !file.file_path) {
      return new NextResponse(null, { status: 500 });
    }

    const tgUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const res = await fetch(tgUrl);
    if (!res.ok) {
      return new NextResponse(null, { status: 502 });
    }

    const blob = await res.blob();
    return new NextResponse(blob, {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
      },
    });
  } catch (error) {
    console.error("Avatar proxy error:", error);
    return new NextResponse(null, { status: 500 });
  }
}
