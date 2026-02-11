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
 * Generate bank payment deep links for P2P transfers.
 *
 * Sber: uses documented /person/dl/ web deep link
 * T-Bank: opens transfer-by-phone page (no pre-fill API available publicly)
 * Alfa: opens SBP transfer page via mobile redirect
 */

function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function generateSberbankLink(phone: string, amount: number): string {
  const p = cleanPhone(phone);
  return `https://www.sberbank.ru/ru/person/dl/open_qr?type=bt&receiver=${p}&amount=${amount}&currency=RUB`;
}

export function generateTbankLink(phone: string, amount: number): string {
  const p = cleanPhone(phone);
  // T-Bank web transfer page — phone & amount as hints
  return `https://www.tbank.ru/transfer/bank-by-phone?phone=${p}&sum=${amount}`;
}

export function generateAlfaLink(phone: string, amount: number): string {
  const p = cleanPhone(phone);
  // Alfa-Bank mobile redirect for SBP transfer
  return `https://alfa-mobile.alfabank.ru/mobile-public/goto/transfer-by-phone?phone=${p}&amount=${amount}`;
}

export interface PaymentLinks {
  sber: string;
  tbank: string;
  alfa: string;
}

export function generatePaymentLinks(phone: string, amount: number): PaymentLinks {
  return {
    sber: generateSberbankLink(phone, amount),
    tbank: generateTbankLink(phone, amount),
    alfa: generateAlfaLink(phone, amount),
  };
}
