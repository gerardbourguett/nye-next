"use client";

import { useId, useState, useTransition } from "react";

import { providerName, streamHost } from "@/lib/streams/domain";
import type { ListedChannel } from "@/lib/streams/m3u";
import { loadChannelList } from "./actions";
import styles from "@/components/streams/surface.module.css";

const SHOWN = 50;
const SIGNED = /[?&](?:token|key|pass(?:word)?|auth|sig(?:nature)?|hdnts|hdnea|expires?)=/i;

/**
 * Picks channels from an IPTV-style .m3u list. It sits outside the slot
 * form (forms cannot nest); choosing an entry fills one option of the slot.
 * The list itself is never saved, only what is chosen.
 */
export function ChannelImport({ optionCount, onUse }: {
  optionCount: number;
  onUse: (index: number, channel: ListedChannel) => void;
}) {
  const id = useId();
  const [input, setInput] = useState("");
  const [channels, setChannels] = useState<ListedChannel[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [target, setTarget] = useState(0);
  const [chosen, setChosen] = useState<ListedChannel | null>(null);
  const [pending, startTransition] = useTransition();

  const query = filter.trim().toLocaleLowerCase();
  const matches = (channels ?? []).filter((channel) => !query || `${channel.name} ${channel.group ?? ""}`.toLocaleLowerCase().includes(query));

  return <details className={styles.optionEditor}>
    <summary>Pick channels from a list (.m3u)</summary>
    <div className={styles.fields}>
      <div className={styles.field}><label htmlFor={`${id}-list`}>List address or pasted text</label>
        <textarea id={`${id}-list`} rows={3} value={input} onChange={(event) => setInput(event.target.value)} maxLength={900_000}
          placeholder="https://example.com/channels.m3u  or  #EXTM3U …" spellCheck={false} aria-describedby={`${id}-note`} />
        <p id={`${id}-note`} className={styles.muted}>Reads the list here and shows its channels; the list itself is not saved. Only HTTPS streams can play in the room. What you choose is saved in the public schedule, so do not pick addresses that carry a password.</p>
      </div>
      <div><button type="button" className={styles.button} disabled={pending || !input.trim()} onClick={() => {
        const form = new FormData();
        form.set("list", input);
        setMessage(null);
        startTransition(async () => {
          try {
            const result = await loadChannelList(form);
            setMessage({ ok: result.ok, text: result.message });
            setChannels(result.ok ? result.channels ?? [] : null);
            setSkipped(result.skipped ?? 0);
            setTruncated(Boolean(result.truncated));
            setChosen(null);
          } catch { setMessage({ ok: false, text: "The list could not be read. Try again, or paste a smaller list." }); }
        });
      }}>{pending ? "Reading…" : "Read list"}</button></div>
      {message && <p className={styles.notice} role="status">{message.text}</p>}
      {channels && <>
        <div className={styles.optionGrid}>
          <div className={styles.field}><label htmlFor={`${id}-filter`}>Search channels</label>
            <input id={`${id}-filter`} type="search" value={filter} onChange={(event) => setFilter(event.target.value)} autoComplete="off" /></div>
          <div className={styles.field}><label htmlFor={`${id}-target`}>Fill</label>
            <select id={`${id}-target`} value={Math.min(target, optionCount - 1)} onChange={(event) => setTarget(Number(event.target.value))}>
              {Array.from({ length: optionCount }, (_, index) => <option key={index} value={index}>Option {index + 1}</option>)}
            </select></div>
        </div>
        <ul className={styles.importList} aria-label="Channels in the list">
          {matches.slice(0, SHOWN).map((channel) => <li key={channel.url}>
            <button type="button" className={styles.importChoice} onClick={() => {
              onUse(Math.min(target, optionCount - 1), channel);
              setChosen(channel);
            }}>
              <span className={styles.channelName}>{channel.name}</span>
              <span className={styles.channelMeta}>{[providerName(channel.provider), streamHost({ provider: channel.provider, id: channel.url, label: "" }), channel.group].filter(Boolean).join(" · ")}</span>
            </button>
          </li>)}
        </ul>
        <p className={styles.muted}>
          {matches.length > SHOWN ? `Showing ${SHOWN} of ${matches.length}. Search to narrow the list. ` : `${matches.length} shown. `}
          {truncated && `Only the first 1,000 usable channels are listed. `}
          {skipped > 0 && `${skipped} entries were left out: plain HTTP, IP addresses and other addresses the room cannot use.`}
        </p>
        {chosen && <p className={styles.notice} role="status">
          Filled option {Math.min(target, optionCount - 1) + 1} with {chosen.name}.
          {chosen.note && ` ${chosen.note}`}
          {SIGNED.test(chosen.url) && " This address carries a token or signature: it becomes public once saved and may expire before the broadcast."}
        </p>}
      </>}
    </div>
  </details>;
}
