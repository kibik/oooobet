import { NextRequest, NextResponse } from "next/server";

// TEMPORARY: fixed probes of Yandex Eda for dish ingredients research.
// GET menu/retrieve works from this server IP; POST endpoints are blocked.
// Probing the SSR HTML of the dish card and GET-variants of product API.
const DEBUG_KEY = "79a1ce57626c20a6706c33565e3f0c5a";

const SLUG = "indijskaya_tochka_lva_tolstogo_16_buzad";
const PRODUCT_PUBLIC_ID = "e7524450-6033-4d42-9d2b-622031b22292";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "ru-RU,ru;q=0.9",
};

// Return windows of text around each marker occurrence
function windows(text: string, marker: string, radius = 400): string[] {
  const out: string[] = [];
  let idx = 0;
  while (out.length < 3) {
    idx = text.indexOf(marker, idx);
    if (idx === -1) break;
    out.push(text.slice(Math.max(0, idx - radius), idx + radius));
    idx += marker.length;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("key") !== DEBUG_KEY) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const results: Record<string, unknown> = {};

  // Probe 1: SSR HTML of the restaurant page with the dish card open
  try {
    const res = await fetch(
      `https://eda.yandex.ru/restaurant/${SLUG}?item=${PRODUCT_PUBLIC_ID}`,
      { headers: HEADERS }
    );
    const html = await res.text();
    results["card_html"] = {
      status: res.status,
      length: html.length,
      markers: {
        ingredient: windows(html, "ngredient"),
        sostav: windows(html, "остав"),
        chicken: windows(html, "сливочный соус"),
      },
    };
  } catch (e) {
    results["card_html"] = { error: String(e) };
  }

  // Probe 2: GET variants of the product endpoint
  for (const [name, path] of [
    ["product_get", `/api/v2/menu/product?place_slug=${SLUG}&product_id=${PRODUCT_PUBLIC_ID}`],
    ["retrieve_with_card", `/api/v2/menu/retrieve/${SLUG}?regionId=1&item=${PRODUCT_PUBLIC_ID}`],
  ] as const) {
    try {
      const res = await fetch(`https://eda.yandex.ru${path}`, {
        headers: { ...HEADERS, Accept: "application/json" },
      });
      const text = await res.text();
      results[name] = { status: res.status, snippet: text.slice(0, 500) };
    } catch (e) {
      results[name] = { error: String(e) };
    }
  }

  return NextResponse.json(results);
}
