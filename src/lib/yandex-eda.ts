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
  categoryOrder: number; // keep Yandex's own category order, not alphabetical
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
 * True when the link points at a brand rather than a specific branch, i.e.
 * /{city}/r/{brand} without ?placeSlug — several branches may match it, each
 * with its own menu and prices.
 */
export function isBrandLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get("placeSlug")) return false;
    return !/\/restaurant\//.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** City name in the URL → centre + bounds of the grid probed for branches. */
const CITY_GRIDS: Record<
  string,
  { centre: [number, number]; lat: [number, number]; lon: [number, number] }
> = {
  moscow: { centre: [55.7558, 37.6173], lat: [55.58, 55.89], lon: [37.4, 37.83] },
  spb: { centre: [59.9343, 30.3351], lat: [59.85, 60.02], lon: [30.2, 30.5] },
  "saint-petersburg": { centre: [59.9343, 30.3351], lat: [59.85, 60.02], lon: [30.2, 30.5] },
  ekaterinburg: { centre: [56.8389, 60.6057], lat: [56.75, 56.9], lon: [60.5, 60.7] },
  kazan: { centre: [55.7963, 49.1088], lat: [55.72, 55.85], lon: [49.05, 49.25] },
  novosibirsk: { centre: [55.0084, 82.9357], lat: [54.96, 55.1], lon: [82.85, 83.05] },
  "nizhny-novgorod": { centre: [56.3269, 44.0059], lat: [56.23, 56.35], lon: [43.85, 44.05] },
  sochi: { centre: [43.5855, 39.7231], lat: [43.55, 43.65], lon: [39.7, 39.78] },
};

/** Centre of the city mentioned in the link, for city-aware brand resolution. */
export function cityCentreFromUrl(
  url: string
): { lat: number; lon: number } | null {
  const city = cityFromUrl(url);
  const grid = city ? CITY_GRIDS[city] : undefined;
  if (!grid) return null;
  return { lat: grid.centre[0], lon: grid.centre[1] };
}

