/**
 * Yandex Eda menu parser.
 * Uses the public API: GET https://eda.yandex.ru/api/v2/menu/retrieve/{slug}
 */

export interface MenuOptionChoice {
  name: string;
  price: number;
}

export interface MenuOptionGroup {
  name: string;
  required: boolean;
  minSelected: number;
  maxSelected: number;
  options: MenuOptionChoice[];
}

export interface ParsedMenuItem {
  category: string;
  name: string;
  price: number;
  description: string | null;
  weight: string | null;
  imageUrl: string | null;
  optionGroups: MenuOptionGroup[] | null;
}

interface YandexEdaOption {
  id: number;
  name: string;
  price: number;
  multiplier?: number;
}

interface YandexEdaOptionsGroup {
  id: number;
  name: string;
  options: YandexEdaOption[];
  required?: boolean;
  minSelected?: number;
  maxSelected?: number;
}

// Extra description blocks ("Состав", ...) — only sent when the request
// carries the `x-platform: desktop_web` header.
interface YandexEdaDescription {
  title?: string;
  text?: string;
}

interface YandexEdaItem {
  id: number;
  name: string;
  description?: string;
  descriptions?: YandexEdaDescription[];
  price: number;
  available?: boolean;
  weight?: string;
  picture?: {
    uri: string;
    ratio?: number;
  };
  optionsGroups?: YandexEdaOptionsGroup[];
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
 * Parse option groups (spiciness, sauces, drink choice, ...) into a compact shape.
 */
function parseOptionGroups(
  groups?: YandexEdaOptionsGroup[]
): MenuOptionGroup[] | null {
  if (!groups?.length) return null;

  const parsed = groups
    .filter((g) => g.options?.length)
    .map((g) => ({
      name: g.name,
      required: g.required ?? false,
      minSelected: g.minSelected ?? (g.required ? 1 : 0),
      maxSelected: g.maxSelected ?? g.options.length,
      options: g.options.map((o) => ({
        name: o.name,
        price: Math.round(o.price),
      })),
    }));

  return parsed.length > 0 ? parsed : null;
}

/**
 * Ingredients text from the "Состав" description block, if the restaurant filled it in.
 */
function parseIngredients(
  descriptions?: YandexEdaDescription[]
): string | null {
  if (!descriptions?.length) return null;
  const block =
    descriptions.find((d) => /состав|ingredient/i.test(d.title || "")) ??
    descriptions[0];
  const text = block?.text?.trim();
  return text ? text : null;
}

const API_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  // Without this the API omits the `descriptions` blocks (ingredients)
  "x-platform": "desktop_web",
};

interface BrandPlaceResponse {
  payload?: {
    foundPlace?: { place?: { slug?: string } };
  };
}

/**
 * Links like /moscow/r/{brand} carry a brand slug, and the menu API only knows
 * per-branch place slugs. Resolve brand → place the way the site itself does.
 */
export async function resolvePlaceSlug(
  brandSlug: string,
  regionId: number = 1
): Promise<string | null> {
  const url = `https://eda.yandex.ru/eats/v1/eats-catalog/v2/brand/place?brand_slug=${encodeURIComponent(brandSlug)}&region_id=${regionId}`;

  try {
    const res = await fetch(url, { headers: API_HEADERS });
    if (!res.ok) return null;
    const data: BrandPlaceResponse = await res.json();
    const slug = data?.payload?.foundPlace?.place?.slug;
    return slug && slug !== brandSlug ? slug : null;
  } catch (err) {
    console.error(`Failed to resolve brand slug "${brandSlug}":`, err);
    return null;
  }
}

/**
 * Fetch menu from Yandex Eda API and return parsed items.
 */
export async function fetchMenu(
  slug: string,
  regionId: number = 1,
  allowBrandResolve: boolean = true
): Promise<ParsedMenuItem[]> {
  const url = `https://eda.yandex.ru/api/v2/menu/retrieve/${encodeURIComponent(slug)}?regionId=${regionId}&autoTranslate=false`;

  // A brand slug (from /{city}/r/{brand} links) has no menu of its own —
  // resolve it to a branch and retry once.
  const retryAsBrand = async (): Promise<ParsedMenuItem[]> => {
    if (!allowBrandResolve) return [];
    const placeSlug = await resolvePlaceSlug(slug, regionId);
    if (!placeSlug) return [];
    console.log(`Resolved brand slug "${slug}" to place "${placeSlug}"`);
    return fetchMenu(placeSlug, regionId, false);
  };

  const res = await fetch(url, { headers: API_HEADERS });

  if (!res.ok) {
    const viaBrand = await retryAsBrand();
    if (viaBrand.length > 0) return viaBrand;
    console.error(
      `Yandex Eda API returned ${res.status} for slug "${slug}"`
    );
    return [];
  }

  const data: YandexEdaMenuResponse = await res.json();

  if (!data?.payload?.categories) {
    return retryAsBrand();
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
        description:
          item.description?.trim() || parseIngredients(item.descriptions),
        weight: item.weight || null,
        imageUrl: resolveImageUrl(item.picture),
        optionGroups: parseOptionGroups(item.optionsGroups),
      });
    }
  }

  // An empty menu for a brand slug means the same thing as a 404
  return items.length > 0 ? items : retryAsBrand();
}
