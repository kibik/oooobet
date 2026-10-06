import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { parseSlug, fetchMenu, fetchPlaceInfo } from "@/lib/yandex-eda";
import { detectProvider } from "@/lib/providers";
import { money } from "@/lib/money";

// When we last tried to (re)load a session's menu in this process. Menus cached
// before ingredients parsing have no descriptions, and a menu can be missing
// entirely if Yandex was unreachable when the order was created — so retry, but
// no more often than this to avoid hammering the API on every page poll.
const lastBackfillAt = new Map<string, number>();
const BACKFILL_COOLDOWN_MS = 60_000;

function shouldTryBackfill(sessionId: string): boolean {
  const last = lastBackfillAt.get(sessionId);
  return last === undefined || Date.now() - last > BACKFILL_COOLDOWN_MS;
}

/**
 * Refetch the menu from Yandex Eda for a session whose cached menu is empty
 * (the link was a brand slug the parser couldn't resolve yet) or predates the
 * descriptions/options fields. Existing rows are matched by name.
 */
async function backfillMenu(sessionId: string): Promise<void> {
  const session = await prisma.orderSession.findUnique({
    where: { id: sessionId },
    select: { url: true, placeSlug: true },
  });
  if (!session) return;

  // Ask the service the link belongs to; the Yandex parser knows nothing
  // about Deliveroo or Talabat pages.
  const provider = detectProvider(session.url);
  const slug = session.placeSlug || parseSlug(session.url);

  let fresh;
  if (provider && provider.id !== "yandex") {
    fresh = (await provider.fetchMenu(session.url)).items;
  } else {
    if (!slug) return;
    fresh = await fetchMenu(slug, 1, true, session.url);
  }
  if (fresh.length === 0) return;

  const cachedCount = await prisma.menuItem.count({ where: { sessionId } });

  // Nothing cached, or a menu we stored only part of — write the whole thing
  if (cachedCount === 0 || fresh.length > cachedCount) {
    await prisma.menuItem.deleteMany({ where: { sessionId } });
    await prisma.menuItem.createMany({
      data: fresh.map((item) => ({
        sessionId,
        category: item.category,
        categoryOrder: item.categoryOrder,
        name: item.name,
        price: money(item.price),
        oldPrice: item.oldPrice ?? null,
        priceOnSelection: item.priceOnSelection ?? false,
        description: item.description,
        weight: item.weight,
        imageUrl: item.imageUrl,
        optionsJson: item.optionGroups
          ? (JSON.parse(
              JSON.stringify(item.optionGroups)
            ) as Prisma.InputJsonValue)
          : undefined,
      })),
    });
    return;
  }

  const byName = new Map(fresh.map((item) => [item.name, item]));
  const cached = await prisma.menuItem.findMany({
    where: { sessionId },
    select: { id: true, name: true, categoryOrder: true },
  });

  await Promise.all(
    cached.map((row) => {
      const match = byName.get(row.name);
      if (!match) return null;
      const needsOrder = row.categoryOrder !== match.categoryOrder;
      if (!match.description && !match.optionGroups && !needsOrder) return null;
      return prisma.menuItem.update({
        where: { id: row.id },
        data: {
          ...(needsOrder ? { categoryOrder: match.categoryOrder } : {}),
          ...(match.description ? { description: match.description } : {}),
          ...(match.optionGroups
            ? {
                optionsJson: JSON.parse(
                  JSON.stringify(match.optionGroups)
                ) as Prisma.InputJsonValue,
              }
            : {}),
        },
      });
    })
  );
}

/** Fill in the branch name/address for orders created before we stored them. */
async function backfillPlaceInfo(sessionId: string): Promise<void> {
  const session = await prisma.orderSession.findUnique({
    where: { id: sessionId },
    select: { url: true, placeSlug: true, placeName: true },
  });
  if (!session || session.placeName) return;

  const slug = session.placeSlug || parseSlug(session.url);
  if (!slug) return;

  const info = await fetchPlaceInfo(slug);
  if (!info) return;

  await prisma.orderSession.update({
    where: { id: sessionId },
    data: {
      placeSlug: slug,
      placeName: info.name,
      placeAddress: info.address || null,
    },
  });
}

// GET /api/orders/[id]/menu - Get cached menu items grouped by category
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let menuItems = await prisma.menuItem.findMany({
      where: { sessionId: id },
      orderBy: [{ categoryOrder: "asc" }, { category: "asc" }, { name: "asc" }],
    });

    const needsBackfill =
      menuItems.length === 0 ||
      !menuItems.some((item) => item.description) ||
      menuItems.every((item) => item.categoryOrder === 0);

    if (needsBackfill && shouldTryBackfill(id)) {
      lastBackfillAt.set(id, Date.now());
      try {
        await backfillPlaceInfo(id);
        await backfillMenu(id);
        menuItems = await prisma.menuItem.findMany({
          where: { sessionId: id },
          orderBy: [{ categoryOrder: "asc" }, { category: "asc" }, { name: "asc" }],
        });
      } catch (err) {
        console.error("Menu backfill failed for session", id, err);
      }
    }

    // Group by category
    const categories: Record<
      string,
      Array<{
        id: string;
        name: string;
        price: number;
        oldPrice: number | null;
        priceOnSelection: boolean;
        description: string | null;
        weight: string | null;
        imageUrl: string | null;
        optionGroups: unknown;
      }>
    > = {};

    for (const item of menuItems) {
      if (!categories[item.category]) {
        categories[item.category] = [];
      }
      categories[item.category].push({
        id: item.id,
        name: item.name,
        price: money(item.price),
        oldPrice: item.oldPrice == null ? null : money(item.oldPrice),
        priceOnSelection: item.priceOnSelection,
        description: item.description,
        weight: item.weight,
        imageUrl: item.imageUrl,
        optionGroups: item.optionsJson ?? null,
      });
    }

    return NextResponse.json({
      categories,
      total: menuItems.length,
    });
  } catch (error) {
    console.error("Get menu error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
