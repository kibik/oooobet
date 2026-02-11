"use client";

import { useEffect, useState } from "react";

const EMOJIS = ["🤤", "🍕", "🍔", "🌮", "🍟", "🥡"];
const INTERVAL_MS = 15_000;
const VISIBLE_MS = 3_000;

export default function HungryEmojiPeek() {
  const [visible, setVisible] = useState(false);
  const [rightEmojis, setRightEmojis] = useState<string[]>([]);
  const [leftEmojis, setLeftEmojis] = useState<string[]>([]);

  const shuffle = (arr: string[], n: number) =>
    [...arr].sort(() => Math.random() - 0.5).slice(0, n);

  useEffect(() => {
    const show = () => {
      setRightEmojis(shuffle(EMOJIS, 3));
      setLeftEmojis(shuffle(EMOJIS, 2));
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

  return (
    <>
      <div
        className="fixed top-[18%] right-0 z-40 pr-0 transition-[transform] duration-500 ease-out will-change-transform"
        style={{
          transform: visible ? "translateX(0)" : "translateX(100%)",
        }}
        aria-hidden
      >
        <div className="flex flex-col gap-0.5 rounded-l-xl bg-background/95 px-2.5 py-2.5 shadow-lg border border-l-0 border-border">
          {rightEmojis.map((e, i) => (
            <span key={`r-${i}`} className="text-2xl leading-none">
              {e}
            </span>
          ))}
        </div>
      </div>

      <div
        className="fixed top-[58%] left-0 z-40 pl-0 transition-[transform] duration-500 ease-out will-change-transform"
        style={{
          transform: visible ? "translateX(0)" : "translateX(-100%)",
        }}
        aria-hidden
      >
        <div className="flex flex-col gap-0.5 rounded-r-xl bg-background/95 px-2.5 py-2.5 shadow-lg border border-r-0 border-border">
          {leftEmojis.map((e, i) => (
            <span key={`l-${i}`} className="text-2xl leading-none">
              {e}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
