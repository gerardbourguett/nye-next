"use client";

import NumberFlow from "@number-flow/react";
import Link from "next/link";

import { SimulationNotice } from "@/components/simulation-notice";
import { editionYear } from "@/lib/edition";
import { simulationHref, type Simulation } from "@/lib/relay-clock";
import { useClock } from "@/lib/use-clock";

type CountdownState = {
  /** The edition being counted down to, re-derived on every tick. */
  year: number;
  /** The viewer's own midnight has passed while the wave is still crossing. */
  arrived: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Elapsed fraction of the start -> target window, clamped to 0..1. */
  progress: number;
};

// Both anchors are local-time calendar dates: the countdown targets the
// viewer's own new year, not UTC. Only read inside effects, so the server and
// client markup can't disagree.
function readCountdown(now: number): CountdownState {
  const year = editionYear(now);
  const start = new Date(year - 1, 0, 1, 0, 0, 0, 0).getTime();
  const target = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
  const totalSeconds = Math.max(0, Math.floor((target - now) / 1000));

  return {
    year,
    arrived: now >= target,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    progress: Math.min(1, Math.max(0, (now - start) / (target - start))),
  };
}

export function Countdown({ initialYear, simulation }: { initialYear: number; simulation: Simulation | null }) {
  // null until mounted, so the first client render matches the server output.
  const now = useClock(simulation);
  const countdown = now === null ? null : readCountdown(now);
  // A preview carries its simulated instant to the other pages.
  const carry = (path: string) => (simulation && now !== null ? simulationHref(now, simulation.speed, path) : path);

  const units = [
    { label: "Days", value: countdown?.days },
    { label: "Hours", value: countdown?.hours },
    { label: "Minutes", value: countdown?.minutes },
    { label: "Seconds", value: countdown?.seconds },
  ];

  const percent = (countdown?.progress ?? 0) * 100;
  const year = countdown?.year ?? initialYear;

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

      {simulation && <SimulationNotice simulation={simulation} now={now} exitHref="/" className="w-full max-w-3xl" />}

      <header className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-6xl font-semibold tracking-tighter text-balance sm:text-8xl">
          #{year}
          <span className="text-emerald-500 animate-pulse">Live</span>
        </h1>
        {countdown?.arrived && (
          <p role="status" className="text-lg text-balance">
            It&rsquo;s {year} here. Midnight is still crossing the planet.
          </p>
        )}
        <nav
          aria-label="Broadcast"
          className="flex flex-wrap justify-center gap-x-8 gap-y-3"
        >
          <Link
            href={carry("/road-to")}
            className="text-xs tracking-[0.2em] text-muted-foreground uppercase underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
          >
            See the relay →
          </Link>
          <Link
            href={carry("/watch")}
            className="text-xs tracking-[0.2em] text-muted-foreground uppercase underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
          >
            Enter the viewing room →
          </Link>
        </nav>
      </header>

      <div
        role="timer"
        aria-label={`Remaining time until January 1, ${year}`}
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
          <span>{year - 1}</span>
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
          <span>{year}</span>
        </div>
        <div
          role="progressbar"
          aria-label={`Progress of the year ${year - 1}`}
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
