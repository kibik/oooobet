import { NextRequest, NextResponse } from "next/server";
import { webhookCallback } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { getBot } from "@/lib/bot";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  parseSlug,
  fetchMenu,
  isBrandLink,
  findBrandPlaces,
  type BrandPlace,
} from "@/lib/yandex-eda";

const bot = getBot();

const COFFEE_FACTS = [
  "Кофеин повышает кортизол — организм думает, что вы в стрессе. Постоянно.",
  "Чашка кофе с едой снижает усвоение железа на 30–40%. Анемия не дремлет.",
  "Кофе за 4 часа до сна нарушает глубокий сон. Мозг не восстанавливается.",
  "Нефильтрованный кофе (эспрессо, турка) повышает «плохой» холестерин ЛПНП.",
  "Горячий кофе выше 65°C увеличивает риск рака пищевода (ВОЗ).",
  "4+ чашки в день — риск аритмии и повышенного давления.",
  "Кофе натощак усиливает выброс кислоты. Гастрит и изжога в подарок.",
  "Кофеин вызывает привыкание. Отмена — головные боли и раздражительность.",
  "Кофе вымывает кальций. Риск остеопороза при злоупотреблении.",
  "Кофеин сужает сосуды мозга. При мигрени — временное облегчение, потом откат.",
  "Кофе стимулирует перистальтику. Регулярное слабительное — не лучшая идея.",
  "Кофеин повышает глазное давление. Осторожно при глаукоме.",
  "Кофе мешает усвоению витаминов группы B и магния.",
  "Кофеин ускоряет сердцебиение. При тахикардии — лишняя нагрузка.",
  "Кофе обезвоживает. На каждую чашку — стакан воды впридачу.",
  "Кофе натощак в 7–8 утра усиливает пик кортизола. Тревожность растёт.",
  "Кофеин может провоцировать приступы у людей с эпилепсией.",
  "Кофе окрашивает эмаль. Жёлтые зубы — не миф.",
  "Кофеин проникает через плаценту. Беременным — осторожно.",
  "Кофе повышает кислотность. При язве и рефлюксе — обострения.",
  "Кофеин мешает засыпанию даже если «не чувствуете» эффекта.",
  "Кофе на пустой желудок раздражает слизистую. Долгосрочно — воспаление.",
];

const COFFEE_FACTS_RECENT: string[] = [];
const COFFEE_FACTS_RECENT_MAX = 20;

function getCoffeeFact(): string {
  const available = COFFEE_FACTS.filter((f) => !COFFEE_FACTS_RECENT.includes(f));
  const pool = available.length > 0 ? available : COFFEE_FACTS;
  const fact = pickRandom(pool);
  COFFEE_FACTS_RECENT.push(fact);
  if (COFFEE_FACTS_RECENT.length > COFFEE_FACTS_RECENT_MAX) {
    COFFEE_FACTS_RECENT.shift();
  }
  return fact;
}

