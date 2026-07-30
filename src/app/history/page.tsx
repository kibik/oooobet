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

export default async function HistoryPage() {
  const sessions = await prisma.orderSession.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      admin: { select: { firstName: true, lastName: true } },
      items: { select: { price: true, userId: true } },
      payments: { select: { userId: true } },
    },
  });

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
