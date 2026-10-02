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
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { editionTag, editionYear } from "@/lib/edition";
import { readClock, simulationHref, type Simulation } from "@/lib/relay-clock";
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
import { Countdown, PlaceFinder, type PlaceOption } from "./relay-controls";
import { RelayMap } from "./relay-map";

const VISIBLE_PLACES = 6;
const TICK_MS = 30_000;
const PLACE_KEY = "relay:place";
const PLACES_LIST_ID = "relay-places";
const PREVIEW_SPEED = 60;

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

/** Times only within one local day; dates too when a slot crosses midnight. */
function formatSlotLocal(iso: string, withDate: boolean) {
  return new Date(iso).toLocaleString(undefined, {
    ...(withDate && { month: "short", day: "numeric" }),
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
          // Dates whenever the slot spans more than one of the viewer's days.
          const long = new Date(stream.startsAt).toDateString() !== new Date(stream.endsAt).toDateString();
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
                      {formatSlotLocal(stream.startsAt, long)}
                    </time>
                    –
                    <time dateTime={stream.endsAt}>
                      {formatSlotLocal(stream.endsAt, long)}
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

/** Headline first, then the rest by city, as the row lists them. */
function orderedPlaces(band: RelayBand) {
  return [band.headline, ...band.places.filter((place) => place !== band.headline)];
}

function PlaceNames({ places, found }: { places: RelayPlace[]; found: string | null }) {
  return places.map((place, index) => (
    <span key={place.zoneName}>
      {index > 0 && ", "}
      {place.zoneName === found ? (
        <strong className={styles.foundPlace}>{place.city}</strong>
      ) : (
        place.city
      )}
    </span>
  ));
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
  simulation,
}: {
  bands: RelayBand[];
  year: number;
  /** Published programming per crossing, keyed by offset minutes. */
  streams: CrossingStreams;
  /** Preview mode from `?at=&speed=`; null follows the real clock. */
  simulation: Simulation | null;
}) {
  const router = useRouter();
  // All stay null until mounted, so the server render and the first client
  // render agree — the viewer's own zone and "now" only exist in the browser.
  const [now, setNow] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [viewer, setViewer] = useState<Viewer>(null);
  const [chosenZone, setChosenZone] = useState<string | null>(null);
  const [found, setFound] = useState<
    { zoneName: string; offsetMinutes: number; seq: number } | null
  >(null);
  const requestedEdition = useRef(year);
  const simAt = simulation?.at ?? null;
  const simSpeed = simulation?.speed ?? 1;

  const places = useMemo(() => {
    const entries = bands.flatMap((band) =>
      band.places.map((place) => ({ place, offsetMinutes: band.offsetMinutes })),
    );
    const counts = new Map<string, number>();
    for (const { place } of entries) {
      const label = `${place.city}, ${place.countryName}`;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return entries.map((entry) => {
      const label = `${entry.place.city}, ${entry.place.countryName}`;
      return {
        ...entry,
        zoneName: entry.place.zoneName,
        label: (counts.get(label) ?? 0) > 1 ? `${label} (${entry.place.zoneName})` : label,
      };
    });
  }, [bands]);
  const placeOptions: PlaceOption[] = useMemo(
    () => [...places].sort((a, b) => a.label.localeCompare(b.label)),
    [places],
  );

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
    const restore = () => {
      try {
        setChosenZone(window.localStorage.getItem(PLACE_KEY));
      } catch {
        // Storage can be blocked; the device timezone still works.
      }
    };
    restore();
  }, []);

  // A new simulation (or none) restarts the clock from this moment.
  useEffect(() => {
    const start = () => setAnchor(Date.now());
    start();
  }, [simAt, simSpeed]);

  useEffect(() => {
    if (anchor === null) return;
    const clock = simAt === null ? null : { at: simAt, speed: simSpeed };
    const tick = () => setNow(readClock(clock, anchor, Date.now()));
    tick();
    // Fast previews tick every second so crossings keep up with the clock.
    const interval = setInterval(tick, clock && clock.speed > 1 ? 1_000 : TICK_MS);
    return () => clearInterval(interval);
  }, [anchor, simAt, simSpeed]);

  // Bring a found place into view once its row has rendered. Keyed on the
  // search itself, so catalog refreshes never scroll back to an old result.
  useEffect(() => {
    if (!found) return;
    const row = document.getElementById(`crossing-${found.offsetMinutes}`);
    if (!row) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    row.focus({ preventScroll: true });
  }, [found]);

  const choosePlace = (zoneName: string | null) => {
    setChosenZone(zoneName);
    try {
      if (zoneName) window.localStorage.setItem(PLACE_KEY, zoneName);
      else window.localStorage.removeItem(PLACE_KEY);
    } catch {
      // The choice still applies for this visit.
    }
  };
  const showPlace = (zoneName: string) => {
    const entry = places.find((item) => item.zoneName === zoneName);
    if (!entry) return;
    setFound((current) => ({
      zoneName,
      offsetMinutes: entry.offsetMinutes,
      seq: (current?.seq ?? 0) + 1,
    }));
  };
  const advance = () => {
    if (anchor === null) return;
    setNow(readClock(simAt === null ? null : { at: simAt, speed: simSpeed }, anchor, Date.now()));
  };

  // Once the wave is over the server serves the next edition; fetch it
  // promptly instead of waiting for the five-minute catalog refresh. One
  // request per edition, so a skewed device clock cannot loop refreshes.
  useEffect(() => {
    if (now === null) return;
    const current = editionYear(now);
    if (current !== year && current !== requestedEdition.current) {
      requestedEdition.current = current;
      // The server derives a preview's edition from `at`, so a preview moves
      // on by restarting from the current simulated instant instead.
      if (simAt !== null) router.replace(simulationHref(now, simSpeed), { scroll: false });
      else router.refresh();
    }
  }, [now, year, router, simAt, simSpeed]);

  const crossedCount =
    now === null
      ? 0
      : bands.filter((band) => new Date(band.arrivalUtc).getTime() <= now).length;
  const percent = bands.length > 0 ? (crossedCount / bands.length) * 100 : 0;
  const nextBand = now === null ? undefined : bands[crossedCount];
  // A chosen place overrides the device timezone; a stale choice is ignored.
  const chosen = places.find((item) => item.zoneName === chosenZone);
  const viewerOffset = chosen?.offsetMinutes ?? viewer?.offsetMinutes;
  const viewerBand = bands.find((band) => band.offsetMinutes === viewerOffset);
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
      <datalist id={PLACES_LIST_ID}>
        {placeOptions.map((option) => (
          <option key={option.zoneName} value={option.label} />
        ))}
      </datalist>
      <header className={styles.masthead}>
        <div className={styles.container}>
          {simulation && (
            <div className={styles.simulation}>
              {/* Only the static notice is a live region; the ticking clock
                  beside it would otherwise be re-announced every second. */}
              <p role="status">
                <strong>Preview</strong>: simulated time
                {simulation.speed > 1 && ` at ${simulation.speed}× speed`}.
                Nothing here is live.
              </p>
              <p>
                {now !== null && (
                  <time dateTime={new Date(now).toISOString()}>
                    {formatArrivalLocal(new Date(now).toISOString())}
                  </time>
                )}{" "}
                <Link href="/road-to" className={styles.textLink}>
                  Back to real time
                </Link>
              </p>
            </div>
          )}
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
                  : (nextBand ?? bands[0])?.headline.city ??
                    "No crossings available"}
              </p>
              {nextBand && anchor !== null && (
                <Countdown
                  target={Date.parse(nextBand.arrivalUtc)}
                  simulation={simulation}
                  anchor={anchor}
                  label={`Time until midnight in ${nextBand.headline.city}`}
                  onArrive={advance}
                />
              )}
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
                  {chosen ? `${chosen.place.city} · ` : ""}
                  {viewerBand.offsetLabel} <ArrowDown size={18} aria-hidden="true" />
                </a>
                <p className={styles.overviewNote}>
                  <time dateTime={viewerBand.arrivalUtc}>
                    {formatArrivalLocal(viewerBand.arrivalUtc)}
                  </time>{" "}
                  your time
                  {anchor !== null && Date.parse(viewerBand.arrivalUtc) > now && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <Countdown
                        target={Date.parse(viewerBand.arrivalUtc)}
                        simulation={simulation}
                        anchor={anchor}
                        label="Time until your midnight"
                        onArrive={advance}
                      />
                    </>
                  )}
                </p>
                <p className={styles.overviewNote}>
                  {chosen ? "Your chosen place." : "From your device's timezone."}
                </p>
              </>
            ) : (
              <p className={styles.overviewNote}>
                {now === null
                  ? "Finding your timezone…"
                  : "Your timezone could not be matched. Choose your place below."}
              </p>
            )}
            {now !== null && (
              <>
                <PlaceFinder
                  listId={PLACES_LIST_ID}
                  options={placeOptions}
                  label="Celebrating somewhere else?"
                  action="Set my place"
                  onPick={choosePlace}
                />
                {chosen && (
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => choosePlace(null)}
                  >
                    Use my device&rsquo;s timezone
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {bands.length > 0 && (
          <RelayMap
            bands={bands}
            now={now}
            year={year}
            viewerOffset={viewerOffset}
            nextOffset={nextBand?.offsetMinutes}
            onShow={(band) => showPlace(band.headline.zoneName)}
          />
        )}

        <section className={styles.crossings} aria-labelledby="crossing-order">
          <div className={styles.sectionHeading}>
            <h2 id="crossing-order" tabIndex={-1}>
              Crossing order
            </h2>
            <p>First to last. Arrival times are yours.</p>
          </div>
          <div className={styles.findBar}>
            <PlaceFinder
              listId={PLACES_LIST_ID}
              options={placeOptions}
              label="Find a place"
              action="Show crossing"
              onPick={showPlace}
            />
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
              const isViewer = viewerOffset === band.offsetMinutes;
              const isNext = nextBand?.offsetMinutes === band.offsetMinutes;
              const countries = distinctCountries(band.places);
              const ordered = orderedPlaces(band);
              const visible = ordered.slice(0, VISIBLE_PLACES);
              const rest = ordered.slice(VISIBLE_PLACES);
              const foundZone = found?.zoneName ?? null;
              const foundInRest = rest.some((place) => place.zoneName === foundZone);
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
                        {chosen && chosen.offsetMinutes === band.offsetMinutes
                          ? ` · ${chosen.place.city}`
                          : ""}
                      </p>
                    )}
                    <p className={styles.cityNames}>
                      <PlaceNames places={visible} found={foundZone} />
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
                      <details
                        // Remount open when a search lands on a hidden place.
                        key={foundInRest ? `found-${found?.seq}` : "closed"}
                        className={styles.morePlaces}
                        open={foundInRest || undefined}
                      >
                        <summary>
                          <span className={styles.showMore}>
                            Show {rest.length} more places
                          </span>
                          <span className={styles.showLess}>Show fewer places</span>
                        </summary>
                        <p>
                          <PlaceNames places={rest} found={foundZone} />
                        </p>
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
          {simulation ? (
            <Link className={styles.textLink} href="/road-to">
              Back to real time
            </Link>
          ) : (
            bands.length > 0 && (
              <Link
                className={styles.textLink}
                href={simulationHref(
                  Date.parse(bands[0].arrivalUtc) - 10 * 60_000,
                  PREVIEW_SPEED,
                )}
              >
                Preview the night at {PREVIEW_SPEED}× speed
              </Link>
            )
          )}
          <a className={styles.textLink} href="#relay-top">
            Back to top <ArrowUp size={16} aria-hidden="true" />
          </a>
        </footer>
      </div>
    </main>
  );
}
