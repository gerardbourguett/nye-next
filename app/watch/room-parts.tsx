"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  formatDuration, MAIN_CHANNEL, optionKey, providerName, providerUrl, streamHost, twitchChatUrl, youtubeChatUrl,
  type Slot, type StreamOption,
} from "@/lib/streams/domain";
import type { LiveInfo } from "@/lib/streams/live-parse";
import { cityFromZoneName } from "@/lib/zones";
import styles from "@/components/streams/surface.module.css";
import { watchHref } from "@/lib/streams/relay-link";

export type LiveMap = Record<string, LiveInfo>;
const TWITCH_CHAT_MIN_WIDTH = 350;
export type Browser = { hostname: string; secure: boolean };

export const localTime = (iso: string) => new Date(iso).toLocaleString(undefined, {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
});
export const source = (option: StreamOption) =>
  [providerName(option.provider), streamHost(option), option.zone && cityFromZoneName(option.zone)].filter(Boolean).join(" · ");

/**
 * Direct streams (HLS, DASH) have no page to open, so their address is copied
 * instead. If the browser blocks or lacks the clipboard, the address is shown
 * in a selectable field, since it appears nowhere else.
 */
export function CopyAddress({ address }: { address: string }) {
  const id = useId();
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state === "manual") field.current?.select();
  }, [state]);
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("No clipboard");
      await navigator.clipboard.writeText(address);
      setState("copied");
      setTimeout(() => setState("idle"), 2_000);
    } catch {
      setState("manual");
    }
  };
  return <>
    <button type="button" className={styles.button} onClick={() => void copy()}>
      {state === "copied" ? "Address copied" : "Copy stream address"}
    </button>
    {state === "manual" && <div className={styles.addressFallback} role="status">
      <label htmlFor={id}>Copying was blocked. Select and copy the address:</label>
      <input id={id} ref={field} readOnly value={address} onFocus={(event) => event.currentTarget.select()} />
    </div>}
  </>;
}

/** A card opens the provider's page; direct streams open in the room, which can play them. */
const cardLink = (slot: Slot, stream: StreamOption, preview?: string) => stream.provider === "hls" || stream.provider === "dash"
  ? { href: watchHref({ slotId: slot.id, key: optionKey(stream) }, preview) }
  : { href: providerUrl(stream), target: "_blank", rel: "noopener noreferrer" };

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

function uptime(startedAt: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const parts = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  return parts.map((part, index) => (index ? String(part).padStart(2, "0") : String(part))).join(":");
}

/** Live only when a provider confirmed it; otherwise offline (confirmed) or scheduled (unknown). */
export function StatusBadge({ info }: { info: LiveInfo | undefined }) {
  if (info?.live) {
    return <span className={styles.status}>
      <span className={styles.liveBadge}>Live</span>
      {info.viewers !== undefined && <span>{compact.format(info.viewers)} watching</span>}
    </span>;
  }
  return <span className={cn(styles.status, styles.muted)}>{info ? "Offline" : "Scheduled"}</span>;
}

export function Avatar({ option, info, large = false }: { option: StreamOption; info?: LiveInfo; large?: boolean }) {
  return <span className={cn(styles.avatar, large && styles.avatarLarge, info?.live && styles.avatarLive)} aria-hidden="true">
    {info?.avatar
      // eslint-disable-next-line @next/next/no-img-element -- provider CDN avatar, already sized by the provider
      ? <img src={info.avatar} alt="" referrerPolicy="no-referrer" loading="lazy" />
      : option.label.slice(0, 1).toUpperCase()}
  </span>;
}

/** The left rail: this slot's streams, Twitch-sidebar style, then what comes next. */
export function ChannelRail({ slot, selectedKey, live, onSelect, upNext }: {
  slot: Slot | undefined;
  selectedKey: string | null;
  live: LiveMap;
  onSelect: (option: StreamOption) => void;
  upNext: Slot[];
}) {
  return <aside className={styles.rail} aria-labelledby="on-now">
    <h2 id="on-now" className={styles.railHeading}>On now</h2>
    {slot ? <>
      <p className={cn(styles.muted, styles.railSlot)}>{slot.title}</p>
      <ul className={styles.channels}>{slot.options.map((option) => {
        const key = optionKey(option);
        return <li key={key}>
          <button type="button" className={styles.channel} aria-pressed={key === selectedKey} onClick={() => onSelect(option)}>
            <Avatar option={option} info={live[key]} />
            <span className={styles.channelText}>
              <span className={styles.channelName}>{option.label}</span>
              <span className={styles.channelMeta}>{source(option)}</span>
            </span>
            <StatusBadge info={live[key]} />
          </button>
        </li>;
      })}</ul>
    </> : <p className={styles.muted}>Streams appear here when a published slot begins.</p>}
    {upNext.length > 0 && <>
      <h3 className={styles.railHeading}>Up next</h3>
      <ul className={styles.upNext}>{upNext.map((item) => <li key={item.id}>
        <time dateTime={item.starts_at} className={styles.time}>{localTime(item.starts_at)}</time>
        <span>{item.title}</span>
      </li>)}</ul>
    </>}
  </aside>;
}

/** Below the player: who is on, what the provider says they are streaming, and for how long. */
export function StreamInfo({ option, info, slot, now }: {
  option: StreamOption; info: LiveInfo | undefined; slot: Slot; now: number | null;
}) {
  return <div className={styles.streamInfo}>
    <Avatar option={option} info={info} large />
    <div className={styles.streamText}>
      <h2 id="scheduled-now" aria-live="polite">{option.label}</h2>
      {info?.title && <p className={styles.streamTitle}>{info.title}</p>}
      <p className={styles.channelMeta}>
        {source(option)} · {slot.title} · {localTime(slot.starts_at)} – {localTime(slot.ends_at)}
        {" "}({formatDuration(Date.parse(slot.ends_at) - Date.parse(slot.starts_at))})
      </p>
    </div>
    <div className={styles.streamStats}>
      <StatusBadge info={info} />
      {info?.live && info.startedAt && now !== null && <span className={cn(styles.muted, styles.time)}>
        Live for {uptime(info.startedAt, now)}
      </span>}
    </div>
  </div>;
}

