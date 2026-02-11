/**
 * Yandex Eda menu parser.
 * Uses the public API: GET https://eda.yandex.ru/api/v2/menu/retrieve/{slug}
 */

export interface ParsedMenuItem {
  category: string;
  name: string;
  price: number;
  description: string | null;
  weight: string | null;
  imageUrl: string | null;
}

interface YandexEdaItem {
  id: number;
  name: string;
  description?: string;
  price: number;
  available?: boolean;
  weight?: string;
  picture?: {
    uri: string;
    ratio?: number;
  };
}

interface YandexEdaCategory {
  id: number;
  name: string;
  available?: boolean;
  items: YandexEdaItem[];
}

interface YandexEdaMenuResponse {
  payload: {
    categories: YandexEdaCategory[];
  };
}

/**
 * Extract restaurant slug from a Yandex Eda URL.
 *
 * Priority: placeSlug query param > pathname slug
 *
 * Supported formats:
 *   https://eda.yandex.ru/moscow/r/kfc
 *   https://eda.yandex.ru/restaurant/kfc_leninskiy
 *   https://eda.yandex.ru/r/mnogo_lososya?placeSlug=mnogo_lososya_novinskij_bulvar_7
 *   https://eda.yandex.ru/spb/r/mcdonalds?some=param
 *
 * The placeSlug query parameter contains the specific branch slug
 * which returns the full menu for that location (correct prices & items).
 * The pathname slug is a generic brand slug that may return a reduced menu.
 */
export function parseSlug(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Priority 1: placeSlug query param (specific branch with correct menu)
    const placeSlug = parsed.searchParams.get("placeSlug");
    if (placeSlug) return placeSlug;

    // Priority 2: /restaurant/{slug}
    const restaurantMatch = parsed.pathname.match(/\/restaurant\/([^/?]+)/);
    if (restaurantMatch) return restaurantMatch[1];

    // Priority 3: /{city}/r/{slug}
    const cityMatch = parsed.pathname.match(/\/[^/]+\/r\/([^/?]+)/);
    if (cityMatch) return cityMatch[1];

    // Priority 4: /r/{slug} (without city)
    const directMatch = parsed.pathname.match(/\/r\/([^/?]+)/);
    if (directMatch) return directMatch[1];

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve image URL from Yandex Eda template URI.
 * Template: /images/{bucket}/{hash}-{w}x{h}.jpeg
 * We request 200x200 thumbnails.
 */
function resolveImageUrl(picture?: { uri: string }): string | null {
  if (!picture?.uri) return null;
  const sized = picture.uri.replace("{w}", "200").replace("{h}", "200");
  return `https://eda.yandex${sized}`;
}

/**
 * Fetch menu from Yandex Eda API and return parsed items.
 */
export async function fetchMenu(
  slug: string,
  regionId: number = 1
): Promise<ParsedMenuItem[]> {
  const url = `https://eda.yandex.ru/api/v2/menu/retrieve/${encodeURIComponent(slug)}?regionId=${regionId}&autoTranslate=false`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    console.error(
      `Yandex Eda API returned ${res.status} for slug "${slug}"`
    );
    return [];
  }

  const data: YandexEdaMenuResponse = await res.json();

  if (!data?.payload?.categories) {
    return [];
  }

  const items: ParsedMenuItem[] = [];

  for (const category of data.payload.categories) {
    if (!category.items) continue;

    for (const item of category.items) {
      // Skip unavailable items
      if (item.available === false) continue;

      items.push({
        category: category.name,
        name: item.name,
        price: Math.round(item.price),
        description: item.description || null,
        weight: item.weight || null,
        imageUrl: resolveImageUrl(item.picture),
      });
    }
  }

  return items;
}
