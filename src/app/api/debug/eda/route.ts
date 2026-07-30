import { NextRequest, NextResponse } from "next/server";

// TEMPORARY: fixed probes of Yandex Eda product-card endpoints (local IP is
// blocked by their antibot, server IP is not). Remove after research.
const DEBUG_KEY = "79a1ce57626c20a6706c33565e3f0c5a";

const SLUG = "indijskaya_tochka_lva_tolstogo_16_buzad";
const PRODUCT_NUM_ID = 5000000007638847;
const PRODUCT_PUBLIC_ID = "e7524450-6033-4d42-9d2b-622031b22292";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function tryFetch(
  path: string,
  body?: unknown
): Promise<{ status: number; snippet: string }> {
  try {
    const res = await fetch(`https://eda.yandex.ru${path}`, {
      method: body ? "POST" : "GET",
      headers: HEADERS,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    return { status: res.status, snippet: text.slice(0, 3000) };
  } catch (e) {
    return { status: -1, snippet: String(e) };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("key") !== DEBUG_KEY) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const results: Record<string, { status: number; snippet: string }> = {};

  results["goods"] = await tryFetch("/api/v2/menu/goods", { slug: SLUG });
  results["product_num"] = await tryFetch("/api/v2/menu/product", {
    place_slug: SLUG,
    product_id: PRODUCT_NUM_ID,
  });
  results["product_public"] = await tryFetch("/api/v2/menu/product", {
    place_slug: SLUG,
    product_id: PRODUCT_PUBLIC_ID,
  });

  return NextResponse.json(results);
}
