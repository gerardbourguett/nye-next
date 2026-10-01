"use client";

import { useEffect, useId, useRef, useState } from "react";

import { formatRemaining, readClock, type Simulation } from "@/lib/relay-clock";
import styles from "./relay-board.module.css";

export type PlaceOption = { zoneName: string; label: string };

/**
 * Seconds until `target` on the board's (possibly simulated) clock. Ticks on
 * its own so the whole board does not re-render every second, and reports
 * the crossing once so the board can advance without waiting for its tick.
 */
export function Countdown({
  target,
  simulation,
  anchor,
  label,
  onArrive,
}: {
  target: number;
  simulation: Simulation | null;
  anchor: number;
  /** Accessible name, e.g. "Time until midnight in Sydney". */
  label: string;
  onArrive?: () => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const arrive = useRef(onArrive);
  useEffect(() => {
    arrive.current = onArrive;
  }, [onArrive]);

  const at = simulation?.at ?? null;
  const speed = simulation?.speed ?? 1;
  useEffect(() => {
    const clock = at === null ? null : { at, speed };
    let reported = false;
    const tick = () => {
      const left = target - readClock(clock, anchor, Date.now());
      setRemaining(left);
      if (left <= 0 && !reported) {
        reported = true;
        arrive.current?.();
      }
    };
    tick();
    const interval = setInterval(tick, speed > 1 ? 250 : 1_000);
    return () => clearInterval(interval);
  }, [target, at, speed, anchor]);

  if (remaining === null) return null;
  return (
    <span role="timer" aria-label={label} className={styles.countdown}>
      {remaining > 0 ? `in ${formatRemaining(remaining)}` : "now"}
    </span>
  );
}

/**
 * A native text field over a shared datalist of every place on the board.
 * Accepts the exact list label, or a unique city name typed in any case.
 */
export function PlaceFinder({
  listId,
  options,
  label,
  action,
  onPick,
}: {
  listId: string;
  options: readonly PlaceOption[];
  label: string;
  action: string;
  onPick: (zoneName: string) => void;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className={styles.finder}
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim().toLocaleLowerCase();
        const exact = options.find((option) => option.label.toLocaleLowerCase() === query);
        const byCity = options.filter((option) =>
          option.label.toLocaleLowerCase().startsWith(`${query},`),
        );
        const match = exact ?? (byCity.length === 1 ? byCity[0] : undefined);
        if (!query || !match) {
          setError(
            byCity.length > 1
              ? "Several places share that name. Pick one from the list."
              : "No listed place matches. Pick one from the list.",
          );
          return;
        }
        setError("");
        setValue(match.label);
        onPick(match.zoneName);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className={styles.finderRow}>
        <input
          id={id}
          list={listId}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          placeholder="City or place"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button type="submit">{action}</button>
      </div>
      {error && (
        <p id={`${id}-error`} className={styles.finderError} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
