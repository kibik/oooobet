/**
 * Which delivery service a link belongs to.
 *
 * Yandex Eda keeps behaving exactly as before — roubles, Moscow time — so
 * Russian orders are untouched by the UAE services added alongside it.
 */

import {
  parseSlug,
  fetchMenu as fetchYandexMenu,
  fetchPlaceInfo as fetchYandexPlace,
  isBrandLink,
  findBrandPlaces,
} from "@/lib/yandex-eda";
import type { Provider } from "./types";
import { deliveroo } from "./deliveroo";
import { talabat } from "./talabat";

export const yandexEda: Provider = {
  id: "yandex",
  title: "Яндекс Еда",
  currency: "RUB",
  timeZone: "Europe/Moscow",

  matches(url) {
    try {
      return /(^|\.)eda\.yandex\.(ru|com)$/.test(new URL(url).hostname);
    } catch {
      return false;
    }
  },

  placeKey: parseSlug,

  async fetchMenu(url) {
    const slug = parseSlug(url);
    if (!slug) return { items: [] };

    // Brand links cover several branches with different menus
    const places = isBrandLink(url) ? await findBrandPlaces(url, slug) : [];
    const chosen = places[0];
    const menuSlug = chosen?.slug || slug;

    const items = await fetchYandexMenu(menuSlug, 1, true, url);
    const info = chosen
      ? { name: chosen.name, address: chosen.address }
      : await fetchYandexPlace(menuSlug);

    return {
      items,
      placeName: info?.name ?? null,
      placeAddress: info?.address ?? null,
    };
  },
};

/** Services we can read, most specific first. */
export const PROVIDERS: Provider[] = [yandexEda, deliveroo, talabat];

export function detectProvider(url: string): Provider | null {
  return PROVIDERS.find((p) => p.matches(url)) ?? null;
}

/** Any supported restaurant link inside a chat message. */
export function findSupportedLink(
  text: string
): { url: string; provider: Provider } | null {
  const urls = text.match(/https?:\/\/\S+/gi) ?? [];
  for (const raw of urls) {
    const url = raw.replace(/[),.]+$/, "");
    const provider = detectProvider(url);
    if (provider) return { url, provider };
  }
  return null;
}

export type { Provider, ProviderMenu } from "./types";
