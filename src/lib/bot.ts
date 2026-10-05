import { Bot } from "grammy";

let bot: Bot | null = null;

export function getBot(): Bot {
  if (!bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
    // Local end-to-end tests point this at a mock so no real chat is messaged.
    // Unset in production, where grammY talks to api.telegram.org as before.
    const apiRoot = process.env.TELEGRAM_API_ROOT;
    bot = apiRoot ? new Bot(token, { client: { apiRoot } }) : new Bot(token);
  }
  return bot;
}
