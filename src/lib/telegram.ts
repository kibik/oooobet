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

/**
 * SBP transfer links.
 *
 * A link that pre-fills the amount only exists as an SBP payment registered by
 * the receiving bank (c2c.cbrpay.ru/<id>, qr.nspk.ru/<id>) — those ids cannot be
 * generated, only saved from the recipient's own banking app (`payLink`).
 * What CAN be built from a phone number is a "transfer to this number in this
 * bank" link; the bank code identifies the *recipient's* bank.
 */

/**
 * Banks we can build a working link for. Both forms below are verified on a
 * real phone: they open the bank with the recipient and the amount filled in.
 * Other banks hand out a personal c2c link instead — see `payLink`.
 */
export const BANK_CODES: Record<string, { code: string; title: string }> = {
  sber: { code: "100000000111", title: "Сбер" },
  tbank: { code: "100000000004", title: "Т‑Банк" },
};

export interface PayTarget {
  url: string;
  title: string;
}

/**
 * Where to send the payer. Returns null when we know nothing beyond the phone
 * number — the caller then falls back to copyable requisites.
 */
export function payTarget(
  recipient: { phoneNumber: string | null; payBank: string | null; payLink: string | null },
  amount: number
): PayTarget | null {
  // A saved personal link wins: it is the only kind that can carry an amount
  if (recipient.payLink && /^https:\/\//.test(recipient.payLink)) {
    return { url: recipient.payLink, title: `Перевести ${Math.round(amount)} ₽` };
  }

  const phone = (recipient.phoneNumber || "").replace(/\D/g, "");
  if (phone.length !== 11) return null;

  const rub = Math.round(amount);

  if (recipient.payBank === "tbank") {
    return {
      url: `https://t.tb.ru/c2cSberQr/${phone}?amount=${rub}`,
      title: `Перевести ${rub} ₽`,
    };
  }

  const bank = recipient.payBank ? BANK_CODES[recipient.payBank] : null;
  if (!bank) return null;

  return {
    url: `https://www.sberbank.com/sms/pbpn?requisiteNumber=${phone}&bankCode=${bank.code}&amount=${rub}`,
    title: `Перевести ${rub} ₽`,
  };
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
