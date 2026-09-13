"use client";

import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import { HOUR_MS, providerUrl, type Provider, type Slot } from "@/lib/streams/domain";
import { localToUtc, toLocalInput } from "@/lib/streams/time";
import { saveSlot, type ActionResult } from "./actions";
import styles from "@/components/streams/surface.module.css";

type OptionInput = { provider: Provider; source: string; label: string };
const blankOption = (): OptionInput => ({ provider: "twitch", source: "", label: "" });

export function SlotEditor({ slot }: { slot?: Slot }) {
  const prefix = useId();
  const [zone, setZone] = useState<string | null>(null);
  const [title, setTitle] = useState(slot?.title ?? "");
  const [localStart, setLocalStart] = useState("");
  const [published, setPublished] = useState(slot?.published ?? false);
  const [options, setOptions] = useState<OptionInput[]>(slot?.options.map((option) => ({ provider: option.provider, source: providerUrl(option), label: option.label })) ?? [blankOption()]);
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

  let preview = "";
  if (localStart && zone) {
    try {
      const start = localToUtc(localStart, zone);
      preview = `${start} → ${new Date(Date.parse(start) + HOUR_MS).toISOString()}`;
    } catch { /* Validation is reported on submission; partial input stays quiet. */ }
  }

  const updateOption = (index: number, change: Partial<OptionInput>) => {
    setOptions((current) => current.map((option, position) => position === index ? { ...option, ...change } : option));
  };

  return <section className={styles.editor} aria-labelledby="slot-editor-heading">
    <div className={styles.sectionHeading}><h2 id="slot-editor-heading">{slot ? "Edit slot" : "Create an hourly slot"}</h2>
      {slot && <Link href="/admin">Cancel editing</Link>}</div>
    <p className={styles.muted}>Each slot lasts exactly one elapsed hour. Published hours cannot overlap. Option order sets the default stream first.</p>
    <form className={styles.form} onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      setResult(null);
      try {
        if (!zone || zone !== Intl.DateTimeFormat().resolvedOptions().timeZone) throw new Error("Your timezone changed or is unavailable. Reload before saving.");
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
          if (saved.ok && !slot) { setTitle(""); setLocalStart(""); setOptions([blankOption()]); setPublished(false); }
        } catch { setResult({ ok: false, message: "Save could not be confirmed. Reload the schedule before retrying to avoid duplicates." }); }
      });
    }}>
      <fieldset disabled={pending || !zone} className={styles.fields}>
        <legend className="sr-only">Hourly slot details</legend>
        <input type="hidden" name="id" value={slot?.id ?? ""} />
        <input type="hidden" name="count" value={options.length} />
        <div className={styles.field}><label htmlFor={`${prefix}-title`}>Slot title</label>
          <input id={`${prefix}-title`} name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></div>
        <div className={styles.field}><label htmlFor={`${prefix}-start`}>Start time in {zone ?? "your timezone (detecting…)"}</label>
          <input id={`${prefix}-start`} name="local_start" type="datetime-local" min="2000-01-01T00:00" max="2100-12-31T23:59" step={60}
            value={localStart} onChange={(event) => setLocalStart(event.target.value)} required aria-describedby={`${prefix}-time-note`} />
          <p id={`${prefix}-time-note`} className={styles.muted}>Saved in UTC. Skipped or repeated daylight-saving times are rejected, never silently shifted.</p>
          {preview && <p className={`${styles.muted} ${styles.time}`}>UTC window: {preview}</p>}
        </div>
        {options.map((option, index) => <fieldset key={index} className={styles.optionEditor}>
          <legend>Option {index + 1}{index === 0 ? " · Default" : ""}</legend>
          <div className={styles.optionGrid}>
            <div className={styles.field}><label htmlFor={`${prefix}-provider-${index}`}>Provider</label>
              <select id={`${prefix}-provider-${index}`} name={`provider_${index}`} value={option.provider} onChange={(event) => updateOption(index, { provider: event.target.value as Provider })}>
                <option value="twitch">Twitch</option><option value="youtube">YouTube</option>
              </select></div>
            <div className={styles.field}><label htmlFor={`${prefix}-source-${index}`}>{option.provider === "twitch" ? "Channel URL or name" : "Video URL or video ID"}</label>
              <input id={`${prefix}-source-${index}`} name={`source_${index}`} value={option.source} onChange={(event) => updateOption(index, { source: event.target.value })} maxLength={500} required
                aria-describedby={`${prefix}-source-note-${index}`} />
              <p id={`${prefix}-source-note-${index}`} className={styles.muted}>{option.provider === "twitch" ? "An HTTPS twitch.tv channel URL or channel name. No clips or VODs." : "An HTTPS YouTube watch, live, shorts, or youtu.be URL, or an 11-character video ID. No channels or playlists."}</p>
            </div>
          </div>
          <div className={styles.field}><label htmlFor={`${prefix}-label-${index}`}>Display label</label>
            <input id={`${prefix}-label-${index}`} name={`label_${index}`} value={option.label} onChange={(event) => updateOption(index, { label: event.target.value })} maxLength={120} required /></div>
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
