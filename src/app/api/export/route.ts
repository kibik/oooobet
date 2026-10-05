import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { money, roundIn } from "@/lib/money";
import { detectProvider } from "@/lib/providers";

/**
 * Raw order data as CSV, one row per dish.
 *
 * A Google Sheet pulls this with IMPORTDATA and does the summing there, so the
 * team gets a living table without us holding Google credentials. The link
 * carries a secret because it exposes who owes whom.
 */

export const dynamic = "force-dynamic";

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(req: NextRequest) {
  const expected = process.env.EXPORT_KEY;
  const given = new URL(req.url).searchParams.get("key");

  if (!expected || given !== expected) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sessions = await prisma.orderSession.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      admin: { select: { firstName: true, lastName: true } },
      items: {
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { id: "asc" },
      },
      payments: { select: { userId: true } },
    },
  });

  const header = [
    "Дата",
    "Время",
    "Заказ",
    "Ресторан",
    "Филиал",
    "Валюта",
    "Статус",
    "Платил",
    "Участник",
    "Блюдо",
    "Опции",
    "Цена",
    "Скидка %",
    "Цена со скидкой",
    "Доля доставки и сборов",
    "Итого с человека",
    "Отметил перевод",
  ];

  const rows: string[] = [header.map(csvCell).join(",")];

  for (const session of sessions) {
    const timeZone =
      detectProvider(session.url)?.timeZone ?? "Europe/Moscow";
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(session.createdAt);
    const time = new Intl.DateTimeFormat("ru-RU", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(session.createdAt);

    const currency = session.currency;
    const discountMult = 1 - session.discountPercent / 100;
    const paid = new Set(session.payments.map((p) => p.userId.toString()));

    // Delivery and service fees are split evenly between everyone who ordered
    const eaters = new Set(session.items.map((i) => i.userId.toString()));
    const extraPerPerson =
      eaters.size > 0
        ? (money(session.deliveryFee) + money(session.serviceFee)) / eaters.size
        : 0;

    // How much each person owes in total, so the per-dish rows can carry it
    const totals = new Map<string, number>();
    for (const item of session.items) {
      const key = item.userId.toString();
      totals.set(key, (totals.get(key) ?? 0) + money(item.price) * discountMult);
    }

    const seenPerson = new Set<string>();

    for (const item of session.items) {
      const key = item.userId.toString();
      const price = money(item.price);
      // The person's share and total belong on their first row only, so sums
      // in the sheet don't double-count someone who ordered three dishes.
      const firstRow = !seenPerson.has(key);
      seenPerson.add(key);

      rows.push(
        [
          date,
          time,
          session.id,
          session.placeName ?? "",
          session.placeAddress ?? "",
          currency,
          session.status,
          [session.admin.firstName, session.admin.lastName]
            .filter(Boolean)
            .join(" "),
          [item.user.firstName, item.user.lastName].filter(Boolean).join(" "),
          item.dishName,
          item.options ?? "",
          roundIn(price, currency),
          session.discountPercent,
          roundIn(price * discountMult, currency),
          firstRow ? roundIn(extraPerPerson, currency) : "",
          firstRow
            ? roundIn((totals.get(key) ?? 0) + extraPerPerson, currency)
            : "",
          firstRow ? (paid.has(key) ? "да" : "нет") : "",
        ]
          .map(csvCell)
          .join(",")
      );
    }
  }

  // BOM so Google Sheets and Excel read Cyrillic correctly
  return new NextResponse("﻿" + rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