const OBED_PHRASES = [
  "🅾️🅱️🅴🅳",
  "🅞🅑🅔🅓",
  "ØβΞÐ",
  "🇴Ⴆᗴᗪ",
  "૦БΣÐ",
  "🅾︎฿€Đ",
  "𝕆𝔹𝔼𝔻",
  "𝙾𝙱𝙴𝙳",
  "𝐎𝐁𝐄𝐃",
  "🅾️βΣ∂",
  "ΘβΣÐ",
  "Погнали в зону визуального безумия 👹",
  "ØБΞÐ̷",
  "🅾️БΞÐ̴̾",
  "ΘβΞÐ̸",
  "◎БΣÐ̵",
  "0БΞÐ̷̿",
  "Ø฿ΞÐ̴̐",
  "🅾︎βΞÐ̶",
  "⊙БΞÐ̸̽",
  "ØβΣÐ̷͠",
  "⚬БΞÐ̴",
  "0βΞÐ̶̑",
  "🄾БΞÐ̷̇",
  "ØБΞÐ̴̿",
  "ΘБΣÐ̸̐",
  "◎βΞÐ̶͝",
  "Ø฿ΣÐ̴̽",
  "0БΞÐ̷̾",
  "🅾️βΞÐ̸̒",
  "⊗БΞÐ̴",
  "ØβΞÐ̶̿",
  "O̷͑̎͝Б̸͐̈́Ξ̷̈́͗Ð̶̾",
  "Ø̵Б̴Ξ̷Ð̴̓",
  "O̶̿Б̴̾Ξ̶͗Ð̷",
  "Θ̷Б̸͝Ξ̴̐Ð̷",
  "Ø̶̓Б̴Ξ̷̄Ð̸",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pluralizeDishes(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "блюдо";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "блюда";
  return "блюд";
}

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
      // Fetch user's profile photo for avatar
      let photoFileId: string | null = null;
      try {
        const profilePhotos = await bot.api.getUserProfilePhotos(tgUser.id);
        const sizes = profilePhotos.photos?.[0];
        const largest = sizes?.[sizes.length - 1];
        if (largest?.file_id) photoFileId = largest.file_id;
      } catch {
        /* ignore */
      }

      // Upsert user
      await prisma.user.upsert({
        where: { id: BigInt(tgUser.id) },
        update: {
          firstName: tgUser.first_name,
          lastName: tgUser.last_name || null,
          username: tgUser.username || null,
          ...(photoFileId && { photoFileId }),
        },
        create: {
          id: BigInt(tgUser.id),
          firstName: tgUser.first_name,
          lastName: tgUser.last_name || null,
          username: tgUser.username || null,
          ...(photoFileId && { photoFileId }),
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
      const message = err instanceof Error ? err.message : String(err);
      const code = err && typeof (err as { code?: string }).code === "string" ? (err as { code: string }).code : "";
      console.error("Auth token confirmation error:", message, code, err);
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

  // Coffee harm facts — react to "кофе", "кофию", "кофий" (whole words)
  if (/(?:^|[\s,.!?])(кофе|кофию|кофий)(?:[\s,.!?]|$)/iu.test(text)) {
    await ctx.reply(getCoffeeFact());
    return;
  }

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

/** How many dishes a branch publishes (0 when it has no usable menu). */
async function countMenu(slug: string): Promise<number> {
  try {
    return (await fetchMenu(slug)).length;
  } catch {
    return 0;
  }
}

/** Store a freshly parsed menu for a session, replacing whatever was there. */
async function storeMenu(
  sessionId: string,
  slug: string
): Promise<number> {
  const menuItems = await fetchMenu(slug);
  if (menuItems.length === 0) return 0;

  await prisma.menuItem.deleteMany({ where: { sessionId } });
  await prisma.menuItem.createMany({
    data: menuItems.map((item) => ({
      sessionId,
      category: item.category,
      name: item.name,
      price: item.price,
      description: item.description,
      weight: item.weight,
      imageUrl: item.imageUrl,
      optionsJson: item.optionGroups
        ? (JSON.parse(JSON.stringify(item.optionGroups)) as Prisma.InputJsonValue)
        : undefined,
    })),
  });
  return menuItems.length;
}

function placeLabel(place: BrandPlace): string {
  return place.address
    ? place.address.replace(/^Москва,\s*/, "")
    : place.name;
}

/** Keyboard: order link + one button per alternative branch. */
function orderKeyboard(
  orderUrl: string,
  sessionId: string,
  places: BrandPlace[],
  currentSlug: string | null
) {
  const rows: InlineKeyboardButton[][] = [
    [{ text: "Погнали заказывать", url: orderUrl }],
  ];

  if (places.length > 1) {
    places.slice(0, 6).forEach((place, i) => {
      const chosen = place.slug === currentSlug;
      rows.push([
        {
          text: `${chosen ? "✅" : "📍"} ${placeLabel(place)}`,
          callback_data: `place:${sessionId}:${i}`,
        },
      ]);
    });
  }

  return { inline_keyboard: rows };
}

// Helper to create order and send link
async function createOrder(
  ctx: { reply: typeof bot.api.sendMessage extends (chatId: infer _C, ...args: infer A) => infer R ? (...args: A) => R : never },
  tgUser: { id: number; first_name: string },
  restaurantUrl: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const slug = parseSlug(restaurantUrl);

  // Brand links (/{city}/r/{brand}) can cover several branches with different
  // menus — collect them so the user can pick the right one.
  let places: BrandPlace[] = [];
  if (slug && isBrandLink(restaurantUrl)) {
    try {
      places = await findBrandPlaces(restaurantUrl, slug);
    } catch (err) {
      console.error("Failed to list brand places for:", slug, err);
    }
  }

  // Prefer the nearest branch whose menu actually loads — the closest one may
  // be closed or have no menu published.
  let chosen = places[0] || null;
  let preparsedMenu = 0;
  let preparsedFor: string | null = null;
  for (const place of places.slice(0, 4)) {
    const count = await countMenu(place.slug);
    if (count > 0) {
      chosen = place;
      preparsedMenu = count;
      preparsedFor = place.slug;
      break;
    }
  }
  const menuSlug = chosen?.slug || slug;

  const session = await prisma.orderSession.create({
    data: {
      url: restaurantUrl,
      adminId: BigInt(tgUser.id),
      placeSlug: menuSlug,
      placeName: chosen?.name || null,
      placeAddress: chosen?.address || null,
      placeOptions:
        places.length > 1
          ? (JSON.parse(JSON.stringify(places)) as Prisma.InputJsonValue)
          : undefined,
    },
  });

  let menuCount = 0;
  if (menuSlug) {
    try {
      menuCount = await storeMenu(session.id, menuSlug);
    } catch (err) {
      console.error("Failed to parse menu for slug:", menuSlug, err);
    }
  }
  if (menuCount === 0 && preparsedFor === menuSlug) {
    menuCount = preparsedMenu; // menu existed a moment ago; keep the count honest
  }

  const orderUrl = `${baseUrl}/order/${session.id}`;

  const displayName =
    chosen?.name ||
    slug ||
    (() => {
      try {
        const parsed = new URL(restaurantUrl);
        const ps = parsed.searchParams.get("placeSlug");
        if (ps) return ps;
        const m = parsed.pathname.match(/\/(?:restaurant|r)\/([^/?]+)/);
        if (m) return m[1];
      } catch { /* ignore */ }
      return null;
    })();

  const restaurantLine = displayName
    ? `Заказываем из <a href="${restaurantUrl}">${displayName}</a>`
    : `Заказываем из <a href="${restaurantUrl}">ресторана</a>`;

  const phrase = pickRandom(OBED_PHRASES);
  const mainLine = menuCount > 0
    ? `${restaurantLine}, ${menuCount} шикарных ${pluralizeDishes(menuCount)} на выбор`
    : `${restaurantLine}\n\nМеню не удалось загрузить — позиции можно добавить вручную`;

  const branchLine =
    places.length > 1
      ? `\n\nФилиал: <b>${placeLabel(places[0])}</b>. У этого ресторана ${places.length} точки с разными меню и ценами — если нужна другая, выбери ниже.`
      : chosen?.address
        ? `\n\nФилиал: <b>${placeLabel(chosen)}</b>`
        : "";

  await ctx.reply(
    `[${phrase}]\n\n${mainLine}${branchLine}`,
    {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: orderKeyboard(orderUrl, session.id, places, menuSlug),
    }
  );
}

// Branch picker on the order message
bot.callbackQuery(/^place:([^:]+):(\d+)$/, async (ctx) => {
  const sessionId = ctx.match[1];
  const index = Number(ctx.match[2]);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  try {
    const session = await prisma.orderSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        url: true,
        adminId: true,
        placeSlug: true,
        placeOptions: true,
        status: true,
        _count: { select: { items: true } },
      },
    });

    if (!session) {
      await ctx.answerCallbackQuery({ text: "Заказ не найден 🤷" });
      return;
    }
    if (session.adminId !== BigInt(ctx.from.id)) {
      await ctx.answerCallbackQuery({
        text: "Филиал меняет только тот, кто создал заказ",
      });
      return;
    }
    if (session.status !== "OPEN") {
      await ctx.answerCallbackQuery({ text: "Сбор заказов уже завершён" });
      return;
    }

    const places = (session.placeOptions as BrandPlace[] | null) || [];
    const place = places[index];
    if (!place) {
      await ctx.answerCallbackQuery({ text: "Этот филиал больше недоступен" });
      return;
    }
    if (place.slug === session.placeSlug) {
      await ctx.answerCallbackQuery({ text: "Этот филиал уже выбран" });
      return;
    }

    const menuCount = await storeMenu(sessionId, place.slug);
    if (menuCount === 0) {
      await ctx.answerCallbackQuery({
        text: "У этого филиала не удалось загрузить меню",
      });
      return;
    }

    await prisma.orderSession.update({
      where: { id: sessionId },
      data: {
        placeSlug: place.slug,
        placeName: place.name,
        placeAddress: place.address,
      },
    });

    await ctx.answerCallbackQuery({ text: `Меню: ${placeLabel(place)}` });

    const orderUrl = `${baseUrl}/order/${sessionId}`;
    const warning =
      session._count.items > 0
        ? "\n\n⚠️ Блюда, добавленные раньше, остались с прежними ценами — проверьте их."
        : "";

    try {
      await ctx.editMessageText(
        `[${pickRandom(OBED_PHRASES)}]\n\nЗаказываем из <a href="${session.url}">${place.name}</a>, ${menuCount} шикарных ${pluralizeDishes(menuCount)} на выбор\n\nФилиал: <b>${placeLabel(place)}</b>${warning}`,
        {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          reply_markup: orderKeyboard(orderUrl, sessionId, places, place.slug),
        }
      );
    } catch {
      /* message too old to edit — the menu is switched anyway */
    }
  } catch (err) {
    console.error("place callback error:", err);
    await ctx.answerCallbackQuery({ text: "Что-то пошло не так" });
  }
});


// "I paid" button on the payment message
bot.callbackQuery(/^paid:(.+)$/, async (ctx) => {
  const sessionId = ctx.match[1];
  const tgUser = ctx.from;

  try {
    const orderSession = await prisma.orderSession.findUnique({
      where: { id: sessionId },
      select: { id: true, adminId: true },
    });

    if (!orderSession) {
      await ctx.answerCallbackQuery({ text: "Заказ не найден 🤷" });
      return;
    }

    const existing = await prisma.payment.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId: BigInt(tgUser.id),
        },
      },
    });

    if (!existing) {
      await prisma.payment.create({
        data: { sessionId, userId: BigInt(tgUser.id) },
      });
    }

    await ctx.answerCallbackQuery({ text: "Принято! 💸" });

    // Remove the "I paid" button, keep bank links, append confirmation
    const msg = ctx.callbackQuery.message;
    if (msg) {
      const keyboard = msg.reply_markup?.inline_keyboard
        ?.map((row) => row.filter((btn) => !("callback_data" in btn)))
        .filter((row) => row.length > 0);
      try {
        await ctx.editMessageText(
          `${msg.text}\n\n✅ Перевод отмечен`,
          keyboard && keyboard.length > 0
            ? { reply_markup: { inline_keyboard: keyboard } }
            : undefined
        );
      } catch {
        /* message too old to edit — not a problem */
      }
    }

    // Notify the admin (unless it's the admin pressing their own button)
    if (!existing && orderSession.adminId !== BigInt(tgUser.id)) {
      const name = [tgUser.first_name, tgUser.last_name]
        .filter(Boolean)
        .join(" ");
      try {
        await bot.api.sendMessage(
          Number(orderSession.adminId),
          `💸 ${name} отметил перевод по заказу`
        );
      } catch {
        /* admin might have blocked the bot */
      }
    }
  } catch (err) {
    console.error("paid callback error:", err);
    await ctx.answerCallbackQuery({ text: "Что-то пошло не так, попробуй ещё раз" });
  }
});

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
