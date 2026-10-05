/**
 * Money helpers.
 *
 * Prices are stored as fixed-point decimals, because delivery services outside
 * Russia charge fractional amounts (25.50 AED). Prisma hands those back as
 * Decimal objects, which do not take part in arithmetic — convert at the edge
 * with `money()` and keep plain numbers inside the app.
 */

/** Anything Prisma or an API may hand us for an amount. */
type MoneyLike = { toString(): string } | number | string | null | undefined;

export function money(value: MoneyLike): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

/** Round to cents, avoiding 0.1 + 0.2 drift. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Currencies people here actually pay in, and how finely.
 *
 * Roubles stay whole: splitting a delivery fee has always produced round
 * numbers for Russian orders, and nobody transfers 33.33 ₽. Dirhams keep
 * fils, because menus are priced that way.
 */
const CURRENCY_PRECISION: Record<string, number> = { RUB: 0, AED: 2 };

/** Round the way this currency is actually paid. */
export function roundIn(value: number, currency: string = "RUB"): number {
  const digits = CURRENCY_PRECISION[currency] ?? 2;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

const CURRENCY_SUFFIX: Record<string, string> = {
  RUB: " ₽",
  AED: " AED",
};

/**
 * "1 250 ₽" / "25.50 AED" — thin-space thousands, decimals only when the
 * amount actually has them, so whole prices stay clean.
 */
export function formatMoney(value: MoneyLike, currency: string = "RUB"): string {
  const amount = roundMoney(money(value));
  const hasFraction = Math.abs(amount % 1) > 0.004;
  const body = hasFraction ? amount.toFixed(2) : String(Math.round(amount));
  const [whole, fraction] = body.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const suffix = CURRENCY_SUFFIX[currency] ?? ` ${currency}`;
  return `${grouped}${fraction ? `.${fraction}` : ""}${suffix}`;
}
