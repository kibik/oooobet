export const DAILY_QUOTES = [
  "Хорош обед, когда в\u00A0нём и\u00A0десерт, и\u00A0винегрет, и\u00A0лишних дырок в\u00A0ремне нет",
  "Щи да\u00A0каша\u00A0— радость наша, а\u00A0если с\u00A0мясом\u00A0— так и\u00A0жизнь краше",
  "Брюхо\u00A0— не\u00A0зеркало: что в\u00A0него попало, то\u00A0и\u00A0пропало",
  "Не\u00A0беда, что в\u00A0супе лебеда, была\u00A0бы в\u00A0нём хоть капля сала",
  "Лучше пузо от\u00A0еды, чем горб от\u00A0работы",
  "Война войной, а\u00A0обед по\u00A0расписанию",
  "Соловья баснями не\u00A0кормят",
  "Как потопаешь, так и\u00A0полопаешь",
  "Каков работник, таков и\u00A0обед",
  "На\u00A0пустой желудок и\u00A0работа не\u00A0спорится",
  "Сытый голодного не\u00A0разумеет",
  "Завтрак съешь сам, обед раздели с\u00A0другом",
  "После обеда полежи, после ужина походи",
  "Хлеба ни\u00A0куска\u00A0— и\u00A0в\u00A0горнице тоска",
];

const DAILY_QUOTES_EN = [
  "A good lunch is one you don't have to loosen your belt for",
  "An army marches on its stomach",
  "Hunger is the best sauce",
  "You can't work on an empty stomach",
  "The way to a colleague's heart is through their lunch",
  "Eat breakfast yourself, share lunch with a friend",
  "After lunch rest a while, after dinner walk a mile",
  "Lunch tastes better when someone else orders it",
];

export function getDailyQuote(locale: "ru" | "en" = "ru"): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
      86400000
  );
  const quotes = locale === "en" ? DAILY_QUOTES_EN : DAILY_QUOTES;
  return quotes[dayOfYear % quotes.length];
}
