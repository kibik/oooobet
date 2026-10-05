/**
 * Talabat (UAE).
 *
 * Talabat shows a menu only after a delivery area is chosen, and the choice
 * lives in the app's own state rather than a URL or cookie we can set. Their
 * menu endpoint is not reachable without going through that flow, and the site
 * sits behind Cloudflare, which blocks repeated automated requests outright.
 *
 * So we read what the public brand page does give us — the venue's name and
 * branch — and leave the dishes to be added by hand. The order itself still
 * works properly: dirhams, Dubai time, the right restaurant name, and the
 * "add manually" flow the app already has for menus it cannot read.
 */

import type { Provider, ProviderMenu } from "./types";

/** Santorini, DAMAC Lagoons — confirmed on Talabat's own map. */
export const DELIVERY_POINT = { lat: 25.0164324, lng: 55.2448055 };

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept-Language": "en",
};

interface BrandPageData {
  props?: {
    pageProps?: {
      data?: {
        name?: string;
        branchSlug?: string;
        restaurantSlug?: string;
        cuisineString?: string;
      };
    };
  };
}

export function parseBrandPage(html: string): {
  placeName: string | null;
  placeAddress: string | null;
} {
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) return { placeName: null, placeAddress: null };

  try {
    const data: BrandPageData = JSON.parse(match[1]);
    const venue = data.props?.pageProps?.data;
    return {
      placeName: venue?.name ?? null,
      // Talabat's brand page has no branch address; the cuisine is the only
      // extra context it offers, and it reads fine under the name
      placeAddress: venue?.cuisineString ?? null,
    };
  } catch {
    return { placeName: null, placeAddress: null };
  }
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
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(url, {
        headers: HEADERS,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        console.error(`Talabat: HTTP ${res.status}`);
        return empty;
      }

      const html = await res.text();
      const { placeName, placeAddress } = parseBrandPage(html);
      // placeAddress holds the cuisine here; say so instead of passing it off
      // as a branch address.
      return {
        items: [],
        placeName,
        placeAddress: placeAddress ? `Кухня: ${placeAddress}` : null,
      };
    } catch (err) {
      console.error("Talabat: не удалось прочитать страницу", err);
      return empty;
    }
  },
};
