/**
 * Order language.
 *
 * An order speaks the language of the people who will read it: a Moscow order
 * from Yandex Eda stays in Russian, a Dubai order from Deliveroo or Talabat is
 * in English. The currency the service charges in decides it, so nothing about
 * Russian orders changes.
 */

export type Locale = "ru" | "en";

export function localeFor(currency: string | null | undefined): Locale {
  return !currency || currency === "RUB" ? "ru" : "en";
}

type Dict = Record<string, string>;

const RU: Dict = {
  // --- Order page: status and header ---
  loading: "Загрузка...",
  orderNotFound: "Заказ не найден",
  checkTheLink: "Проверьте ссылку и попробуйте снова.",
  statusOpen: "Сбор заказов",
  statusOrdered: "Ожидание оплаты",
  statusClosed: "Закрыт",
  paidBy: "За всё платит",
  orderingFrom: "Заказываем из ",
  deadlinePassed: "приём заказов закрыт",
  untilDeadline: "до конца сбора заказов",
  timeIsUp: "время вышло",

  // --- Order page: sign in ---
  signInTitle: "Войдите через Telegram",
  signInText: "Чтобы добавить свои блюда, нужно авторизоваться.",

  // --- Order page: menu ---
  menuLoading: "Загрузка меню...",
  menuSearch: "Поиск по меню...",
  hasOptions: "есть опции",
  priceOnSelection: "цена зависит от выбора",
  conditionsTitle: "Условия заказа",
  conditionsHint: "Например: скидка 50%, но не\u00A0больше 30 AED на\u00A0заказ",
  conditionsAdd: "Добавить условия заказа",
  conditionsSave: "Сохранить",
  conditionsEdit: "Изменить",
  conditionsSaved: "Условия сохранены",
  pickOnSite: "Выбери состав на сайте сервиса и впиши итоговую цену",
  optionsLabel: "Что выбрал",
  optionsPlaceholder: "курица, острый",
  wantThis: "Хочу это! 🤤",
  nothingFound: "Ничего не найдено",
  justASecond: "Секунду...",
  stillChoosing: "Я ещё выбираю",
  imDone: "Выбор сделан, заказывайте!",
  hideManual: "Скрыть ручной ввод",
  notOnTheMenu: "Нет в меню? Добавить вручную",
  dishName: "Название блюда",
  dishNamePlaceholder: "Пицца Маргарита",
  priceLabel: "Цена",
  adding: "Добавляем...",
  add: "Добавить",
  addManually: "Добавить блюдо вручную",

  // --- Order page: the order itself ---
  totalLabel: "Итого",
  nobodyYet: "Пока никто не добавил блюда",
  remove: "Удалить",

  // --- Order page: finalize dialog ---
  settleOrder: "Рассчитать заказ",
  settleTitle: "Завершение сбора заказов",
  settleText: "Укажите стоимость доставки и сервисный сбор. Сумма будет разделена поровну между",
  settleTextTail: "участниками.",
  deliveryCost: "Стоимость доставки",
  serviceFee: "Сервисный сбор",
  dishDiscount: "Скидка на блюда, %",
  extraPerPerson: "Доп. расходы на человека:",
  foodTotal: "Общая сумма блюд:",
  finalizing: "Оформляем...",
  confirmAndPay: "Подтвердить и пусть платят",

  // --- Order page: who owes what ---
  whoOwes: "Кто что должен",
  deliveryAndFee: "Доставка {delivery} и сервисный сбор {service}",
  discountSuffix: "· скидка на блюда {percent}%",
  transferred: "перевёл ✅",
  transferNoted: "Перевод отмечен — спасибо! ✅",
  youOwe: "С тебя",
  toThePhone: "На номер",
  copyAmount: "Скопировать сумму",
  copyPhone: "Скопировать номер",
  copied: "скопировано",
  noPhone: "Номер не указан — спроси у ",
  tapToCopy: "Нажми на сумму или номер, чтобы скопировать",
  markingPaid: "Отмечаю...",
  iPaid: "Я перевёл",

  // --- Order page: options dialog ---
  pickOptions: "Выбери опции — они попадут в заказ.",
  optionRequired: "обязательно",
  optionUpTo: "до {max}",
  addFor: "Добавить за {price}",

  // --- Order page: toasts ---
  errLoadOrder: "Ошибка загрузки заказа",
  addedDish: "{name} добавлено",
  errAdd: "Ошибка добавления",
  errNetwork: "Ошибка сети",
  dishAdded: "Блюдо добавлено",
  errCopy: "Не получилось скопировать — выдели и скопируй вручную",
  paidNoted: "Отметил перевод. Напоминания больше не придут",
  errGeneric: "Не получилось",
  keepChoosing: "Продолжай выбирать",
  readyWaiting: "Готово! Ждём остальных 🍽",
  dishRemoved: "Блюдо удалено",
  errRemove: "Ошибка удаления",
  orderPlacedSome: "Заказ оформлен! Уведомлений: {sent} доставлено, {failed} не удалось.",
  orderPlaced: "Заказ оформлен! Уведомления отправлены ({sent}).",
  errShort: "Ошибка",

  // --- API answers ---
  errAuth: "Необходимо авторизоваться",
  errSessionMissing: "Сессия заказа не найдена",
  errClosed: "Сбор заказов уже завершен",
  errNoDishName: "Укажите название блюда",
  errNoDishesYet: "Сначала добавь хотя бы одно блюдо",
  errBadPrice: "Укажите корректную цену",
  errNoUser: "Пользователь не найден. Перелогиньтесь.",
  errNotAdmin: "Только администратор может завершить сбор заказов",
  errAlreadyDone: "Заказ уже завершен",

  // --- Bot: a new order ---
  botOrderingFrom: 'Заказываем из <a href="{url}">{name}</a>, {count} {dishWord} на выбор',
  botNoMenu:
    'Заказываем из <a href="{url}">{name}</a>\n\nМеню не удалось загрузить — позиции можно добавить вручную',
  botBranch: "Филиал: <b>{address}</b>",
  botDeliveryFee: "Доставка по данным {service}: {fee} {currency}",
  botMinimumOrder: ", минимальный заказ {amount} {currency}",
  botOrderLink: "Ссылка для заказа: {url}",
  botAskDeadline: "Укажи, до скольки принимаем заказы:",
  botReloadMenu: "🔄 Загрузить меню ещё раз",
  botNoDeadline: "пофигу",
  botDeadlineSet: "⏳ Заказы принимаем до <b>{time}</b>",
  botDeadlineNone: "⏳ Заказы принимаем без срока",
  botOnlyAuthor: "Время ставит тот, кто создал заказ",
  botDeadlineAnswer: "Принимаем заказы до {time}",
  botNoDeadlineAnswer: "Без ограничения по времени",
  botMenuLoading: "Пробую загрузить меню…",
  botMenuStillEmpty: "У этого ресторана меню не публикуется — добавьте блюда вручную",
  botOrderGone: "Заказ не найден 🤷",
  botSomethingBroke: "Что-то пошло не так",

  // --- Bot: debts ---
  botOrderPlaced: "Обед заказан! Ждём переводов:",
  botTotalToReceive: "Всего к получению: {total}",
  botDiscountLine: "Скидка на блюда: {percent}%",
  botYouOwe:
    "Обед заказан. С тебя {total}. {food} за еду и {extra} {feeTarget}.{discount}",
  botDiscountNote: " Еда уже со скидкой {percent}%.",
  botFeeYandex: "монополисту Яндексу",
  botFeeService: "сервису {service}",
  botTransferTo:
    "Перевести <code>{amount}</code> ₽ по номеру <code>+{phone}</code>\n<i>Нажми на номер или сумму, чтобы скопировать</i>",
  botNoRequisites: "Номер для перевода не указан — спроси у заказавшего.",
  botAmountToSend:
    "К переводу <code>{amount}</code> {currency}\n<i>Нажми на сумму, чтобы скопировать</i>",
  botIPaid: "✅ Я перевёл",
  botPayButton: "Перевести {amount}",
  botPaidNoted: "✅ Перевод отмечен",
  botPaidAccepted: "Принято! 💸",
  botPaidNotice: "💸 {name} отметил перевод по заказу",

  // --- Bot: reminders ---
  botReminder:
    "{nudge}: с тебя {amount}.{requisites}\n\nЕсли уже перевёл — нажми кнопку, и я перестану напоминать.",
  botReminderRequisites: "<code>{amount}</code> ₽ на <code>+{phone}</code>",
};

