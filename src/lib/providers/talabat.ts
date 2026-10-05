/**
 * Talabat (UAE).
 *
 * A Talabat brand page ("/uae/skinny-slice") shows no dishes: the menu belongs
 * to a branch and appears only once a delivery area is chosen. The area, it
 * turns out, can be named in the URL — "/uae/restaurant/{branchId}/{slug}?aid=
 * {areaId}" renders the full menu server-side, and the brand page gives the
 * branch id away as `vendorId`.
 *
 * Both pages carry everything we need inside __NEXT_DATA__, so one fetch each
 * gives names, descriptions, prices, photos and sections.
 */

import type { Provider, ProviderMenu, ParsedMenuItem } from "./types";

/** Santorini, DAMAC Lagoons — confirmed on Talabat's own map. */
export const DELIVERY_POINT = { lat: 25.0164324, lng: 55.2448055 };

/**
 * Talabat has no area for DAMAC Lagoons itself; Damac Hills is the one it
 * delivers to that covers the villa. Its areas come from
 * /nextLocationApi/location/country-areas/4.
 */
export const DELIVERY_AREA_ID = 8909;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept-Language": "en",
};

interface BrandVenue {
  name?: string;
  branchSlug?: string;
  restaurantSlug?: string;
  cuisineString?: string;
  /** The branch id the menu page is addressed by */
  vendorId?: number;
}

interface TalabatItem {
  name?: string;
  description?: string;
  price?: number;
  /** Price before the discount, or -1 when the dish is not on offer */
  oldPrice?: number;
  originalImage?: string | null;
  image?: string | null;
}

interface TalabatCategory {
  name?: string;
  items?: TalabatItem[];
}

interface TalabatRestaurant {
  name?: string;
  branchName?: string;
  areaName?: string;
  deliveryFee?: string | number;
  minimumOrderAmount?: number;
}

function nextData(html: string): unknown | null {
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function brandVenue(html: string): BrandVenue | null {
  const data = nextData(html) as
    | { props?: { pageProps?: { data?: BrandVenue } } }
    | null;
  return data?.props?.pageProps?.data ?? null;
}

export function parseBrandPage(html: string): {
  placeName: string | null;
  placeAddress: string | null;
} {
  const venue = brandVenue(html);
  return {
    placeName: venue?.name ?? null,
    // The brand page has no branch address; the cuisine is the only extra
    // context it offers, and it reads fine under the name
    placeAddress: venue?.cuisineString ?? null,
  };
}

/** Turn a menu page into dishes, keeping Talabat's own section order. */
export function parseMenuPage(html: string): ProviderMenu {
  const data = nextData(html) as
    | {
        props?: {
          pageProps?: {
            initialMenuState?: {
              restaurant?: TalabatRestaurant;
              menuData?: { categories?: TalabatCategory[] };
            };
          };
        };
      }
    | null;

  const state = data?.props?.pageProps?.initialMenuState;
  const restaurant = state?.restaurant;
  const categories = state?.menuData?.categories ?? [];

  // "Picks for you" is a shuffled shortcut to dishes listed further down.
  // "Offers" is not: it holds the same dishes at discounted prices, and
  // Talabat shows it as its own section, so we keep both — dropping repeats
  // across sections once collapsed whole menus into "Offers".
  const items: ParsedMenuItem[] = [];
  let order = 0;

  for (const category of categories) {
    const section = category.name?.trim();
    if (!section || section.startsWith("Picks for you")) continue;

    // Talabat prefixes many of its sections with a letter, as in "S-Pizza"
    const title = section.replace(/^[A-Za-z]-/, "");
    const categoryOrder = order++;
    const seen = new Set<string>();

    for (const raw of category.items ?? []) {
      const name = raw.name?.trim();
      const price = Number(raw.price);
      if (!name || !Number.isFinite(price) || price <= 0) continue;
      if (seen.has(name)) continue;
      seen.add(name);

      const oldPrice = Number(raw.oldPrice);

      items.push({
        name,
        price,
        oldPrice:
          Number.isFinite(oldPrice) && oldPrice > price ? oldPrice : null,
        category: title,
        categoryOrder,
        description:
          raw.description?.replace(/\s*\r?\n\s*/g, " ").trim() || null,
        weight: null,
        imageUrl: raw.originalImage || raw.image?.split("?")[0] || null,
        optionGroups: null,
      });
    }
  }

  const deliveryFee = Number(restaurant?.deliveryFee);

  return {
    items,
    placeName: restaurant?.name ?? null,
    placeAddress: restaurant?.areaName || restaurant?.branchName || null,
    deliveryFee: Number.isFinite(deliveryFee) ? deliveryFee : null,
    minimumOrder: restaurant?.minimumOrderAmount || null,
  };
}

async function get(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) {
      console.error(`Talabat: HTTP ${res.status} на ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.error("Talabat: не удалось прочитать страницу", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Address of the menu page for a branch, delivering to our area. */
export function menuUrl(branchId: number, slug: string): string {
  return `https://www.talabat.com/uae/restaurant/${branchId}/${slug}?aid=${DELIVERY_AREA_ID}`;
}

export const talabat: Provider = {
  id: "talabat",
  title: "Talabat",
  currency: "AED",
  timeZone: "Asia/Dubai",

  matches(url) {
    try {
      return /(^|\.)talabat\.com$/.test(new URL(url).hostname);
    } catch {
      return false;
    }
  },

  placeKey(url) {
    try {
      // /uae/skinny-slice → skinny-slice; /uae/restaurant/<id>/<slug> → <slug>
      const parts = new URL(url).pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || null;
    } catch {
      return null;
    }
  },

  async fetchMenu(url) {
    const empty: ProviderMenu = { items: [] };

    let menuPage: string | null = null;

    // A menu link can be pasted directly; point it at our area either way.
    const direct = url.match(/\/uae\/restaurant\/(\d+)\/([^/?#]+)/);
    if (direct) {
      menuPage = await get(menuUrl(Number(direct[1]), direct[2]));
    } else {
      const brandPage = await get(url);
      if (!brandPage) return empty;

      const venue = brandVenue(brandPage);
      const branchId = venue?.vendorId;
      const slug = venue?.branchSlug || venue?.restaurantSlug;

      if (!branchId || !slug) {
        // Still worth opening the order with the venue's name on it
        const { placeName, placeAddress } = parseBrandPage(brandPage);
        return { items: [], placeName, placeAddress };
      }

      menuPage = await get(menuUrl(branchId, slug));
      if (!menuPage) {
        const { placeName, placeAddress } = parseBrandPage(brandPage);
        return { items: [], placeName, placeAddress };
      }
    }

    if (!menuPage) return empty;
    return parseMenuPage(menuPage);
  },
};
