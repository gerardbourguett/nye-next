"use client";

import NumberFlow from "@number-flow/react";
import Link from "next/link";
import { useEffect, useState } from "react";

// Both anchors are local-time calendar dates: the countdown targets the user's
// own new year, not UTC. Never read them during render — only inside effects —
// so the server and client markup can't disagree.
const START = new Date(2026, 0, 1, 0, 0, 0, 0).getTime();
const TARGET = new Date(2027, 0, 1, 0, 0, 0, 0).getTime();

type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Elapsed fraction of the START -> TARGET window, clamped to 0..1. */
  progress: number;
};

function readCountdown(): Countdown {
  const now = Date.now();
  const totalSeconds = Math.max(0, Math.floor((TARGET - now) / 1000));

  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    progress: Math.min(1, Math.max(0, (now - START) / (TARGET - START))),
  };
}

export default function Home() {
  // null until mounted, so the first client render matches the server output.
  const [countdown, setCountdown] = useState<Countdown | null>(null);

  useEffect(() => {
    const tick = () => setCountdown(readCountdown());

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const units = [
    { label: "Days", value: countdown?.days },
    { label: "Hours", value: countdown?.hours },
    { label: "Minutes", value: countdown?.minutes },
    { label: "Seconds", value: countdown?.seconds },
  ];

  const percent = (countdown?.progress ?? 0) * 100;

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-12 overflow-hidden px-6 py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse at center, black, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black, transparent 70%)",
        }}
      />

      <header className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-6xl font-semibold tracking-tighter text-balance sm:text-8xl">
          #2027
          <span className="text-emerald-500 animate-pulse">Live</span>
        </h1>
        <Link
          href="/road-to"
          className="text-xs tracking-[0.2em] text-muted-foreground uppercase underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
        >
          See the relay →
        </Link>
      </header>

      <div
        role="timer"
        aria-label="Remaining time until January 1, 2027"
        className="grid w-full max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-4"
      >
        {units.map((unit) => (
          <div
            key={unit.label}
            className="flex flex-col items-center gap-3 bg-background px-4 py-8 sm:py-10"
          >
            <span className="text-5xl font-medium tracking-tighter tabular-nums sm:text-6xl">
              <NumberFlow
                value={unit.value ?? 0}
                format={{ minimumIntegerDigits: 2 }}
              />
            </span>
            <span className="text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
              {unit.label}
            </span>
          </div>
        ))}
      </div>

      <div className="w-full max-w-3xl">
        <div className="mb-3 flex items-baseline justify-between text-xs tracking-[0.2em] text-muted-foreground uppercase">
          <span>2026</span>
          <NumberFlow
            className="tabular-nums font-black"
            value={percent}
            locales="en-US"
            format={{
              minimumFractionDigits: 10,
              maximumFractionDigits: 10,
            }}
            suffix="%"
          />
          <span>2027</span>
        </div>
        <div
          role="progressbar"
          aria-label="Progress of the year 2026"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          className="h-1 w-full overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-1000 ease-linear"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </main>
  );
}
