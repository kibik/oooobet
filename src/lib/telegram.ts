import crypto from "crypto";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Verify Telegram Login Widget data using HMAC-SHA256
 * https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramAuth(data: TelegramUser): boolean {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const { hash, ...rest } = data;

  // Create data-check-string
  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key as keyof typeof rest]}`)
    .join("\n");

  // Create secret key = SHA256(bot_token)
  const secretKey = crypto.createHash("sha256").update(botToken).digest();

  // Calculate HMAC-SHA256
  const hmac = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  return hmac === hash;
}

/**
 * Payment instructions for a P2P transfer.
 *
 * There is deliberately no "open my bank with the amount pre-filled" link
 * here. Such a link only exists as an SBP payment registered through the
 * receiving bank's API (qr.nspk.ru/<id>), which needs a merchant agreement we
 * do not have. The URLs this file used to build were guesses and returned 404
 * (verified against tbank.ru) or pointed at endpoints that ignore their query
 * parameters — a button leading nowhere is worse than none.
 *
 * What works for every user in every bank: the phone number and the amount,
 * formatted so a single tap copies them.
 */

function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** +7 999 000-11-22 — readable, and unambiguous when copied by hand. */
export function formatPhone(phone: string): string {
  const p = cleanPhone(phone);
  if (p.length !== 11) return p ? `+${p}` : "";
  return `+${p[0]} ${p.slice(1, 4)} ${p.slice(4, 7)}-${p.slice(7, 9)}-${p.slice(9)}`;
}

export interface PaymentDetails {
  /** Digits only, ready for the clipboard: 79990001122 */
  phone: string;
  /** Human-readable: +7 999 000-11-22 */
  phoneFormatted: string;
  amount: number;
}

export function paymentDetails(
  phone: string,
  amount: number
): PaymentDetails | null {
  const digits = cleanPhone(phone);
  if (digits.length < 10) return null;
  return {
    phone: digits,
    phoneFormatted: formatPhone(digits),
    amount: Math.round(amount),
  };
}
