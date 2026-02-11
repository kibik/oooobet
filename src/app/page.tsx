"use client";

import { useAuth } from "@/components/AuthProvider";
import TelegramLogin from "@/components/TelegramLogin";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { useMemo } from "react";

const DAILY_QUOTES = [
  "Хорош обед, когда в\u00A0нём и\u00A0десерт, и\u00A0винегрет, и\u00A0лишних дырок в\u00A0ремне нет",
  "Щи да\u00A0каша\u00A0— радость наша, а\u00A0если с\u00A0мясом\u00A0— так и\u00A0жизнь краше",
  "Брюхо\u00A0— не\u00A0зеркало: что в\u00A0него попало, то\u00A0и\u00A0пропало",
  "Не\u00A0беда, что в\u00A0супе лебеда, была\u00A0бы в\u00A0нём хоть капля сала",
  "Лучше пузо от\u00A0еды, чем горб от\u00A0работы",
];

function getDailyQuote(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
      86400000
  );
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || "oooobet_bot";

export default function HomePage() {
  const { user, loading, refresh, logout } = useAuth();
  const quote = useMemo(() => getDailyQuote(), []);

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight logo-gradient">
            oooobet!
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            {quote}
          </p>
        </div>

        <Separator />

        {/* How it works */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-center">
            Как это работает
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <div className="text-3xl mb-2">1</div>
                <CardTitle className="text-base">Выбери ресторан</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Найди ресторан в{"\u00A0"}Яндекс.Еде и{"\u00A0"}скинь ссылку{" "}
                  <a
                    href={`https://t.me/${BOT_USERNAME}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    боту
                  </a>
                  .
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="text-3xl mb-2">2</div>
                <CardTitle className="text-base">Пошарь ссылку</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Скинь ссылку в{"\u00A0"}чатик, дождись общего заказа.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="text-3xl mb-2">3</div>
                <CardTitle className="text-base">Получи кешбек</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  После заказа впиши сумму за{"\u00A0"}доставку и{"\u00A0"}получи деньги обратно.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>

        <Separator />

        {/* Auth section */}
        {loading ? (
          <div className="text-center animate-pulse text-muted-foreground">
            Загрузка...
          </div>
        ) : user ? (
          <Card>
            <CardHeader>
              <CardTitle>Привет, {user.firstName}!</CardTitle>
              <CardDescription>
                Вы авторизованы. Отправьте ссылку боту в{"\u00A0"}Telegram для{"\u00A0"}создания
                нового заказа.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <Link href="/profile" className="flex-1">
                  <Button variant="outline" className="w-full">
                    Профиль
                  </Button>
                </Link>
                <Button variant="ghost" onClick={logout} className="flex-1">
                  Выйти
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-4 text-center">
                Чтобы всё работало как{"\u00A0"}задумано, авторизуйся
              </p>
              <TelegramLogin
                botName={BOT_USERNAME}
                onAuth={refresh}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
