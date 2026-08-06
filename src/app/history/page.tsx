import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseSlug } from "@/lib/yandex-eda";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

// Format number with thin space thousands separator and before ₽
function fmtPrice(n: number): string {
  const formatted = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${formatted} ₽`;
}

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
  const eaters = new Map<string, EaterStats & { sessionIds: Set<string> }>();
  const dishCounts = new Map<string, number>();
  let allDishes = 0;
  let allFood = 0;
  let allExtras = 0;

  for (const s of sessions) {
    const discountMult = 1 - (s.discountPercent || 0) / 100;
    allExtras += s.deliveryFee + s.serviceFee;

    for (const item of s.items) {
      const key = item.userId.toString();
      const spent = item.price * discountMult;
      allDishes++;
      allFood += spent;
      dishCounts.set(item.dishName, (dishCounts.get(item.dishName) || 0) + 1);

      let row = eaters.get(key);
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
        eaters.set(key, row);
      }
      row.spent += spent;
      row.dishes++;
      row.sessionIds.add(s.id);
    }
  }

  const ranking: EaterStats[] = [...eaters.values()]
    .map((r) => ({ ...r, orders: r.sessionIds.size }))
    .sort((a, b) => b.spent - a.spent);

  const maxSpent = ranking[0]?.spent || 1;
  const topDish = [...dishCounts.entries()].sort((a, b) => b[1] - a[1])[0];

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

        {/* ===== INFOGRAPHIC: who ate how much ===== */}
        {ranking.length > 0 && (
          <Card className="viz-root">
            <CardContent className="py-5 space-y-5">
              {/* KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                <div>
                  <div className="text-xs text-muted-foreground">Наели всего</div>
                  <div className="text-xl font-semibold tabular-nums leading-tight">
                    {fmtPrice(allFood)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Яндексу отдали
                  </div>
                  <div className="text-xl font-semibold tabular-nums leading-tight">
                    {fmtPrice(allExtras)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Блюд съедено</div>
                  <div className="text-xl font-semibold tabular-nums leading-tight">
                    {allDishes}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Средний чек</div>
                  <div className="text-xl font-semibold tabular-nums leading-tight">
                    {fmtPrice(allFood / Math.max(1, allDishes))}
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
                {ranking.map((r, i) => (
                  <div
                    key={r.userId}
                    className="space-y-1.5"
                    title={`${r.name}: ${r.dishes} ${pluralizeDishes(r.dishes)} в ${r.orders} ${pluralizeOrders(r.orders)}, в среднем ${fmtPrice(r.spent / r.dishes)} за блюдо`}
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
                            {r.name[0]}
                          </span>
                        )}
                        <span className="text-sm truncate">{r.name}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
                          · {r.dishes} {pluralizeDishes(r.dishes)} · {r.orders}{" "}
                          {pluralizeOrders(r.orders)}
                        </span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums shrink-0">
                        {fmtPrice(r.spent)}
                      </span>
                    </div>
                    {/* Bar: shared baseline for every row, 4px rounded data-end */}
                    <div className="pl-[1.375rem]">
                      <div
                        className="h-2.5 rounded-r-[4px] viz-bar"
                        style={{
                          width: `${Math.max(2, (r.spent / maxSpent) * 100)}%`,
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

              {topDish && (
                <>
                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    Хит всех времён:{" "}
                    <span className="text-foreground font-medium">
                      {topDish[0]}
                    </span>{" "}
                    — заказали {topDish[1]}{" "}
                    {topDish[1] === 1 ? "раз" : "раза"}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

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
              const foodSum = s.items.reduce((sum, i) => sum + i.price, 0);
              const discountMult = 1 - (s.discountPercent || 0) / 100;
              const totalSum = Math.round(
                foodSum * discountMult + s.deliveryFee + s.serviceFee
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
                          {fmtPrice(totalSum)}
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
