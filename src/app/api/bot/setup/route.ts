import { NextRequest, NextResponse } from "next/server";
import { getBot } from "@/lib/bot";

// GET /api/bot/setup - Set webhook URL for Telegram bot
// Call this once after deployment or when ngrok URL changes
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get("secret");

    // Simple protection - require bot token as secret param
    if (secret !== process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bot = getBot();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (!baseUrl) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_BASE_URL is not set" },
        { status: 500 }
      );
    }

    const webhookUrl = `${baseUrl}/api/bot`;

    await bot.api.setWebhook(webhookUrl, {
      allowed_updates: ["message"],
    });

    const info = await bot.api.getWebhookInfo();

    return NextResponse.json({
      ok: true,
      webhook: webhookUrl,
      info,
    });
  } catch (error) {
    console.error("Webhook setup error:", error);
    return NextResponse.json(
      { error: "Failed to set webhook" },
      { status: 500 }
    );
  }
}
