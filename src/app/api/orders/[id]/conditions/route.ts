import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { localeFor, translator } from "@/lib/i18n";

// PUT /api/orders/[id]/conditions — the person paying writes the terms everyone
// ordering has to keep in mind (a discount capped per order, a minimum, a code).
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    let t = translator("ru");

    if (!session.userId) {
      return NextResponse.json({ error: t("errAuth") }, { status: 401 });
    }

    const orderSession = await prisma.orderSession.findUnique({
      where: { id },
      select: { adminId: true, currency: true },
    });

    t = translator(localeFor(orderSession?.currency));

    if (!orderSession) {
      return NextResponse.json(
        { error: t("errSessionMissing") },
        { status: 404 }
      );
    }
    if (orderSession.adminId !== BigInt(session.userId)) {
      return NextResponse.json({ error: t("errNotAdmin") }, { status: 403 });
    }

    const body = await req.json();
    const raw =
      typeof body.conditions === "string" ? body.conditions.trim() : "";

    await prisma.orderSession.update({
      where: { id },
      data: { conditions: raw ? raw.slice(0, 300) : null },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update conditions error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
