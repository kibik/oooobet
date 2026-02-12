"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface TelegramLoginProps {
  botName: string;
  onAuth: () => void;
}

export default function TelegramLogin({ botName, onAuth }: TelegramLoginProps) {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "waiting" | "confirmed" | "expired">("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Generate token and start polling
  const startAuth = useCallback(async () => {
    cleanup();
    setAuthToken(null);
    setStatus("idle");

    try {
      const res = await fetch("/api/auth/token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Не удалось войти. Попробуйте ещё раз.");
        return;
      }
      if (!data.token) {
        toast.error("Ошибка сервера. Попробуйте ещё раз.");
        return;
      }
      setAuthToken(data.token);
      setStatus("waiting");

      // Open Telegram bot link
      const botLink = `https://t.me/${botName}?start=auth_${data.token}`;
      const opened = window.open(botLink, "_blank");
      if (!opened) {
        toast.error("Браузер заблокировал окно. Разрешите всплывающие окна или скопируйте ссылку из Telegram.");
      }

      // Start polling every 2 seconds
      pollRef.current = setInterval(async () => {
        try {
          const check = await fetch(`/api/auth/token/${data.token}`);
          if (!check.ok) return;
          const result = await check.json();

          if (result.confirmed) {
            cleanup();
            setStatus("confirmed");
            onAuth();
          } else if (result.expired) {
            cleanup();
            setStatus("expired");
          }
        } catch {
          // ignore polling errors
        }
      }, 2000);
    } catch {
      toast.error("Ошибка сети. Проверьте подключение и попробуйте ещё раз.");
      setStatus("idle");
    }
  }, [botName, onAuth, cleanup]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  return (
    <div className="flex flex-col items-center gap-3">
      {status === "confirmed" ? (
        <p className="text-sm text-green-600 font-medium">Авторизация прошла успешно!</p>
      ) : (
        <>
          <Button onClick={startAuth} className="w-full" size="lg">
            Войти через{"\u00A0"}Telegram
          </Button>

          {status === "waiting" && (
            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground animate-pulse">
                Нажми «Start» в{"\u00A0"}Telegram и{"\u00A0"}вернись сюда...
              </p>
              <p className="text-xs">
                <a
                  href={authToken ? `https://t.me/${botName}?start=auth_${authToken}` : `https://t.me/${botName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Открыть бота в Telegram →
                </a>
              </p>
            </div>
          )}

          {status === "expired" && (
            <p className="text-xs text-destructive text-center">
              Ссылка устарела.{" "}
              <button onClick={startAuth} className="underline hover:no-underline">
                Попробовать ещё раз
              </button>
            </p>
          )}

          {status === "idle" && (
            <p className="text-xs text-muted-foreground text-center">
              Откроется Telegram — подтверди вход одной кнопкой
            </p>
          )}
        </>
      )}
    </div>
  );
}
