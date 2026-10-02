"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { activeSlot, decodeSlots, embedUrl, HOUR_MS, MAIN_CHANNEL, optionKey, providerName, providerUrl, reconcilePlayback,
  selectedOption, type PlaybackState, type Slot, type StreamOption } from "@/lib/streams/domain";
import { cn } from "@/lib/utils";
import styles from "@/components/streams/surface.module.css";
import { ChannelRail, ChatPanel, ComingUp, localTime, source, StreamInfo, type Browser, type LiveMap } from "./room-parts";

/** `askedFor` is the deep-linked slot id this snapshot was fetched with, if any. */
type Snapshot = { slots: Slot[]; serverNow: number; receivedAt: number; askedFor: string | null };
const LIVE_POLL_MS = 60_000;

type Selection = NonNullable<PlaybackState["selection"]>;

/** `requested` is a validated deep link (from the relay); it applies once its hour is on. */
export function ViewingRoom({ requested: initialRequest = null }: { requested?: Selection | null }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [clock, setClock] = useState<number | null>(null);
  const [browser, setBrowser] = useState<Browser | null>(null);
  const [live, setLive] = useState<LiveMap>({});
  const { resolvedTheme } = useTheme();
  const [playback, setPlayback] = useState<PlaybackState>({ selection: null, loadedPlayer: null });
  const [requested, setRequested] = useState<Selection | null>(initialRequest);
  const [linkGone, setLinkGone] = useState(false);
  // Read by the poll so a pending deep link fetches its own slot by id.
  const pendingSlotId = useRef(initialRequest?.slotId ?? null);
  useEffect(() => {
    pendingSlotId.current = requested?.slotId ?? null;
  }, [requested]);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [width, setWidth] = useState(0);
  const playerColumn = useRef<HTMLDivElement>(null);
  const inflight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    const controller = new AbortController();
    inflight.current = controller;
    setPending(true);
    try {
      const askedFor = pendingSlotId.current;
      const query = askedFor ? `?${new URLSearchParams({ slot: askedFor })}` : "";
      const response = await fetch(`/watch/schedule${query}`, { cache: "no-store", credentials: "omit",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
      if (!response.ok) throw new Error("Unavailable");
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || !("slots" in value) || !("serverNow" in value) ||
          typeof value.serverNow !== "number" || !Number.isFinite(value.serverNow)) throw new Error("Invalid schedule");
      const slots = decodeSlots(value.slots).filter((slot) => slot.published);
      if (!controller.signal.aborted) {
        setSnapshot({ slots, serverNow: value.serverNow, receivedAt: Date.now(), askedFor });
        setError(false);
      }
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (inflight.current === controller) {
        inflight.current = null;
        if (!controller.signal.aborted) setPending(false);
      }
    }
  }, []);

  useEffect(() => {
    function mount() {
      setBrowser({ hostname: window.location.hostname, secure: window.location.protocol === "https:" });
      setClock(Date.now());
      void refresh();
    }
    mount();
    const tick = setInterval(() => setClock(Date.now()), 1_000);
    const poll = setInterval(() => void refresh(), 30_000);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (playerColumn.current) observer.observe(playerColumn.current);
    return () => {
      clearInterval(tick); clearInterval(poll); observer.disconnect();
      inflight.current?.abort(); inflight.current = null;
    };
  }, [refresh]);

  const now = snapshot && clock !== null ? snapshot.serverNow + clock - snapshot.receivedAt : null;
  const stale = snapshot !== null && clock !== null && clock - snapshot.receivedAt > 90_000;
  const slot = snapshot && now !== null && !stale ? activeSlot(snapshot.slots, now) : undefined;
  const option = selectedOption(slot, playback.selection);
  const playerKey = slot && option ? `${slot.id}:${optionKey(option)}` : null;
  // "Next 14 days" only: a deep-linked slot further out is kept for its own
  // notice, not listed as coming up.
  const upcoming = snapshot && now !== null ? snapshot.slots.filter((item) =>
    Date.parse(item.starts_at) > now && Date.parse(item.starts_at) <= now + 14 * 24 * HOUR_MS) : [];
  const ended = snapshot && now !== null && snapshot.slots.some((item) => Date.parse(item.ends_at) <= now);
  const canEmbed = option && browser && (option.provider !== "twitch" ? width >= 200 :
    width >= 400 && browser.secure && /^[a-zA-Z0-9.-]+$/.test(browser.hostname));
  // A deep link waits for its hour, then becomes the selection (never a load:
  // players still start only on an explicit click). A slot missing from the
  // snapshot may still be beyond its 14-day window, so only a slot that is
  // present and ended, or lost the option, drops the request.
  const requestedSlot = requested && snapshot ? snapshot.slots.find((item) => item.id === requested.slotId) : undefined;
  const requestedOption = requestedSlot?.options.find((item) => optionKey(item) === requested?.key);
  // The server returns a requested slot by id whenever it is still published,
  // so its absence from a snapshot fetched for it means deleted or unpublished.
  if (requested && snapshot?.askedFor === requested.slotId && !requestedSlot) {
    setRequested(null);
    setLinkGone(true);
  }
  if (requested && requestedSlot && now !== null && !stale) {
    if (!requestedOption) {
      setRequested(null);
      setLinkGone(true);
    } else if (Date.parse(requestedSlot.ends_at) <= now) setRequested(null);
    else if (slot?.id === requested.slotId) {
      setRequested(null);
      setPlayback({ selection: requested, loadedPlayer: null });
    }
  }
  const reconciledPlayback = reconcilePlayback(playback, slot, Boolean(canEmbed));
  // Reconcile during render, before an iframe can commit, rather than in a delayed effect.
  // The helper preserves object identity when valid, so this update converges immediately.
  if (reconciledPlayback !== playback) setPlayback(reconciledPlayback);
  const loadedPlayer = reconciledPlayback.loadedPlayer;
  // Ask providers about what is on screen: this slot, the main channel, and
  // the streams in the next cards. Sorted so the CDN can share the answer.
  // A plain string, so the effect below only re-runs when the set changes.
  const liveKeySet = new Set([`twitch:${MAIN_CHANNEL}`]);
  for (const item of [...(slot ? [slot] : []), ...upcoming.slice(0, 12)]) {
    for (const stream of item.options) liveKeySet.add(optionKey(stream));
  }
  // Capped in priority order (main channel, this slot, then cards) before sorting.
  const liveKeys = [...liveKeySet].slice(0, 24).sort().join(",");
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/watch/live?${new URLSearchParams({ keys: liveKeys })}`,
          { credentials: "omit", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
        if (!response.ok) throw new Error("Live status unavailable");
        const value: unknown = await response.json();
        if (!value || typeof value !== "object" || !("live" in value) || !value.live || typeof value.live !== "object") {
          throw new Error("Invalid live status");
        }
        setLive(value.live as LiveMap);
      } catch {
        // Unconfirmed is not live: drop old claims so streams read "Scheduled".
        if (!controller.signal.aborted) setLive({});
      }
    };
    void load();
    const interval = setInterval(() => void load(), LIVE_POLL_MS);
    return () => { controller.abort(); clearInterval(interval); };
  }, [liveKeys]);
  const info = option ? live[optionKey(option)] : undefined;
  const emptyTitle = !snapshot ? error ? "The schedule is unavailable" : "Loading the schedule…" : stale
    ? "Waiting for a fresh schedule" : upcoming.length ? "The next slot is on its way" : ended
      ? "The published schedule has ended" : "No programming published yet";

  const select = (item: StreamOption) => slot && setPlayback({ selection: { slotId: slot.id, key: optionKey(item) }, loadedPlayer: null });

  return <>
    {linkGone && <p className={styles.notice} role="status">
      The stream in your link is no longer scheduled. Choose from what is on now or coming up.
    </p>}
    {requested && requestedSlot && requestedOption && slot?.id !== requested.slotId && <p className={styles.notice} role="status">
      {requestedOption.label} ({source(requestedOption)}) is scheduled for {localTime(requestedSlot.starts_at)}. It will be selected here when that slot begins.
    </p>}
    {error && <div className={styles.notice} role="status">
      The schedule could not be refreshed. {snapshot && !stale ? "Showing the last received schedule. " : ""}
      Retrying every 30 seconds. <button className={styles.button} disabled={pending} onClick={() => void refresh()}>{pending ? "Refreshing…" : "Try again"}</button>
    </div>}
    <div className={styles.room}>
      <ChannelRail slot={slot} selectedKey={option ? optionKey(option) : null} live={live} onSelect={select}
        upNext={upcoming.slice(0, 3)} />
      <section className={styles.stage} aria-label="Player">
        <div className={styles.player} ref={playerColumn}>
          {option && canEmbed && loadedPlayer === playerKey && browser ?
            <iframe key={playerKey} src={embedUrl(option, browser.hostname)} title={`${option.label} on ${providerName(option.provider)}`}
              allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> :
            <div className={cn(styles.playerMessage, info?.thumbnail && styles.poster)}>
              {info?.thumbnail && option && canEmbed &&
                // eslint-disable-next-line @next/next/no-img-element -- the provider's own live preview, shown until the player loads
                <img className={styles.posterImage} src={info.thumbnail} alt="" referrerPolicy="no-referrer" />}
              {!slot && <h2 id="scheduled-now" aria-live="polite">{emptyTitle}</h2>}
              <p>{option ? canEmbed ? `Load ${providerName(option.provider)}'s player, then press play. Loading connects your browser to ${providerName(option.provider)}.`
                : option.provider === "twitch" ? "Twitch needs HTTPS and at least 400 pixels of player width. Open it directly, or use a wider HTTPS window."
                  : "Open the video directly, or use a wider window to load the player."
                : !snapshot ? error ? "Please try again shortly. You can still visit vanderfondi on Twitch." : "Checking published slots."
                  : stale ? "Playback is paused here until the schedule can be checked again."
                    : upcoming.length ? `Next: ${upcoming[0].title} · ${localTime(upcoming[0].starts_at)}`
                      : "There are no upcoming published slots in the next 14 days. Return to the relay or check back later."}</p>
              {slot && option && canEmbed && <button className={cn(styles.button, styles.primary)} onClick={() => setPlayback({
                selection: { slotId: slot.id, key: optionKey(option) }, loadedPlayer: playerKey,
              })}>Load {providerName(option.provider)} player</button>}
            </div>}
        </div>
        {slot && option && <StreamInfo option={option} info={info} slot={slot} now={now} />}
        {option && <div className={styles.actions}>
          <a className={styles.button} href={providerUrl(option)} target="_blank" rel="noopener noreferrer">Open on {providerName(option.provider)}</a>
          {loadedPlayer === playerKey && <button className={styles.button} onClick={() => setPlayback((current) => ({ ...current, loadedPlayer: null }))}>Close player</button>}
        </div>}
        <p className={cn(styles.muted, styles.fineprint)}>Live, offline and viewer counts come from the provider when it can confirm them; otherwise a stream is only scheduled. If playback fails, use the direct link.</p>
      </section>
      <ChatPanel option={option} info={info} browser={browser} dark={resolvedTheme === "dark"} />
    </div>
    <ComingUp upcoming={upcoming} live={live} loaded={snapshot !== null} />
  </>;
}
