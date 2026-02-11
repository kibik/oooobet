"use client";

import { useEffect, useState } from "react";

const EMOJIS = ["🤤", "🍕", "🍔", "🌮", "🍟", "🥡"];
const INTERVAL_MS = 10_000;
const VISIBLE_MS = 3_000;

export default function HungryEmojiPeek() {
  const [visible, setVisible] = useState(false);
  const [emoji, setEmoji] = useState("");
  const [side, setSide] = useState<"left" | "right">("right");
  const [topPercent, setTopPercent] = useState(50);

  useEffect(() => {
    const show = () => {
      const newSide = Math.random() >= 0.5 ? "left" : "right";
      setEmoji(EMOJIS[Math.floor(Math.random() * EMOJIS.length)]!);
      setSide(newSide);
      setTopPercent(15 + Math.random() * 70);
      setVisible(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true);
        });
      });
      const t = window.setTimeout(() => setVisible(false), VISIBLE_MS);
      return () => window.clearTimeout(t);
    };

    const first = window.setTimeout(show, 2000);
    const id = window.setInterval(show, INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  const fromRight = side === "right";
  // Сдвиг на 100vw — эмодзи точно за границей экрана. Справа: скрыт в +100vw, показ = движение влево; слева: скрыт в -100vw, показ = движение вправо.
  const xOff = visible ? "0" : fromRight ? "100vw" : "-100vw";

  return (
    <div
      className={`fixed z-40 transition-[transform] duration-500 ease-out will-change-transform ${
        fromRight ? "right-0" : "left-0"
      }`}
      style={{
        top: `${topPercent}%`,
        transform: `translateX(${xOff}) translateY(-50%)`,
      }}
      aria-hidden
    >
      <span
        className="leading-none select-none block"
        style={{ fontSize: "7.5rem" }}
      >
        {emoji}
      </span>
    </div>
  );
}