const EN: Dict = {
  loading: "Loading...",
  orderNotFound: "Order not found",
  checkTheLink: "Check the link and try again.",
  statusOpen: "Taking orders",
  statusOrdered: "Waiting for payment",
  statusClosed: "Closed",
  paidBy: "Paying for everyone:",
  orderingFrom: "Ordering from ",
  deadlinePassed: "orders are closed",
  untilDeadline: "left to order",
  timeIsUp: "time is up",

  signInTitle: "Sign in with Telegram",
  signInText: "Sign in to add your dishes to this order.",

  menuLoading: "Loading the menu...",
  menuSearch: "Search the menu...",
  hasOptions: "has options",
  priceOnSelection: "price depends on the options",
  conditionsTitle: "Order conditions",
  conditionsHint: "For example: 50% off, but no more than AED 30 per order",
  conditionsAdd: "Add the order conditions",
  conditionsSave: "Save",
  conditionsEdit: "Edit",
  conditionsSaved: "Conditions saved",
  pickOnSite: "Pick the options on the service's site, then enter the final price",
  optionsLabel: "Your options",
  optionsPlaceholder: "chicken, spicy",
  wantThis: "I want it! 🤤",
  nothingFound: "Nothing found",
  justASecond: "One second...",
  stillChoosing: "I'm still choosing",
  imDone: "I'm done, place the order!",
  hideManual: "Hide manual entry",
  notOnTheMenu: "Not on the menu? Add it by hand",
  dishName: "Dish name",
  dishNamePlaceholder: "Margherita Pizza",
  priceLabel: "Price",
  adding: "Adding...",
  add: "Add",
  addManually: "Add a dish by hand",

  totalLabel: "Total",
  nobodyYet: "No dishes yet",
  remove: "Remove",

  settleOrder: "Settle the order",
  settleTitle: "Closing the order",
  settleText:
    "Enter the delivery fee and the service fee. They will be split evenly between",
  settleTextTail: "people.",
  deliveryCost: "Delivery fee",
  serviceFee: "Service fee",
  dishDiscount: "Discount on dishes, %",
  extraPerPerson: "Extra per person:",
  foodTotal: "Dishes in total:",
  finalizing: "Placing...",
  confirmAndPay: "Confirm and let them pay",

  whoOwes: "Who owes what",
  deliveryAndFee: "Delivery {delivery} and service fee {service}",
  discountSuffix: "· {percent}% off the dishes",
  transferred: "paid ✅",
  transferNoted: "Payment noted, thank you! ✅",
  youOwe: "You owe",
  toThePhone: "To the number",
  copyAmount: "Copy the amount",
  copyPhone: "Copy the number",
  copied: "copied",
  noPhone: "No number here — ask ",
  tapToCopy: "Tap the amount or the number to copy it",
  markingPaid: "Marking...",
  iPaid: "I've paid",

  pickOptions: "Pick your options — they go into the order.",
  optionRequired: "required",
  optionUpTo: "up to {max}",
  addFor: "Add for {price}",

  errLoadOrder: "Could not load the order",
  addedDish: "{name} added",
  errAdd: "Could not add the dish",
  errNetwork: "Network error",
  dishAdded: "Dish added",
  errCopy: "Could not copy — select it and copy by hand",
  paidNoted: "Payment noted. No more reminders",
  errGeneric: "That did not work",
  keepChoosing: "Keep choosing",
  readyWaiting: "Done! Waiting for the others 🍽",
  dishRemoved: "Dish removed",
  errRemove: "Could not remove the dish",
  orderPlacedSome: "Order placed! Notifications: {sent} delivered, {failed} failed.",
  orderPlaced: "Order placed! Notifications sent ({sent}).",
  errShort: "Error",

  errAuth: "Please sign in first",
  errSessionMissing: "Order not found",
  errClosed: "This order is already closed",
  errNoDishName: "Enter the dish name",
  errNoDishesYet: "Add at least one dish first",
  errBadPrice: "Enter a valid price",
  errNoUser: "User not found. Please sign in again.",
  errNotAdmin: "Only whoever started the order can close it",
  errAlreadyDone: "This order is already closed",

  botOrderingFrom:
    'Ordering from <a href="{url}">{name}</a>, {count} {dishWord} to choose from',
  botNoMenu:
    'Ordering from <a href="{url}">{name}</a>\n\nCould not load the menu — dishes can be added by hand',
  botBranch: "Branch: <b>{address}</b>",
  botDeliveryFee: "Delivery according to {service}: {fee} {currency}",
  botMinimumOrder: ", minimum order {amount} {currency}",
  botOrderLink: "Order here: {url}",
  botAskDeadline: "Until when are we taking orders?",
  botReloadMenu: "🔄 Load the menu again",
  botNoDeadline: "no deadline",
  botDeadlineSet: "⏳ Taking orders until <b>{time}</b>",
  botDeadlineNone: "⏳ Taking orders with no deadline",
  botOnlyAuthor: "Only whoever started the order can set the time",
  botDeadlineAnswer: "Taking orders until {time}",
  botNoDeadlineAnswer: "No deadline then",
  botMenuLoading: "Trying to load the menu…",
  botMenuStillEmpty: "This restaurant publishes no menu — add the dishes by hand",
  botOrderGone: "Order not found 🤷",
  botSomethingBroke: "Something went wrong",

  botOrderPlaced: "Lunch is ordered! Waiting for the transfers:",
  botTotalToReceive: "To receive in total: {total}",
  botAloneInOrder: "Lunch is ordered! You were the only one in it.",
  botDiscountLine: "Discount on dishes: {percent}%",
  botYouOwe:
    "Lunch is ordered. You owe {total}: {food} for the food and {extra} {feeTarget}.{discount}",
  botDiscountNote: " The food is already {percent}% off.",
  botFeeYandex: "to Yandex the monopolist",
  botFeeService: "to {service}",
  botTransferTo:
    "Send <code>{amount}</code> ₽ to <code>+{phone}</code>\n<i>Tap the number or the amount to copy it</i>",
  botNoRequisites: "No payment details here — ask whoever ordered.",
  botAmountToSend:
    "To send: <code>{amount}</code> {currency}\n<i>Tap the amount to copy it</i>",
  botIPaid: "✅ I've paid",
  botPayButton: "Send {amount}",
  botPaidNoted: "✅ Payment noted",
  botPaidAccepted: "Got it! 💸",
  botPaidNotice: "💸 {name} marked their payment for the order",

  botReminder:
    "{nudge}: you owe {amount}.{requisites}\n\nIf you have already paid, tap the button and I'll stop reminding you.",
  botReminderRequisites: "<code>{amount}</code> ₽ to <code>+{phone}</code>",
};

