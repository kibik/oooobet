import { NextRequest, NextResponse } from "next/server";
import { webhookCallback } from "grammy";
import { getBot } from "@/lib/bot";
import { prisma } from "@/lib/prisma";
import { parseSlug, fetchMenu } from "@/lib/yandex-eda";

const bot = getBot();

// Store pending restaurant URLs while waiting for phone number
const pendingUrls = new Map<number, string>();

// Handle /start command (including auth tokens: /start auth_XXXXX)
bot.command("start", async (ctx) => {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";
  const payload = ctx.match; // everything after "/start "
  const tgUser = ctx.from;

  // Check if this is an auth callback: /start auth_<token>
  if (payload.startsWith("auth_") && tgUser && !isGroup) {
    const token = payload.slice(5); // remove "auth_" prefix
    try {
      // Upsert user
      await prisma.user.upsert({
        where: { id: BigInt(tgUser.id) },
        update: {
          firstName: tgUser.first_name,
          lastName: tgUser.last_name || null,
          username: tgUser.username || null,
        },
        create: {
          id: BigInt(tgUser.id),
          firstName: tgUser.first_name,
          lastName: tgUser.last_name || null,
          username: tgUser.username || null,
        },
      });

      // Confirm the auth token
      const authToken = await prisma.authToken.findUnique({ where: { token } });
      if (authToken && !authToken.confirmed) {
        await prisma.authToken.update({
          where: { id: authToken.id },
          data: { confirmed: true, userId: BigInt(tgUser.id) },
        });
        await ctx.reply("Авторизация подтверждена! Возвращайся на\u00A0сайт.");
      } else {
        await ctx.reply("Ссылка устарела или\u00A0уже использована. Попробуй ещё раз на\u00A0сайте.");
      }
    } catch (err) {
      console.error("Auth token confirmation error:", err);
      await ctx.reply("Что-то пошло не\u00A0так. Попробуй ещё раз.");
    }
    return;
  }

  const intro = isGroup
    ? "Привет! Чтобы создать заказ, отправь:\n/order <ссылка на\u00A0eda.yandex.ru>"
    : "Привет! Я\u00A0помогу организовать совместный заказ еды.\n\n" +
      "Отправь мне ссылку на\u00A0ресторан с\u00A0eda.yandex.ru, и\u00A0я\u00A0создам сессию для\u00A0сбора заказов.\n\n" +
      `Авторизуйся на\u00A0сайте: ${baseUrl}`;

  await ctx.reply(intro, { parse_mode: "HTML" });
});

// Handle shared contact — save phone number
bot.on("message:contact", async (ctx) => {
  const contact = ctx.message.contact;
  const tgUser = ctx.from;

  if (!tgUser) return;

  // Only accept the user's own contact
  if (contact.user_id !== tgUser.id) {
    await ctx.reply("Пожалуйста, поделись своим контактом, а не чужим.");
    return;
  }

  const phone = contact.phone_number.replace(/\D/g, "");

  // Upsert user with phone
  await prisma.user.upsert({
    where: { id: BigInt(tgUser.id) },
    update: { phoneNumber: phone },
    create: {
      id: BigInt(tgUser.id),
      firstName: tgUser.first_name,
      lastName: tgUser.last_name || null,
      username: tgUser.username || null,
      phoneNumber: phone,
    },
  });

  await ctx.reply("Номер телефона сохранён: +" + phone, {
    reply_markup: { remove_keyboard: true },
  });

  // If there was a pending URL, create the order now
  const pendingUrl = pendingUrls.get(tgUser.id);
  if (pendingUrl) {
    pendingUrls.delete(tgUser.id);
    await createOrder(ctx, tgUser, pendingUrl);
  }
});

// /order command — works reliably in groups (commands always reach the bot)
bot.command("order", async (ctx) => {
  const text = ctx.match; // everything after "/order "
  const tgUser = ctx.from;
  if (!tgUser) return;

  const edaRegex = /https?:\/\/eda\.yandex\.ru\S*/i;
  const match = text.match(edaRegex);

  if (!match) {
    await ctx.reply("Использование: /order https://eda.yandex.ru/...");
    return;
  }

  await handleEdaLink(ctx, tgUser, match[0]);
});

// Handle links to Yandex Eda (works in DMs always, in groups only with Privacy OFF)
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  const tgUser = ctx.from;
  const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

  // Check if the message contains a Yandex Eda link
  const edaRegex = /https?:\/\/eda\.yandex\.ru\S*/i;
  const match = text.match(edaRegex);

  if (!match) {
    // In groups — silently ignore messages without links
    if (isGroup) return;
    await ctx.reply(
      "Отправь мне ссылку на ресторан с eda.yandex.ru, чтобы начать сбор заказов.\n\nВ\u00A0группе используй команду:\n/order <ссылка>"
    );
    return;
  }

  await handleEdaLink(ctx, tgUser, match[0]);
});

