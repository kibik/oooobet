import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { parseSlug, fetchMenu } from "@/lib/yandex-eda";

// Sessions whose menu we already tried to enrich in this process — menus cached
// before ingredients parsing existed have no descriptions, so we refetch once.
const backfillAttempted = new Set<string>();

/**
 * Refetch the menu from Yandex Eda for a session whose cached menu is empty
 * (the link was a brand slug the parser couldn't resolve yet) or predates the
 * descriptions/options fields. Existing rows are matched by name.
 */
async function backfillMenu(sessionId: string): Promise<void> {
  const session = await prisma.orderSession.findUnique({
    where: { id: sessionId },
    select: { url: true },
  });
  const slug = session?.url ? parseSlug(session.url) : null;
  if (!slug) return;

  const fresh = await fetchMenu(slug);
  if (fresh.length === 0) return;

  const cachedCount = await prisma.menuItem.count({ where: { sessionId } });

  // Nothing cached at all — store the whole menu
  if (cachedCount === 0) {
    await prisma.menuItem.createMany({
      data: fresh.map((item) => ({
        sessionId,
        category: item.category,
        name: item.name,
        price: item.price,
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
    select: { id: true, name: true },
  });

  await Promise.all(
    cached.map((row) => {
      const match = byName.get(row.name);
      if (!match?.description && !match?.optionGroups) return null;
      return prisma.menuItem.update({
        where: { id: row.id },
        data: {
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

// GET /api/orders/[id]/menu - Get cached menu items grouped by category
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let menuItems = await prisma.menuItem.findMany({
      where: { sessionId: id },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    const needsBackfill =
      menuItems.length === 0 || !menuItems.some((item) => item.description);

    if (needsBackfill && !backfillAttempted.has(id)) {
      backfillAttempted.add(id);
      try {
        await backfillMenu(id);
        menuItems = await prisma.menuItem.findMany({
          where: { sessionId: id },
          orderBy: [{ category: "asc" }, { name: "asc" }],
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
        price: item.price,
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
