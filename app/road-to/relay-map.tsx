"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { RelayBand } from "@/data/relay";
import map from "@/data/map-offsets.json";
import styles from "./relay-board.module.css";

const MAP_URL = "/maps/time-zones.svg";

function formatLocal(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The world's time-zone regions, one layer per UTC offset in force at New
 * Year, each lit as its midnight passes. Layers are keyboard-selectable; the
 * crossing list stays the full, accessible source of truth.
 */
export function RelayMap({
  bands,
  now,
  year,
  viewerOffset,
  nextOffset,
  onShow,
}: {
  bands: RelayBand[];
  now: number | null;
  year: number;
  viewerOffset: number | undefined;
  nextOffset: number | undefined;
  onShow: (band: RelayBand) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const bandOf = new Map(bands.map((band) => [band.offsetMinutes, band]));
  const active = selected === null ? undefined : bandOf.get(selected);
  const crossed = (band: RelayBand | undefined) =>
    band !== undefined && now !== null && Date.parse(band.arrivalUtc) <= now;
  const crossedCount = map.offsets.filter((offset) => crossed(bandOf.get(offset))).length;

  return (
    <section className={styles.mapSection} aria-labelledby="relay-map-heading">
      <div className={styles.sectionHeading}>
        <h2 id="relay-map-heading">The map</h2>
        <p>Select a time zone for its midnight.</p>
      </div>
      <svg
        className={styles.map}
        viewBox={map.viewBox.join(" ")}
        aria-label={
          now === null
            ? `World time zones crossing into ${year}.`
            : `World time zones: ${crossedCount} of ${map.offsets.length} already in ${year}.`
        }
        role="group"
      >
        {map.offsets.map((offset) => {
          const band = bandOf.get(offset);
          const label = band
            ? `${band.offsetLabel}, ${band.headline.city}: ${crossed(band) ? `in ${year}` : "not yet"}`
            : undefined;
          return (
            <use
              key={offset}
              href={`${MAP_URL}#o${offset}`}
              className={cn(
                styles.mapZone,
                !band && styles.mapUnlisted,
                crossed(band) && styles.mapCrossed,
                offset === nextOffset && styles.mapNext,
                offset === viewerOffset && styles.mapViewer,
                offset === selected && styles.mapSelected,
              )}
              {...(band && {
                role: "button",
                tabIndex: 0,
                "aria-label": label,
                "aria-pressed": offset === selected,
                onClick: () => setSelected(offset),
                onKeyDown: (event: React.KeyboardEvent) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(offset);
                  }
                },
              })}
            >
              {label && <title>{label}</title>}
            </use>
          );
        })}
      </svg>
      <ul className={styles.mapLegend} aria-label="Map legend">
        <li><span className={cn(styles.legendSwatch, styles.mapCrossed)} aria-hidden="true" /> Already in {year}</li>
        <li><span className={cn(styles.legendSwatch, styles.mapNext)} aria-hidden="true" /> Next crossing</li>
        <li><span className={cn(styles.legendSwatch, styles.mapViewer)} aria-hidden="true" /> Your midnight</li>
        <li><span className={styles.legendSwatch} aria-hidden="true" /> Still in {year - 1}</li>
      </ul>
      <div className={styles.mapCaption} aria-live="polite">
        {active ? (
          <>
            <p>
              <strong>{active.offsetLabel}</strong>
              <span aria-hidden="true"> · </span>
              {active.headline.city}
              {active.places.length > 1 && ` and ${active.places.length - 1} more`}
              {now !== null && (
                <>
                  <span aria-hidden="true"> · </span>
                  {crossed(active) ? (
                    `In ${year}`
                  ) : (
                    <>
                      Midnight <time dateTime={active.arrivalUtc}>{formatLocal(active.arrivalUtc)}</time> your time
                    </>
                  )}
                </>
              )}
            </p>
            <button type="button" className={styles.textButton} onClick={() => onShow(active)}>
              Show in crossing order
            </button>
          </>
        ) : (
          <p>Time zones light up as their midnight passes.</p>
        )}
      </div>
      <p className={styles.mapCredit}>
        Map: Heitordp, Wikimedia Commons (public domain), after the CIA and IANA tzdata.
      </p>
    </section>
  );
}
