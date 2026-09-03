import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * First letter for an avatar placeholder. Names often start with an emoji
 * ("🖤 Svetlana"), and an emoji in a 20px circle reads as noise — skip ahead to
 * the first letter or digit.
 */
export function initial(...names: Array<string | null | undefined>): string {
  const full = names.filter(Boolean).join(" ");
  const letter = full.match(/[\p{L}\p{N}]/u);
  // Spread, don't index: a bare emoji name would otherwise split its surrogate pair
  return (letter?.[0] ?? [...full.trim()][0] ?? "?").toUpperCase();
}
