import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/orders/[id]/menu - Get cached menu items grouped by category
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const menuItems = await prisma.menuItem.findMany({
      where: { sessionId: id },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

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
