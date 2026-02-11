import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// POST /api/user/phone - Update user's phone number
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { phoneNumber } = body;

    if (!phoneNumber || typeof phoneNumber !== "string") {
      return NextResponse.json(
        { error: "Укажите номер телефона" },
        { status: 400 }
      );
    }

    // Basic phone validation (Russian numbers)
    const cleaned = phoneNumber.replace(/\D/g, "");
    if (cleaned.length < 10 || cleaned.length > 12) {
      return NextResponse.json(
        { error: "Некорректный номер телефона" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: BigInt(session.userId) },
      data: { phoneNumber: cleaned },
    });

    return NextResponse.json({ ok: true, phoneNumber: cleaned });
  } catch (error) {
    console.error("Phone update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
