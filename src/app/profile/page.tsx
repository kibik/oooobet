"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import TelegramLogin from "@/components/TelegramLogin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, loading, refresh, logout } = useAuth();
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;

    setSaving(true);
    try {
      const res = await fetch("/api/user/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone }),
      });

      if (res.ok) {
        toast.success("Номер телефона сохранен");
        refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || "Ошибка");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-lg">
          Загрузка...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight logo-gradient">oooobet!</h1>
          <p className="text-muted-foreground">Профиль</p>
        </div>

        {!user ? (
          <Card>
            <CardHeader>
              <CardTitle>Войдите через{"\u00A0"}Telegram</CardTitle>
              <CardDescription>
                Авторизуйтесь, чтобы настроить{"\u00A0"}профиль.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TelegramLogin
                botName={process.env.NEXT_PUBLIC_BOT_USERNAME || "edashare_bot"}
                onAuth={refresh}
              />
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>
                  {user.firstName} {user.lastName || ""}
                </CardTitle>
                {user.username && (
                  <CardDescription>@{user.username}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {user.phoneNumber ? (
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">
                      Номер телефона
                    </Label>
                    <p className="font-medium">+{user.phoneNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      Используется для{"\u00A0"}приема переводов через{"\u00A0"}Сбербанк
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSavePhone} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Номер телефона</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+7 900 123 45 67"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Нужен для{"\u00A0"}получения переводов через{"\u00A0"}Сбербанк, когда вы{"\u00A0"}организуете заказ.
                      </p>
                    </div>
                    <Button type="submit" disabled={saving} className="w-full">
                      {saving ? "Сохраняем..." : "Сохранить номер"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>

            <Button variant="outline" onClick={logout} className="w-full">
              Выйти
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
