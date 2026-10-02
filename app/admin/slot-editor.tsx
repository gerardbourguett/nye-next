"use client";

import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import { formatDuration, MAX_SLOT_MS, MIN_SLOT_MS, optionKey, providerName, providerUrl, type Provider, type Slot, type StreamOption } from "@/lib/streams/domain";
import { localToUtc, toLocalInput } from "@/lib/streams/time";
import { saveSlot, type ActionResult } from "./actions";
import styles from "@/components/streams/surface.module.css";

type OptionInput = { provider: Provider; source: string; label: string; place: string };
export type PlaceChoice = { zoneName: string; label: string };
const blankOption = (): OptionInput => ({ provider: "twitch", source: "", label: "", place: "" });
const toInput = (option: StreamOption): OptionInput =>
  ({ provider: option.provider, source: providerUrl(option), label: option.label, place: option.zone ?? "" });

const SOURCE_COPY: Record<Provider, { label: string; note: string }> = {
  twitch: { label: "Channel URL or name", note: "An HTTPS twitch.tv channel URL or channel name. No clips or VODs." },
  youtube: { label: "Video URL or video ID", note: "An HTTPS YouTube watch, live, shorts, or youtu.be URL, or an 11-character video ID. No channels or playlists." },
  youtube_channel: { label: "Channel URL or channel ID", note: "Plays whatever this channel has live, useful when the video ID is only known on the day. Use youtube.com/channel/UC… or the UC… ID; @handles are not accepted." },
};

/**
 * `places` feeds the optional place picker that ties a stream to a relay
 * crossing; `saved` is every distinct stream already used in a slot, so
 * channels can be reused instead of retyped.
 */
