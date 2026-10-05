/**
 * Deliveroo (UAE).
 *
 * Deliveroo renders the menu into the page itself, so there is no JSON API to
 * call: dish names and prices live in the cards' `aria-label`, which is
 * accessibility markup and changes far less often than the obfuscated class
 * names around it. Dish photos are lazy-loaded and simply aren't in the HTML.
 *
 * The menu and the delivery fee depend on where the food is going, so every
 * request carries our own geohash rather than whatever was in the pasted link.
 */

import type { Provider, ProviderMenu } from "./types";

/** Santorini, DAMAC Lagoons — the address everything is delivered to. */
export const DEFAULT_GEOHASH = "thrq2c6gr090";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept-Language": "en",
};

const REQUEST_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3;

function decodeEntities(value: string): string {
  return value
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Point the link at our delivery address, keeping the restaurant path. */
export function normalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (!/(^|\.)deliveroo\.ae$/.test(url.hostname)) return null;
    if (!/\/menu\//.test(url.pathname)) return null;

    url.search = "";
    url.searchParams.set("day", "today");
    url.searchParams.set("time", "ASAP");
    url.searchParams.set("fulfillment_method", "DELIVERY");
    url.searchParams.set("geohash", DEFAULT_GEOHASH);
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: controller.signal,
      });
      if (res.ok) {
        const html = await res.text();
        // Cloudflare answers 200 with an interstitial when it wants a browser
        if (/Just a moment|cf-browser-verification|__cf_chl/i.test(html.slice(0, 4000))) {
          console.error("Deliveroo: Cloudflare challenge — меню не отдано");
          return null;
        }
        return html;
      }
      if (res.status === 404) return null;
      if (res.status === 403) {
        // Rate-limited or flagged: retrying immediately only digs the hole
        console.error("Deliveroo: 403 (Cloudflare) — попробуем позже");
        return null;
      }
      console.error(`Deliveroo: HTTP ${res.status} (попытка ${attempt})`);
    } catch (err) {
      console.error(
        `Deliveroo: ${err instanceof Error ? err.name : String(err)} (попытка ${attempt})`
      );
    } finally {
      clearTimeout(timer);
    }
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  return null;
}

export function parseMenuHtml(html: string): ProviderMenu {
  // Section headings, in page order
  const sections = [...html.matchAll(/<h2[^>]*>([^<]{2,80})<\/h2>/g)].map((m) => ({
    name: decodeEntities(m[1]),
    at: m.index ?? 0,
  }));

  // aria-label is either "Dish, AED 49" or "Dish, long description…, AED 49",
  // so the label must not be length-capped: dishes that carry a description
  // would silently drop out of the menu.
  const cards = [...html.matchAll(/aria-label="([^"]+?),\s*AED\s*([\d.]+)"/g)].map(
    (m) => {
      const at = m.index ?? 0;
      const section = [...sections].reverse().find((s) => s.at < at);
      const label = decodeEntities(m[1]);
      const comma = label.indexOf(", ");
      const hasDescription = comma > 0 && label.length - comma > 12;
      return {
        category: section?.name || "Меню",
        categoryOrder: section ? sections.indexOf(section) : 0,
        name: hasDescription ? label.slice(0, comma).trim() : label,
        description: hasDescription
          ? label.slice(comma + 2).replace(/\.$/, "").trim()
          : null,
        price: Number(m[2]),
      };
    }
  );

  // A dish appears twice when it is also featured in "Popular with other
  // people" — keep the one filed under its real category.
  const isFeatured = (category: string) => /popular|featured/i.test(category);
  const byKey = new Map<string, (typeof cards)[number]>();
  for (const card of cards) {
    if (!card.name || !Number.isFinite(card.price) || card.price <= 0) continue;
    const key = `${card.name}__${card.price}`;
    const existing = byKey.get(key);
    if (!existing || (isFeatured(existing.category) && !isFeatured(card.category))) {
      byKey.set(key, card);
    }
  }

  const items = [...byKey.values()].map((card) => ({
    category: card.category,
    categoryOrder: card.categoryOrder,
    name: card.name,
    price: card.price,
    description: card.description,
    weight: null,
    imageUrl: null, // Deliveroo lazy-loads dish photos; they are not in the HTML
    optionGroups: null,
  }));

  const title =
    html.match(/property="og:title"\s+content="([^"]+)"/)?.[1] ??
    html.match(/<h1[^>]*>([\s\S]{0,120}?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, "") ??
    "";
  const cleanTitle = decodeEntities(title).replace(/\s+on Deliveroo$/i, "");
  const [placeName, area] = cleanTitle.split(" - ").map((p) => p?.trim());

  const deliveryFee = html.match(/AED\s?([\d.]+)\s*delivery/i)?.[1];
  const minimumOrder = html.match(/AED\s?([\d.]+)\s*minimum/i)?.[1];

  return {
    items,
    placeName: placeName || null,
    placeAddress: area || null,
    deliveryFee: deliveryFee ? Number(deliveryFee) : null,
    minimumOrder: minimumOrder ? Number(minimumOrder) : null,
  };
}

export const deliveroo: Provider = {
  id: "deliveroo",
  title: "Deliveroo",
  currency: "AED",
  timeZone: "Asia/Dubai",

  matches(url) {
    try {
      return /(^|\.)deliveroo\.ae$/.test(new URL(url).hostname);
    } catch {
      return false;
    }
  },

  placeKey(url) {
    try {
      // /en/menu/Dubai/motor-city/high-joint-dm/ → high-joint-dm
      const parts = new URL(url).pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || null;
    } catch {
      return null;
    }
  },

  async fetchMenu(url) {
    const target = normalizeUrl(url);
    if (!target) return { items: [] };
    const html = await fetchHtml(target);
    if (!html) return { items: [] };
    return parseMenuHtml(html);
  },
};
