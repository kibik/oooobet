import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseSlug } from "@/lib/yandex-eda";
import { initial } from "@/lib/utils";
import { money, roundMoney, formatMoney } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

function pluralizeDishes(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "блюдо";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "блюда";
  return "блюд";
}

function pluralizePeople(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "человек";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return "человека";
  return "человек";
}

const STATUS_LABEL: Record<
  string,
  { text: string; variant: "default" | "secondary" | "outline" }
> = {
  OPEN: { text: "Сбор заказов", variant: "default" },
  ORDERED: { text: "Ожидание оплаты", variant: "secondary" },
  CLOSED: { text: "Закрыт", variant: "outline" },
};

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Moscow",
});

function pluralizeTimes(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "раз";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "раза";
  return "раз";
}

function pluralizeOrders(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "заказ";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "заказа";
  return "заказов";
}

interface EaterStats {
  userId: string;
  name: string;
  avatarUrl: string | null;
  spent: number;
  dishes: number;
  orders: number;
}

export default async function HistoryPage() {
  const sessions = await prisma.orderSession.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      admin: { select: { firstName: true, lastName: true } },
      items: {
        select: {
          price: true,
          userId: true,
          dishName: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photoUrl: true,
              photoFileId: true,
            },
          },
        },
      },
      payments: { select: { userId: true } },
    },
  });

  // --- Who ate how much: totals across every order (dish prices, discount applied) ---
  type Stats = {
    currency: string;
    orders: number;
    dishes: number;
    food: number;
    extras: number;
    ranking: EaterStats[];
    topDishes: Array<[string, number]>;
  };

  // Money from different currencies cannot be summed, so each currency gets its
  // own set of numbers and its own leaderboard.
  const byCurrency = new Map<
    string,
    {
      eaters: Map<string, EaterStats & { sessionIds: Set<string> }>;
      dishCounts: Map<string, number>;
      dishes: number;
      food: number;
      extras: number;
      sessionIds: Set<string>;
    }
  >();

  for (const s of sessions) {
    const currency = s.currency || "RUB";
    let bucket = byCurrency.get(currency);
    if (!bucket) {
      bucket = {
        eaters: new Map(),
        dishCounts: new Map(),
        dishes: 0,
        food: 0,
        extras: 0,
        sessionIds: new Set(),
      };
      byCurrency.set(currency, bucket);
    }

    const discountMult = 1 - (s.discountPercent || 0) / 100;
    bucket.extras += money(s.deliveryFee) + money(s.serviceFee);
    bucket.sessionIds.add(s.id);

    for (const item of s.items) {
      const key = item.userId.toString();
      const spent = money(item.price) * discountMult;
      bucket.dishes++;
      bucket.food += spent;
      bucket.dishCounts.set(
        item.dishName,
        (bucket.dishCounts.get(item.dishName) || 0) + 1
      );

      let row = bucket.eaters.get(key);
      if (!row) {
        row = {
          userId: key,
          name: [item.user.firstName, item.user.lastName]
            .filter(Boolean)
            .join(" "),
          avatarUrl:
            item.user.photoUrl ||
            (item.user.photoFileId ? `/api/avatar/${key}` : null),
          spent: 0,
          dishes: 0,
          orders: 0,
          sessionIds: new Set<string>(),
        };
        bucket.eaters.set(key, row);
      }
      row.spent += spent;
      row.dishes++;
      row.sessionIds.add(s.id);
    }
  }

  // Busiest currency first — that is the one people are ordering in now
  const stats: Stats[] = [...byCurrency.entries()]
    .map(([currency, b]) => ({
      currency,
      orders: b.sessionIds.size,
      dishes: b.dishes,
      food: b.food,
      extras: b.extras,
      ranking: [...b.eaters.values()]
        .map((r) => ({ ...r, orders: r.sessionIds.size }))
        .sort((a, b2) => b2.spent - a.spent),
      topDishes: [...b.dishCounts.entries()]
        .sort((a, b2) => b2[1] - a[1] || a[0].localeCompare(b2[0]))
        .slice(0, 10),
    }))
    .sort((a, b) => b.orders - a.orders);

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight logo-gradient">
            oooobet!
          </h1>
          <p className="text-muted-foreground text-sm">
            История всех заказов — {sessions.length}
          </p>
          <Separator />
        </div>

        {/* ===== INFOGRAPHIC: who ate how much (per currency) ===== */}
        {stats.map((stat) => (
          <Card className="viz-root" key={stat.currency}>
            <CardContent className="py-5 space-y-5">
              {stats.length > 1 && (
                <div className="text-xs text-muted-foreground">
                  Заказы в {stat.currency === "RUB" ? "рублях" : stat.currency}
                </div>
              )}

              {/* KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                <div>
                  <div className="text-xs text-muted-foreground">Наели всего</div>
                  <div className="text-xl font-semibold tabular-nums leading-tight">
                    {formatMoney(stat.food, stat.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Доставка и сборы
                  </div>
                  <div className="text-xl font-semibold tabular-nums leading-tight">
                    {formatMoney(stat.extras, stat.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Блюд съедено</div>
                  <div className="text-xl font-semibold tabular-nums leading-tight">
                    {stat.dishes}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Средний чек</div>
                  <div className="text-xl font-semibold tabular-nums leading-tight">
                    {formatMoney(stat.food / Math.max(1, stat.dishes), stat.currency)}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Ranking: horizontal bars, one series → no legend needed */}
              <div className="space-y-1">
                <h2 className="text-sm font-medium">Кто сколько наел</h2>
                <p className="text-xs text-muted-foreground">
                  Сумма блюд за{" "}все заказы, со{" "}скидками, без{" "}доставки
                </p>
              </div>

              <div className="space-y-3">
                {stat.ranking.map((r, i) => (
                  <div
                    key={r.userId}
                    className="space-y-1.5"
                    title={`${r.name}: ${r.dishes} ${pluralizeDishes(r.dishes)} в ${r.orders} ${pluralizeOrders(r.orders)}, в среднем ${formatMoney(r.spent / r.dishes, stat.currency)} за блюдо`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground tabular-nums w-3.5 shrink-0">
                          {i + 1}
                        </span>
                        {r.avatarUrl ? (
                          <img
                            src={r.avatarUrl}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <span className="w-6 h-6 rounded-full bg-muted inline-flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
                            {initial(r.name)}
                          </span>
                        )}
                        <span className="text-sm truncate">{r.name}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
                          · {r.dishes} {pluralizeDishes(r.dishes)} · {r.orders}{" "}
                          {pluralizeOrders(r.orders)}
                        </span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums shrink-0">
                        {formatMoney(r.spent, stat.currency)}
                      </span>
                    </div>
                    {/* Bar: shared baseline for every row, 4px rounded data-end */}
                    <div className="pl-[1.375rem]">
                      <div
                        className="h-2.5 rounded-r-[4px] viz-bar"
                        style={{
                          width: `${Math.max(2, (r.spent / (stat.ranking[0]?.spent || 1)) * 100)}%`,
                        }}
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap sm:hidden">
                        {r.dishes} {pluralizeDishes(r.dishes)} · {r.orders}{" "}
                        {pluralizeOrders(r.orders)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {stat.topDishes.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <h2 className="text-sm font-medium">Хиты всех времён</h2>
                    <p className="text-xs text-muted-foreground">
                      Топ-10 блюд по{" "}числу заказов
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                    {stat.topDishes.map(([dish, count], i) => (
                      <div
                        key={dish}
                        className="flex items-center gap-2 text-sm"
                        title={`${dish} — ${count} ${pluralizeTimes(count)}`}
                      >
                        <span className="text-xs text-muted-foreground tabular-nums w-4 shrink-0 text-right">
                          {i + 1}
                        </span>
                        <span className="truncate flex-1 min-w-0">{dish}</span>
                        <span className="w-10 shrink-0 hidden sm:block">
                          <span
                            className="block h-1.5 rounded-r-[4px] viz-bar"
                            style={{
                              width: `${Math.max(8, (count / (stat.topDishes[0]?.[1] || 1)) * 100)}%`,
                            }}
                          />
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-14 text-right">
                          {count} {pluralizeTimes(count)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}

        {sessions.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-muted-foreground text-sm text-center">
                Пока не{" "}было ни{" "}одного заказа
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => {
              const slug = parseSlug(s.url);
              const foodSum = s.items.reduce((sum, i) => sum + money(i.price), 0);
              const discountMult = 1 - (s.discountPercent || 0) / 100;
              const totalSum = roundMoney(
                foodSum * discountMult + money(s.deliveryFee) + money(s.serviceFee)
              );
              const participants = new Set(
                s.items.map((i) => i.userId.toString())
              ).size;
              const statusInfo = STATUS_LABEL[s.status] || {
                text: s.status,
                variant: "outline" as const,
              };

              return (
                <Link
                  key={s.id}
                  href={`/order/${s.id}`}
                  className="block"
                >
                  <Card className="hover:bg-accent/50 hover:shadow-sm transition-all duration-150">
                    <CardContent className="py-4 space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-sm truncate">
                          {slug || s.url}
                        </span>
                        <Badge variant={statusInfo.variant}>
                          {statusInfo.text}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                        <span>{dateFmt.format(s.createdAt)}</span>
                        <span>·</span>
                        <span>
                          платил {s.admin.firstName} {s.admin.lastName || ""}
                        </span>
                        {s.items.length > 0 && (
                          <>
                            <span>·</span>
                            <span>
                              {s.items.length} {pluralizeDishes(s.items.length)}
                            </span>
                            <span>·</span>
                            <span>
                              {participants} {pluralizePeople(participants)}
                            </span>
                          </>
                        )}
                        {s.discountPercent > 0 && (
                          <>
                            <span>·</span>
                            <span>скидка {s.discountPercent}%</span>
                          </>
                        )}
                      </div>
                      {s.items.length > 0 && (
                        <div className="text-sm font-medium tabular-nums">
                          {formatMoney(totalSum, s.currency)}
                          {s.status === "ORDERED" && (
                            <span className="text-xs text-muted-foreground font-normal">
                              {" "}
                              · перевели {s.payments.length} из{" "}
                              {Math.max(0, participants - 1)}
                            </span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
