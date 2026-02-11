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
      setEmoji(EMOJIS[Math.floor(Math.random() * EMOJIS.length)]!);
      setSide(Math.random() >= 0.5 ? "left" : "right");
      setTopPercent(15 + Math.random() * 70);
      setVisible(true);
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

  const topStyle = { top: `${topPercent}%` };
  const emojiEl = (
    <span
      className="leading-none select-none block"
      style={{ fontSize: "7.5rem" }}
    >
      {emoji}
    </span>
  );

  return (
    <>
      {/* Левый: всегда left:0, скрыт = -100vw, показан = 0 */}
      <div
        className="fixed left-0 z-40 transition-[transform] duration-500 ease-out will-change-transform"
        style={{
          ...topStyle,
          transform: `translateX(${side === "left" && visible ? "0" : "-100vw"}) translateY(-50%)`,
        }}
        aria-hidden
      >
        {emojiEl}
      </div>
      {/* Правый: всегда right:0, скрыт = 100vw, показан = 0 */}
      <div
        className="fixed right-0 z-40 transition-[transform] duration-500 ease-out will-change-transform"
        style={{
          ...topStyle,
          transform: `translateX(${side === "right" && visible ? "0" : "100vw"}) translateY(-50%)`,
        }}
        aria-hidden
      >
        {emojiEl}
      </div>
    </>
  );
}
