/**
 * A delivery service we can read a menu from.
 *
 * Each service decides its own currency and time zone: a Yandex Eda link is a
 * Moscow order in roubles, a Deliveroo link is a Dubai order in dirhams. That
 * keeps Russian orders behaving exactly as they always have.
 */

import type { ParsedMenuItem } from "@/lib/yandex-eda";

export type { ParsedMenuItem };

export interface ProviderMenu {
  items: ParsedMenuItem[];
  placeName?: string | null;
  placeAddress?: string | null;
  /** Delivery fee the service shows for our address, when the page states it */
  deliveryFee?: number | null;
  /** Minimum order, purely informational */
  minimumOrder?: number | null;
}

export interface Provider {
  id: string;
  title: string;
  currency: string;
  timeZone: string;
  /** Does this URL belong to the service? */
  matches(url: string): boolean;
  /** A stable key for the venue, used to re-fetch the menu later */
  placeKey(url: string): string | null;
  fetchMenu(url: string): Promise<ProviderMenu>;
}