type ChatSource = { key: string; label: string; channel?: string; videoId?: string };

/**
 * Chat beside the player. The broadcast's own Twitch chat is always offered;
 * the selected stream's chat joins it when the provider has one. Like the
 * player, a chat only loads on an explicit click.
 */
export function ChatPanel({ option, info, browser, dark }: {
  option: StreamOption | undefined; info: LiveInfo | undefined; browser: Browser | null; dark: boolean;
}) {
  const sources: ChatSource[] = [{ key: `twitch:${MAIN_CHANNEL}`, label: MAIN_CHANNEL, channel: MAIN_CHANNEL }];
  if (option?.provider === "twitch" && option.id !== MAIN_CHANNEL) {
    sources.push({ key: optionKey(option), label: option.label, channel: option.id });
  } else if (option && option.provider !== "twitch" && info?.live && info.videoId) {
    // YouTube chat exists only while YouTube confirms the video is live.
    sources.push({ key: optionKey(option), label: option.label, videoId: info.videoId });
  }
  const [chosen, setChosen] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (body.current) observer.observe(body.current);
    return () => observer.disconnect();
  }, []);
  const active = sources.find((item) => item.key === chosen) ?? sources[0];
  // Consent covers one exact chat: a channel's next live video needs a new click.
  const consent = `${active.key}:${active.videoId ?? ""}:${dark}`;
  // Twitch's embedded chat needs HTTPS and at least 350 px; narrower panels pop it out.
  const canEmbed = browser && (active.videoId || (browser.secure && width >= TWITCH_CHAT_MIN_WIDTH));
  const url = browser && canEmbed
    ? active.channel ? twitchChatUrl(active.channel, browser.hostname, dark) : youtubeChatUrl(active.videoId!, browser.hostname)
    : null;
  const popout = active.channel
    ? `https://www.twitch.tv/popout/${active.channel}/chat`
    : `https://www.youtube.com/live_chat?${new URLSearchParams({ v: active.videoId! })}`;

  return <aside className={styles.chat} aria-labelledby="chat-heading">
    <div className={styles.chatHeader}>
      <h2 id="chat-heading">Chat</h2>
      {sources.length > 1 && <div className={styles.chatTabs} role="group" aria-label="Chat source">
        {sources.map((item) => <button key={item.key} type="button" aria-pressed={item.key === active.key}
          className={styles.chatTab} onClick={() => setChosen(item.key)}>{item.label}</button>)}
      </div>}
    </div>
    <div className={styles.chatBody} ref={body}>
      {url && loaded === consent
        ? <iframe key={url} src={url} title={`${active.label} chat`} referrerPolicy="strict-origin-when-cross-origin" />
        : <div className={styles.playerMessage}>
          <p>{url ? `Load ${active.label}'s chat. Loading connects your browser to ${active.channel ? "Twitch" : "YouTube"}.`
            : browser && !browser.secure ? "Embedded Twitch chat needs HTTPS. Open it in a new window instead."
              : "This space is narrower than Twitch chat needs. Open it in a new window instead."}</p>
          <div className={styles.actions} style={{ justifyContent: "center" }}>
            {url && <button type="button" className={cn(styles.button, styles.primary)}
              onClick={() => setLoaded(consent)}>Load chat</button>}
            <a className={styles.button} href={popout} target="_blank" rel="noopener noreferrer">Pop out</a>
          </div>
        </div>}
    </div>
  </aside>;
}

/** Upcoming slots as schedule cards, each with its streams. */
/** `preview` is a preview's query (`at=…&speed=…`), kept on the cards that open the room. */
export function ComingUp({ upcoming, live, loaded, preview }: { upcoming: Slot[]; live: LiveMap; loaded: boolean; preview?: string }) {
  return <section className={styles.section} aria-labelledby="upcoming-slots">
    <div className={styles.sectionHeading}><h2 id="upcoming-slots">Coming up</h2>
      <p className={styles.muted}>Your local time · Next 14 days · Refreshes every 30 seconds</p></div>
    {upcoming.length ? <ol className={styles.cards}>{upcoming.slice(0, 12).map((item) => <li key={item.id} className={styles.card}>
      <p className={cn(styles.time, styles.muted)}>
        <time dateTime={item.starts_at}>{localTime(item.starts_at)}</time>
        {" · "}{formatDuration(Date.parse(item.ends_at) - Date.parse(item.starts_at))}
      </p>
      <h3>{item.title}</h3>
      <ul className={styles.cardStreams}>{item.options.map((stream) => <li key={optionKey(stream)}>
        <a {...cardLink(item, stream, preview)} className={styles.cardStream}>
          <Avatar option={stream} info={live[optionKey(stream)]} />
          <span className={styles.channelText}>
            <span className={styles.channelName}>{stream.label}</span>
            <span className={styles.channelMeta}>{source(stream)}</span>
          </span>
        </a>
      </li>)}</ul>
    </li>)}</ol> : <p className={styles.muted}>{loaded ? "No upcoming slots in this schedule window." : "Upcoming programming appears once the schedule loads."}</p>}
    {upcoming.length > 12 && <p className={styles.muted}>Showing the next 12 published slots. Later slots appear as the schedule advances.</p>}
  </section>;
}