const DICTS: Record<Locale, Dict> = { ru: RU, en: EN };

export type Translate = (
  key: keyof typeof RU | string,
  params?: Record<string, string | number>
) => string;

/** A `t()` bound to one language. Unknown keys come back as themselves. */
export function translator(locale: Locale): Translate {
  const dict = DICTS[locale] ?? RU;
  return (key, params) => {
    let text = dict[key] ?? RU[key] ?? String(key);
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.split(`{${name}}`).join(String(value));
      }
    }
    return text;
  };
}

/** "2 блюда" / "2 dishes" — Russian needs three forms, English two. */
export function dishWord(count: number, locale: Locale): string {
  if (locale === "en") return count === 1 ? "dish" : "dishes";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return "блюд";
  if (mod10 === 1) return "блюдо";
  if (mod10 >= 2 && mod10 <= 4) return "блюда";
  return "блюд";
}

/** Nudges for unpaid debts, in the order they are sent. */
export const NUDGES: Record<Locale, string[]> = {
  ru: [
    "Напоминаю про обед",
    "Всё ещё жду перевод",
    "Обед был вкусный, а долг остался",
    "Не забудь про перевод",
  ],
  en: [
    "A reminder about lunch",
    "Still waiting for the transfer",
    "The lunch was good, the debt is still here",
    "Don't forget the transfer",
  ],
};