function cityFromUrl(url: string): string | null {
  try {
    const m = new URL(url).pathname.match(/^\/([a-z-]+)\/r\//);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export interface BrandPlace {
  slug: string;
  name: string;
  address: string;
  lat?: number;
  lon?: number;
}

/**
 * Yandex addresses arrive noisy and sometimes self-repeating, e.g.
 * "Красногорск, Российская Федерация, Москва, Красногорск, Россия, Московская
 * область, Красногорск, Международная улица, 12". Keep the last meaningful
 * parts (street + building), prefixed by the town when it isn't the region's
 * capital, and drop duplicates.
 */
export function normalizeAddress(raw: string | undefined): string {
  if (!raw) return "";

  const noise = /^(росси[яи]|российская федерация|[а-яё\s-]*область|[а-яё\s-]*край|г\.?)$/i;
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const chunk of raw.split(",")) {
    const part = chunk.trim();
    if (!part || noise.test(part)) continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }

  // Drop the regional capital (the order is placed there anyway) but keep a
  // suburb's name — "Красногорск, Международная улица, 12" must stay distinct.
  const capital = /^(москва|санкт-петербург|московская|ленинградская)$/i;
  const kept = parts.filter((part) => !capital.test(part));

  return (kept.length > 0 ? kept : parts).slice(-4).join(", ");
}

function placeFromPayload(data: BrandPlaceResponse): BrandPlace | null {
  const found = data?.payload?.foundPlace;
  const slug = found?.place?.slug;
  if (!slug) return null;
  const loc = found?.place?.address?.location;
  return {
    slug,
    name: found?.place?.name || slug,
    address: normalizeAddress(found?.place?.address?.short),
    lat: loc?.latitude,
    lon: loc?.longitude,
  };
}

/**
 * Find the brand's branches by asking Yandex for the nearest place at points
 * across the city — there is no public "list all branches" endpoint, so we
 * probe a coarse grid and de-duplicate. Ordered nearest-to-centre first.
 */
export async function findBrandPlaces(
  url: string,
  brandSlug: string,
  regionId: number = 1
): Promise<BrandPlace[]> {
  const city = cityFromUrl(url);
  const grid = (city && CITY_GRIDS[city]) || CITY_GRIDS.moscow;

  const [cLat, cLon] = grid.centre;

  // Centre first, then a ring close to it (where most branches sit), then a
  // coarse grid over the whole city.
  const points: Array<[number, number]> = [[cLat, cLon]];
  for (const d of [0.03, 0.07]) {
    for (const [dy, dx] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ]) {
      points.push([cLat + dy * d, cLon + dx * d * 1.7]);
    }
  }
  const steps = 4; // coarse grid across the city bounds
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      points.push([
        grid.lat[0] + ((grid.lat[1] - grid.lat[0]) * i) / (steps - 1),
        grid.lon[0] + ((grid.lon[1] - grid.lon[0]) * j) / (steps - 1),
      ]);
    }
  }

  const results = await Promise.all(
    points.map(async ([lat, lon]) => {
      const probe = `https://eda.yandex.ru/eats/v1/eats-catalog/v2/brand/place?brand_slug=${encodeURIComponent(brandSlug)}&latitude=${lat}&longitude=${lon}&region_id=${regionId}`;
      const data = await apiGet<BrandPlaceResponse>(probe, "brand probe");
      return data ? placeFromPayload(data) : null;
    })
  );

  // The same shop can answer under two slugs — de-duplicate by address too
  const bySlug = new Map<string, BrandPlace>();
  const seenAddresses = new Set<string>();
  for (const place of results) {
    if (!place || bySlug.has(place.slug)) continue;
    const addressKey = place.address.toLowerCase();
    if (addressKey && seenAddresses.has(addressKey)) continue;
    if (addressKey) seenAddresses.add(addressKey);
    bySlug.set(place.slug, place);
  }

  // Nearest to the city centre first — that is the most likely intended branch
  return [...bySlug.values()].sort((a, b) => {
    const da = Math.hypot((a.lat ?? 99) - cLat, ((a.lon ?? 99) - cLon) / 1.7);
    const db = Math.hypot((b.lat ?? 99) - cLat, ((b.lon ?? 99) - cLon) / 1.7);
    return da - db;
  });
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
  "Accept-Language": "ru-RU,ru;q=0.9",
  // Without this the API omits the `descriptions` blocks (ingredients)
  "x-platform": "desktop_web",
};

const REQUEST_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET JSON from the Yandex Eda API with a timeout and retries.
 *
 * Transient failures (network errors, timeouts, 429, 5xx) are retried with
 * backoff — a single hiccup used to surface as "меню не удалось загрузить".
 * A 404 is returned as null immediately: it is an answer, not a failure.
 */
async function apiGet<T>(url: string, label: string): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: API_HEADERS,
        signal: controller.signal,
      });

      if (res.ok) return (await res.json()) as T;

      if (res.status === 404) return null;

      const retryable = res.status === 429 || res.status >= 500;
      console.error(
        `Yandex Eda ${label}: HTTP ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS})`
      );
      if (!retryable || attempt === MAX_ATTEMPTS) return null;
    } catch (err) {
      const reason = err instanceof Error ? err.name : String(err);
      console.error(
        `Yandex Eda ${label}: ${reason} (attempt ${attempt}/${MAX_ATTEMPTS})`
      );
      if (attempt === MAX_ATTEMPTS) return null;
    } finally {
      clearTimeout(timer);
    }
    await sleep(300 * 2 ** (attempt - 1)); // 300ms, 600ms
  }
  return null;
}

export interface PlaceInfo {
  name: string;
  address: string;
}

/**
 * Name and address of a branch, so the order shows "Curry индийская кухня —
 * улица Арбат, 32" instead of a bare slug.
 */
export async function fetchPlaceInfo(slug: string): Promise<PlaceInfo | null> {
  const url = `https://eda.yandex.ru/api/v2/catalog/${encodeURIComponent(slug)}?latitude=55.7558&longitude=37.6173&shippingType=delivery`;
  const data = await apiGet<BrandPlaceResponse>(url, `catalog ${slug}`);
  const place = data?.payload?.foundPlace?.place;
  if (!place?.name) return null;
  return {
    name: place.name,
    address: normalizeAddress(place.address?.short),
  };
}

