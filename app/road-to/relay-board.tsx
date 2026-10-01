"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Check,
  LocateFixed,
  Play,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { editionTag, editionYear } from "@/lib/edition";
import { providerName } from "@/lib/streams/domain";
import {
  watchHref,
  type CrossingStream,
  type CrossingStreams,
} from "@/lib/streams/relay-link";
import {
  resolveRolloverArrival,
  type RelayBand,
  type RelayPlace,
} from "@/data/relay";
import styles from "./relay-board.module.css";

const VISIBLE_PLACES = 6;
const TICK_MS = 30_000;

type Viewer = { offsetMinutes: number } | null;

function distinctCountries(places: RelayPlace[]) {
  const seen = new Map<string, string>();
  for (const place of places) {
    if (!seen.has(place.countryCode)) seen.set(place.countryCode, place.countryName);
  }
  return [...seen.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatSlotLocal(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BandStreams({
  list,
  now,
}: {
  list: CrossingStream[];
  now: number | null;
}) {
  return (
    <div className={styles.bandStreams}>
      <h4>Streams at this crossing</h4>
      <ul>
        {list.map((stream) => {
          const ended = now !== null && Date.parse(stream.endsAt) <= now;
          return (
            <li key={`${stream.slotId}:${stream.key}`}>
              {ended ? (
                <span className={styles.streamEnded}>{stream.label}</span>
              ) : (
                <Link className={styles.streamLink} href={watchHref(stream)}>
                  <Play size={14} aria-hidden="true" /> {stream.label}
                </Link>
              )}
              <span className={styles.streamMeta}>
                {stream.city} · {providerName(stream.provider)}
                {now !== null && (
                  <>
                    {" · "}
                    {ended ? "Ended " : "Scheduled "}
                    <time dateTime={stream.startsAt}>
                      {formatSlotLocal(stream.startsAt)}
                    </time>
                    –
                    <time dateTime={stream.endsAt}>
                      {formatSlotLocal(stream.endsAt)}
                    </time>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatArrivalLocal(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RelayBoard({
  bands,
  year,
  streams,
}: {
  bands: RelayBand[];
  year: number;
  /** Published programming per crossing, keyed by offset minutes. */
  streams: CrossingStreams;
}) {
  const router = useRouter();
  // Both stay null until mounted, so the server render and the first client
  // render agree — the viewer's own zone and "now" only exist in the browser.
  const [now, setNow] = useState<number | null>(null);
  const [viewer, setViewer] = useState<Viewer>(null);
  const requestedEdition = useRef(year);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const interval = setInterval(refresh, 300_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  useEffect(() => {
    const detectViewer = () => {
      try {
        const zoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const { offsetMinutes } = resolveRolloverArrival(zoneName, year);
        setViewer({ offsetMinutes });
      } catch {
        setViewer(null);
      }
    };
    detectViewer();
  }, [year]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // Once the wave is over the server serves the next edition; fetch it
  // promptly instead of waiting for the five-minute catalog refresh. One
  // request per edition, so a skewed device clock cannot loop refreshes.
  useEffect(() => {
    if (now === null) return;
    const current = editionYear(now);
    if (current !== year && current !== requestedEdition.current) {
      requestedEdition.current = current;
      router.refresh();
    }
  }, [now, year, router]);

  const crossedCount =
    now === null
      ? 0
      : bands.filter((band) => new Date(band.arrivalUtc).getTime() <= now).length;
  const percent = bands.length > 0 ? (crossedCount / bands.length) * 100 : 0;
  const nextBand = now === null ? undefined : bands[crossedCount];
  const viewerBand = bands.find(
    (band) => band.offsetMinutes === viewer?.offsetMinutes,
  );
  const complete =
    now !== null && bands.length > 0 && crossedCount === bands.length;
  // Only a stream that has not ended: a past slot's link would be discarded.
  const nextStream =
    nextBand && now !== null
      ? streams[nextBand.offsetMinutes]?.find(
          (stream) => Date.parse(stream.endsAt) > now,
        )
      : undefined;

  return (
    <main className={styles.board} id="relay-top">
      <a href="#crossing-order" className={styles.skipLink}>
        Skip to crossing order
      </a>
      <header className={styles.masthead}>
        <div className={styles.container}>
          <nav className={styles.navigation} aria-label="Relay navigation">
            <Link href="/" className={styles.brand}>
              <ArrowLeft size={18} aria-hidden="true" /> {editionTag(year)}
            </Link>
            <a
              href="/watch"
              className={styles.channelLink}
            >
              Enter viewing room <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </nav>
          <div className={styles.intro}>
            <h1>
              The Relay<span aria-hidden="true">.</span>
            </h1>
            <p>
              One planet. Many midnights.<br />
              Follow the places crossing into {year}, from the first
              timezone to the last.
            </p>
          </div>
          <div className={styles.progressHeading}>
            <span>Already in {year}</span>
            <span className={styles.progressCount}>
              {now === null ? "—" : crossedCount} / {bands.length} crossings
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`Bands already past midnight into ${year}`}
            aria-valuemin={0}
            aria-valuemax={bands.length || 1}
            aria-valuenow={now === null ? undefined : crossedCount}
            aria-valuetext={
              now === null
                ? "Checking the current time"
                : `${crossedCount} of ${bands.length} crossings`
            }
            className={styles.progressTrack}
          >
            <div
              className={styles.progressFill}
              style={{ transform: `scaleX(${percent / 100})` }}
            />
          </div>
        </div>
      </header>

      <div className={styles.container}>
        <section className={styles.overview} aria-label="Relay at a glance">
          <div>
            <h2>
              {bands.length === 0
                ? "Crossings unavailable"
                : complete
                  ? "The relay is complete"
                  : crossedCount === 0
                    ? "The first midnight"
                    : "The next midnight"}
            </h2>
            <div className={styles.nextContent}>
              <p className={styles.nextPlace}>
                {complete
                  ? `Every listed timezone is in ${year}.`
                  : (nextBand ?? bands[0])?.places[0]?.city ??
                    "No crossings available"}
              </p>
              {nextBand && (
                <a
                  className={styles.textLink}
                  href={`#crossing-${nextBand.offsetMinutes}`}
                >
                  View crossing <ArrowDown size={16} aria-hidden="true" />
                </a>
              )}
            </div>
            <p className={styles.overviewNote}>
              {complete ? (
                "Explore the full journey below."
              ) : nextBand ? (
                <>
                  {nextBand.offsetLabel}<span aria-hidden="true"> · </span>
                  <time dateTime={nextBand.arrivalUtc}>
                    {formatArrivalLocal(nextBand.arrivalUtc)}
                  </time>{" "}
                  your time
                </>
              ) : bands.length > 0 ? (
                "Local arrival times appear when your clock is ready."
              ) : (
                "Timezone data is unavailable. Try reloading this page."
              )}
            </p>
            {nextStream && (
              <p className={styles.overviewNote}>
                <Link className={styles.streamLink} href={watchHref(nextStream)}>
                  <Play size={14} aria-hidden="true" /> Watch {nextStream.label}
                </Link>
              </p>
            )}
          </div>
          <div className={styles.viewerOverview}>
            <h2>
              <LocateFixed size={16} aria-hidden="true" /> Your midnight
            </h2>
            {viewerBand && now !== null ? (
              <>
                <a
                  className={styles.viewerLink}
                  href={`#crossing-${viewerBand.offsetMinutes}`}
                >
                  {viewerBand.offsetLabel} <ArrowDown size={18} aria-hidden="true" />
                </a>
                <p className={styles.overviewNote}>
                  <time dateTime={viewerBand.arrivalUtc}>
                    {formatArrivalLocal(viewerBand.arrivalUtc)}
                  </time>{" "}
                  your time
                </p>
              </>
            ) : (
              <p className={styles.overviewNote}>
                {now === null
                  ? "Finding your timezone…"
                  : "Your timezone could not be matched. Browse the UTC offsets below."}
              </p>
            )}
          </div>
        </section>

        <section className={styles.crossings} aria-labelledby="crossing-order">
          <div className={styles.sectionHeading}>
            <h2 id="crossing-order" tabIndex={-1}>
              Crossing order
            </h2>
            <p>First to last. Arrival times are yours.</p>
          </div>
          <div className={styles.columnHeadings} aria-hidden="true">
            <span>Crossing / UTC offset</span>
            <span>Places reaching midnight</span>
            <span>Arrival in your time</span>
          </div>
          <ol
            aria-label="Places on Earth, in the order midnight reaches them"
            className={styles.crossingList}
          >
            {bands.map((band, index) => {
              const crossed =
                now !== null && new Date(band.arrivalUtc).getTime() <= now;
              const isViewer =
                viewer !== null && viewer.offsetMinutes === band.offsetMinutes;
              const isNext = nextBand?.offsetMinutes === band.offsetMinutes;
              const countries = distinctCountries(band.places);
              const visible = band.places.slice(0, VISIBLE_PLACES);
              const rest = band.places.slice(VISIBLE_PLACES);
              const bandStreams = streams[band.offsetMinutes];

              return (
                <li
                  key={band.offsetMinutes}
                  id={`crossing-${band.offsetMinutes}`}
                  tabIndex={-1}
                  className={cn(
                    styles.crossing,
                    crossed && styles.crossed,
                    isNext && styles.next,
                    isViewer && styles.viewer,
                  )}
                >
                  <div className={styles.crossingIdentity}>
                    <span className={styles.sequence} aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3>{band.offsetLabel}</h3>
                    <span className={styles.state}>
                      {crossed ? (
                        <><Check size={14} aria-hidden="true" /> Crossed</>
                      ) : isNext ? (
                        <><ArrowDown size={14} aria-hidden="true" /> Next crossing</>
                      ) : now === null ? "Scheduled" : "Upcoming"}
                    </span>
                  </div>

                  <div className={styles.places}>
                    {isViewer && (
                      <p className={styles.viewerMarker}>
                        <LocateFixed size={14} aria-hidden="true" /> You are here
                      </p>
                    )}
                    <p className={styles.cityNames}>
                      {visible.map((place) => place.city).join(", ")}
                    </p>
                    <div className={styles.placeMeta}>
                      <div className={styles.flags}>
                        {countries.map((country) => (
                          // eslint-disable-next-line @next/next/no-img-element -- static SVG flag icon, not a photo for Next's image optimizer to resize
                          <img
                            key={country.code}
                            src={`/flags/4x3/${country.code.toLowerCase()}.svg`}
                            alt={country.name}
                            title={country.name}
                            className={styles.flag}
                            width={24}
                            height={18}
                            loading="lazy"
                          />
                        ))}
                      </div>
                      <span className={styles.placeCount}>
                        {band.places.length}{" "}
                        {band.places.length === 1 ? "place" : "places"}
                      </span>
                    </div>
                    {rest.length > 0 && (
                      <details className={styles.morePlaces}>
                        <summary>
                          <span className={styles.showMore}>
                            Show {rest.length} more places
                          </span>
                          <span className={styles.showLess}>Show fewer places</span>
                        </summary>
                        <p>{rest.map((place) => place.city).join(", ")}</p>
                      </details>
                    )}
                    {bandStreams && <BandStreams list={bandStreams} now={now} />}
                  </div>
                  <div className={styles.arrival}>
                    {now !== null ? (
                      <time dateTime={band.arrivalUtc}>
                        {formatArrivalLocal(band.arrivalUtc)}
                      </time>
                    ) : <span>Awaiting local time</span>}
                    <span className={styles.arrivalNote}>
                      {now !== null ? "your time" : "Available after loading"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          {bands.length === 0 && (
            <p className={styles.emptyState}>
              No timezone crossings could be loaded. Try reloading this page.
            </p>
          )}
        </section>
        <footer className={styles.footer}>
          <p>
            One crossing per UTC offset at New Year, including half- and
            quarter-hour offsets. Your marker follows your offset, not a city.
          </p>
          <a className={styles.textLink} href="#relay-top">
            Back to top <ArrowUp size={16} aria-hidden="true" />
          </a>
        </footer>
      </div>
    </main>
  );
}