// Shared logic for processing Yandex Eda links
async function handleEdaLink(
  ctx: { reply: typeof bot.api.sendMessage extends (chatId: infer _C, ...args: infer A) => infer R ? (...args: A) => R : never; chat: { type: string } },
  tgUser: { id: number; first_name: string; last_name?: string; username?: string },
  restaurantUrl: string
) {
  const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

  if (!tgUser) {
    await ctx.reply("Не удалось определить пользователя.");
    return;
  }

  // Upsert user
  const user = await prisma.user.upsert({
    where: { id: BigInt(tgUser.id) },
    update: {
      firstName: tgUser.first_name,
      lastName: tgUser.last_name || null,
      username: tgUser.username || null,
    },
    create: {
      id: BigInt(tgUser.id),
      firstName: tgUser.first_name,
      lastName: tgUser.last_name || null,
      username: tgUser.username || null,
    },
  });

  // Check if user has phone number
  if (!user.phoneNumber) {
    // Save URL and ask for contact
    pendingUrls.set(tgUser.id, restaurantUrl);

    if (isGroup) {
      // In groups, keyboard buttons for contact don't work — redirect to DM
      const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || "oooobet_bot";
      await ctx.reply(
        `Для создания заказа нужен номер телефона.\n\nНапиши мне в\u00A0личку @${botUsername}\u00A0— я\u00A0попрошу номер и\u00A0вернусь сюда с\u00A0заказом.`,
      );
    } else {
      await ctx.reply(
        "Для создания заказа нужен номер телефона (для приёма переводов через Сбербанк).\n\n" +
          "Нажми кнопку ниже\u00A0— номер подтянется из\u00A0профиля Telegram автоматически.",
        {
          reply_markup: {
            keyboard: [
              [{ text: "📱 Поделиться номером", request_contact: true }],
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        }
      );
    }
    return;
  }

  await createOrder(ctx, tgUser, restaurantUrl);
}

// Helper to create order and send link
async function createOrder(
  ctx: { reply: typeof bot.api.sendMessage extends (chatId: infer _C, ...args: infer A) => infer R ? (...args: A) => R : never },
  tgUser: { id: number; first_name: string },
  restaurantUrl: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  const session = await prisma.orderSession.create({
    data: {
      url: restaurantUrl,
      adminId: BigInt(tgUser.id),
    },
  });

  // Try to parse menu from Yandex Eda
  let menuCount = 0;
  const slug = parseSlug(restaurantUrl);
  if (slug) {
    try {
      const menuItems = await fetchMenu(slug);
      if (menuItems.length > 0) {
        await prisma.menuItem.createMany({
          data: menuItems.map((item) => ({
            sessionId: session.id,
            category: item.category,
            name: item.name,
            price: item.price,
            description: item.description,
            weight: item.weight,
            imageUrl: item.imageUrl,
          })),
        });
        menuCount = menuItems.length;
      }
    } catch (err) {
      console.error("Failed to parse menu for slug:", slug, err);
    }
  }

  const orderUrl = `${baseUrl}/order/${session.id}`;

  // Extract slug for display
  const displaySlug = slug || (() => {
    try {
      const parsed = new URL(restaurantUrl);
      const ps = parsed.searchParams.get("placeSlug");
      if (ps) return ps;
      const m = parsed.pathname.match(/\/(?:restaurant|r)\/([^/?]+)/);
      if (m) return m[1];
      const cm = parsed.pathname.match(/\/[^/]+\/r\/([^/?]+)/);
      if (cm) return cm[1];
    } catch { /* ignore */ }
    return null;
  })();

  const restaurantLine = displaySlug
    ? `Заказываем из <a href="${restaurantUrl}">${displaySlug}</a>`
    : `Заказываем из <a href="${restaurantUrl}">ресторана</a>`;

  const menuNote = menuCount > 0
    ? `\n\nИз меню загружено ${menuCount} позиций`
    : "\n\nМеню не удалось загрузить — позиции можно добавить вручную";

  await ctx.reply(
    `Время потчевать!\n\n${restaurantLine}${menuNote}`,
    {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [[{ text: "Погнали заказывать", url: orderUrl }]],
      },
    }
  );
}

// Webhook handler
const handleUpdate = webhookCallback(bot, "std/http");

export async function POST(req: NextRequest) {
  try {
    return await handleUpdate(req);
  } catch (error) {
    console.error("Bot webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}
