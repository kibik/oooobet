"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface TelegramLoginProps {
  botName: string;
  onAuth: () => void;
}

export default function TelegramLogin({ botName, onAuth }: TelegramLoginProps) {
  const [token, setToken] = useState<string | null>(null);
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
    setStatus("idle");

    try {
      const res = await fetch("/api/auth/token", { method: "POST" });
      if (!res.ok) return;
      const data = await res.json();
      setToken(data.token);
      setStatus("waiting");

      // Open Telegram bot link
      const botLink = `https://t.me/${botName}?start=auth_${data.token}`;
      window.open(botLink, "_blank");

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
            <p className="text-xs text-muted-foreground text-center animate-pulse">
              Нажми «Start» в{"\u00A0"}Telegram и{"\u00A0"}вернись сюда...
            </p>
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