interface BrandPlaceResponse {
  payload?: {
    foundPlace?: {
      place?: {
        slug?: string;
        name?: string;
        address?: {
          short?: string;
          city?: string;
          location?: { latitude?: number; longitude?: number };
        };
      };
    };
  };
}

/**
 * Links like /moscow/r/{brand} carry a brand slug, and the menu API only knows
 * per-branch place slugs. Resolve brand → place the way the site itself does.
 */
export async function resolvePlaceSlug(
  brandSlug: string,
  regionId: number = 1,
  near?: { lat: number; lon: number } | null
): Promise<string | null> {
  const coords = near ? `&latitude=${near.lat}&longitude=${near.lon}` : "";
  const url = `https://eda.yandex.ru/eats/v1/eats-catalog/v2/brand/place?brand_slug=${encodeURIComponent(brandSlug)}${coords}&region_id=${regionId}`;
  const data = await apiGet<BrandPlaceResponse>(url, `brand ${brandSlug}`);
  const slug = data?.payload?.foundPlace?.place?.slug;
  return slug && slug !== brandSlug ? slug : null;
}

/**
 * Fetch a branch menu and return parsed items.
 *
 * Resilient by design: the HTTP layer retries transient failures, and a slug
 * that turns out to be a brand (no menu of its own) is resolved to a branch and
 * retried once. An empty result means "this place publishes no menu", not "the
 * request failed" — the caller can safely fall back to manual entry.
 */
export async function fetchMenu(
  slug: string,
  regionId: number = 1,
  allowBrandResolve: boolean = true,
  /** The original restaurant link, so a brand resolves within its own city. */
  sourceUrl?: string
): Promise<ParsedMenuItem[]> {
  const url = `https://eda.yandex.ru/api/v2/menu/retrieve/${encodeURIComponent(slug)}?regionId=${regionId}&autoTranslate=false`;

  const retryAsBrand = async (): Promise<ParsedMenuItem[]> => {
    if (!allowBrandResolve) return [];
    const near = sourceUrl ? cityCentreFromUrl(sourceUrl) : null;
    const placeSlug = await resolvePlaceSlug(slug, regionId, near);
    if (!placeSlug) return [];
    console.log(`Resolved brand slug "${slug}" to place "${placeSlug}"`);
    return fetchMenu(placeSlug, regionId, false, sourceUrl);
  };

  const data = await apiGet<YandexEdaMenuResponse>(url, `menu ${slug}`);
  if (!data?.payload?.categories) return retryAsBrand();

  const items: ParsedMenuItem[] = [];

  data.payload.categories.forEach((category, categoryOrder) => {
    if (!category.items?.length) return;

    for (const item of category.items) {
      // Skip unavailable items and anything without a usable name/price
      if (item.available === false) continue;
      if (!item.name?.trim()) continue;
      const price = Math.round(Number(item.price));
      if (!Number.isFinite(price) || price <= 0) continue;

      items.push({
        category: category.name?.trim() || "Меню",
        categoryOrder,
        name: item.name.trim(),
        price,
        description:
          item.description?.trim() || parseIngredients(item.descriptions),
        weight: item.weight?.trim() || null,
        imageUrl: resolveImageUrl(item.picture),
        optionGroups: parseOptionGroups(item.optionsGroups),
      });
    }
  });

  // An empty menu for a brand slug means the same thing as a 404
  if (items.length === 0) return retryAsBrand();

  // A brand slug also answers 200 — with a stripped-down menu: no photos, no
  // ingredients and often different prices than the branch actually charges.
  // Detect that shape and prefer the branch's real menu.
  if (allowBrandResolve && !items.some((item) => item.imageUrl)) {
    const viaBrand = await retryAsBrand();
    if (viaBrand.length > items.length) {
      console.log(
        `Brand slug "${slug}" served a reduced menu (${items.length} items); using the branch menu (${viaBrand.length})`
      );
      return viaBrand;
    }
  }

  return items;
}