export function SlotEditor({ slot, places, saved }: { slot?: Slot; places: PlaceChoice[]; saved: StreamOption[] }) {
  const prefix = useId();
  const [zone, setZone] = useState<string | null>(null);
  const [title, setTitle] = useState(slot?.title ?? "");
  const [localStart, setLocalStart] = useState("");
  const initialMinutes = slot ? Math.round((Date.parse(slot.ends_at) - Date.parse(slot.starts_at)) / 60_000) : 60;
  const [durationHours, setDurationHours] = useState(String(Math.floor(initialMinutes / 60)));
  const [durationMinutes, setDurationMinutes] = useState(String(initialMinutes % 60));
  const [published, setPublished] = useState(slot?.published ?? false);
  const [options, setOptions] = useState<OptionInput[]>(slot?.options.map(toInput) ?? [blankOption()]);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function detectZone() {
      try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        setZone(zone);
        if (slot) setLocalStart(toLocalInput(slot.starts_at, zone));
      } catch { setResult({ ok: false, message: "Your timezone could not be detected. Use a browser with timezone support." }); }
    }
    detectZone();
  }, [slot]);

  const durationMs = (Number(durationHours) * 60 + Number(durationMinutes)) * 60_000;
  const durationValid = Number.isInteger(durationMs / 60_000) && durationMs >= MIN_SLOT_MS && durationMs <= MAX_SLOT_MS;
  let preview = "";
  if (localStart && zone && durationValid) {
    try {
      const start = localToUtc(localStart, zone);
      preview = `${start} → ${new Date(Date.parse(start) + durationMs).toISOString()} (${formatDuration(durationMs)})`;
    } catch { /* Validation is reported on submission; partial input stays quiet. */ }
  }

  const updateOption = (index: number, change: Partial<OptionInput>) => {
    setOptions((current) => current.map((option, position) => position === index ? { ...option, ...change } : option));
  };

  return <section className={styles.editor} aria-labelledby="slot-editor-heading">
    <div className={styles.sectionHeading}><h2 id="slot-editor-heading">{slot ? "Edit slot" : "Create a slot"}</h2>
      {slot && <Link href="/admin">Cancel editing</Link>}</div>
    <p className={styles.muted}>Slots last one hour by default and can run from 5 minutes to 7 days, for example a full-day rehearsal. Published slots cannot overlap. Option order sets the default stream first.</p>
    <datalist id={`${prefix}-places`}>{places.map((place) => <option key={place.zoneName} value={place.zoneName}>{place.label}</option>)}</datalist>
    <form className={styles.form} onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      setResult(null);
      try {
        if (!zone || zone !== Intl.DateTimeFormat().resolvedOptions().timeZone) throw new Error("Your timezone changed or is unavailable. Reload before saving.");
        if (!durationValid) throw new Error("Choose a duration between 5 minutes and 7 days.");
        form.set("starts_at", localToUtc(localStart, zone));
        form.set("timezone", zone);
        if (slot?.published && !published) {
          if (!window.confirm("Remove this slot from the public schedule and save it as a draft?")) return;
          form.set("confirm_unpublish", "yes");
        }
      } catch (error) {
        setResult({ ok: false, message: error instanceof Error ? error.message : "Check the local start time." });
        return;
      }
      startTransition(async () => {
        try {
          const saved = await saveSlot(form);
          setResult(saved);
          if (saved.ok && !slot) {
            setTitle(""); setLocalStart(""); setDurationHours("1"); setDurationMinutes("0"); setOptions([blankOption()]); setPublished(false);
          }
        } catch { setResult({ ok: false, message: "Save could not be confirmed. Reload the schedule before retrying to avoid duplicates." }); }
      });
    }}>
      <fieldset disabled={pending || !zone} className={styles.fields}>
        <legend className="sr-only">Slot details</legend>
        <input type="hidden" name="id" value={slot?.id ?? ""} />
        <input type="hidden" name="count" value={options.length} />
        <div className={styles.field}><label htmlFor={`${prefix}-title`}>Slot title</label>
          <input id={`${prefix}-title`} name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></div>
        <div className={styles.field}><label htmlFor={`${prefix}-start`}>Start time in {zone ?? "your timezone (detecting…)"}</label>
          <input id={`${prefix}-start`} name="local_start" type="datetime-local" min="2000-01-01T00:00" max="2100-12-31T23:59" step={60}
            value={localStart} onChange={(event) => setLocalStart(event.target.value)} required aria-describedby={`${prefix}-time-note`} />
          <p id={`${prefix}-time-note`} className={styles.muted}>Saved in UTC. Skipped or repeated daylight-saving times are rejected, never silently shifted.</p>
        </div>
        <fieldset className={styles.optionEditor}>
          <legend>Duration</legend>
          <div className={styles.optionGrid}>
            <div className={styles.field}><label htmlFor={`${prefix}-hours`}>Hours</label>
              <input id={`${prefix}-hours`} name="duration_hours" type="number" inputMode="numeric" min={0} max={168} step={1}
                value={durationHours} onChange={(event) => setDurationHours(event.target.value)} required /></div>
            <div className={styles.field}><label htmlFor={`${prefix}-minutes`}>Minutes</label>
              <select id={`${prefix}-minutes`} name="duration_minutes" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)}>
                {Array.from({ length: 12 }, (_, step) => String(step * 5)).concat(
                  Number(durationMinutes) % 5 ? [durationMinutes] : []).map((value) => <option key={value} value={value}>{value}</option>)}
              </select></div>
          </div>
          <p className={styles.muted}>{durationValid ? `Elapsed time: ${formatDuration(durationMs)}, regardless of clock changes.` : "Choose between 5 minutes and 7 days."}</p>
          {preview && <p className={`${styles.muted} ${styles.time}`}>UTC window: {preview}</p>}
        </fieldset>
        {options.map((option, index) => <fieldset key={index} className={styles.optionEditor}>
          <legend>Option {index + 1}{index === 0 ? " · Default" : ""}</legend>
          {saved.length > 0 && <div className={styles.field}><label htmlFor={`${prefix}-saved-${index}`}>Reuse a saved stream</label>
            <select id={`${prefix}-saved-${index}`} value="" onChange={(event) => {
              const picked = saved.find((item) => optionKey(item) === event.target.value);
              if (picked) updateOption(index, toInput(picked));
            }}>
              <option value="">Choose to fill this option…</option>
              {saved.map((item) => <option key={optionKey(item)} value={optionKey(item)}>
                {item.label} · {providerName(item.provider)}{item.zone ? ` · ${item.zone}` : ""}
              </option>)}
            </select></div>}
          <div className={styles.optionGrid}>
            <div className={styles.field}><label htmlFor={`${prefix}-provider-${index}`}>Provider</label>
              <select id={`${prefix}-provider-${index}`} name={`provider_${index}`} value={option.provider} onChange={(event) => updateOption(index, { provider: event.target.value as Provider })}>
                <option value="twitch">Twitch</option><option value="youtube">YouTube video</option>
                <option value="youtube_channel">YouTube channel (live)</option>
              </select></div>
            <div className={styles.field}><label htmlFor={`${prefix}-source-${index}`}>{SOURCE_COPY[option.provider].label}</label>
              <input id={`${prefix}-source-${index}`} name={`source_${index}`} value={option.source} onChange={(event) => updateOption(index, { source: event.target.value })} maxLength={500} required
                aria-describedby={`${prefix}-source-note-${index}`} />
              <p id={`${prefix}-source-note-${index}`} className={styles.muted}>{SOURCE_COPY[option.provider].note}</p>
            </div>
          </div>
          <div className={styles.field}><label htmlFor={`${prefix}-label-${index}`}>Display label</label>
            <input id={`${prefix}-label-${index}`} name={`label_${index}`} value={option.label} onChange={(event) => updateOption(index, { label: event.target.value })} maxLength={120} required /></div>
          <div className={styles.field}><label htmlFor={`${prefix}-place-${index}`}>Place celebrating (optional)</label>
            <input id={`${prefix}-place-${index}`} name={`zone_${index}`} list={`${prefix}-places`} value={option.place} onChange={(event) => updateOption(index, { place: event.target.value })}
              maxLength={64} placeholder="e.g. Australia/Sydney" autoComplete="off" spellCheck={false} aria-describedby={`${prefix}-place-note-${index}`} />
            <p id={`${prefix}-place-note-${index}`} className={styles.muted}>The IANA timezone of the city on screen. Published streams with a place appear on that crossing in the relay. Leave empty for studio or general streams.</p></div>
          <div className={styles.actions}>
            {index > 0 && <button type="button" className={styles.button} onClick={() => setOptions((current) => {
              const reordered = [...current];
              [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
              return reordered;
            })}>Move option {index + 1} up</button>}
            {options.length > 1 && <button type="button" className={styles.button} onClick={() => setOptions((current) => current.filter((_, position) => position !== index))}>Remove option {index + 1}</button>}
          </div>
        </fieldset>)}
        <div>{options.length < 4 && <button className={styles.button} type="button" onClick={() => setOptions((current) => [...current, blankOption()])}>Add a stream option</button>}</div>
        <label className={styles.check}><input name="published" type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />Publish this slot in the viewing room</label>
        <p className={styles.muted}>Unchecked slots are private drafts. Use only confirmed programming, and label any placeholder clearly.</p>
        <div><button type="submit" className={`${styles.button} ${styles.primary}`}>{pending ? "Saving…" : published ? "Save and publish" : "Save draft"}</button></div>
      </fieldset>
      {result && <p className={styles.notice} role="status">{result.message}</p>}
    </form>
  </section>;
}
