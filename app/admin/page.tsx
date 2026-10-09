import Link from "next/link";
import { redirect } from "next/navigation";
import { StreamShell } from "@/components/streams/shell";
import { adminAccess, SLOT_FIELDS } from "@/lib/streams/server";
import { decodeChanges, type SlotChange } from "@/lib/streams/changes";
import { decodeSlots, formatDuration, optionKey, UUID, type Slot, type StreamOption } from "@/lib/streams/domain";
import { cityFromZoneName } from "@/lib/zones";
import bundledZones from "@/data/timezones.json";
import { DeleteSlot, SignOut } from "./controls";
import { SlotEditor, type PlaceChoice } from "./slot-editor";

const PLACES: PlaceChoice[] = bundledZones.zones
  .map((zone) => ({ zoneName: zone.zoneName, label: `${cityFromZoneName(zone.zoneName)}, ${zone.countryName}` }))
  .sort((a, b) => a.label.localeCompare(b.label));

/** Every distinct stream in the loaded slots, newest slot first: the reusable channel list. */
function savedStreams(slots: Slot[]): StreamOption[] {
  const seen = new Map<string, StreamOption>();
  for (const slot of slots) for (const option of slot.options) if (!seen.has(optionKey(option))) seen.set(optionKey(option), option);
  return [...seen.values()];
}
import styles from "@/components/streams/surface.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule manager", robots: { index: false, follow: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { client, status } = await adminAccess();
  if (status === "unauthenticated") redirect("/admin/login");
  if (status !== "admin" || !client) return <StreamShell admin title="Schedule manager." description="Private programming for the viewing room.">
    <p className={styles.notice}>{status === "setup" ? "Admin access is not configured. The site owner must complete the Supabase setup."
      : status === "forbidden" ? "This account does not have schedule access. Contact the site owner."
        : "Admin access is temporarily unavailable. Reload this page to try again."}</p>
    {client && <SignOut />}
  </StreamShell>;

  const { edit } = await searchParams;
  let slots: Slot[] = [];
  let selected: Slot | undefined;
  let failure = "";
  try {
    const { data, error } = await client.from("stream_slots").select(SLOT_FIELDS).order("starts_at", { ascending: false }).limit(200);
    if (error) throw new Error("Schedule unavailable");
    slots = decodeSlots(data);
    if (edit) {
      if (!UUID.test(edit)) throw new Error("Invalid slot");
      const { data, error } = await client.from("stream_slots").select(SLOT_FIELDS).eq("id", edit).maybeSingle();
      if (error || !data) throw new Error("Slot unavailable");
      selected = decodeSlots([data])[0];
    }
  } catch { failure = "The schedule or requested slot could not be loaded. Reload, or return to the schedule manager."; }

  // The log is a view of what the database recorded; the page works without it (for example before its migration is applied).
  let changes: SlotChange[] = [];
  let me: string | null = null;
  let logNote = "";
  try {
    const [{ data, error }, { data: auth }] = await Promise.all([
      client.from("stream_slot_changes").select("id,changed_at,changed_by,operation,slot_id,before,after")
        .order("changed_at", { ascending: false }).order("id", { ascending: false }).limit(50),
      client.auth.getUser(),
    ]);
    if (error) throw new Error("Change log unavailable");
    changes = decodeChanges(data);
    me = auth.user?.id ?? null;
  } catch { logNote = "The change log could not be loaded. If it was never set up, apply the latest database migration."; }

  return <StreamShell admin title="Schedule manager." description="Build the running order, choose the alternatives, and publish each hour when it is ready.">
    <div className={styles.actions}><SignOut /><Link href="/admin">Reload schedule / new slot</Link></div>
    <section className={styles.section}>
      {failure ? <p role="status" className={styles.notice}>{failure}</p> : <SlotEditor key={selected?.id ?? "new"} slot={selected} places={PLACES} saved={savedStreams(slots)} />}
    </section>
    <section className={styles.section} aria-labelledby="stored-slots">
      <div className={styles.sectionHeading}><h2 id="stored-slots">Saved slots</h2><p className={styles.muted}>Latest 200 by start time · UTC</p></div>
      {!slots.length && !failure && <p className={styles.muted}>No slots saved. Create a draft above; nothing appears publicly until you publish it.</p>}
      <ol className={styles.schedule}>{slots.map((slot) => <li key={slot.id}>
        <div className={styles.row}><div className={styles.time}><time dateTime={slot.starts_at}>{new Date(slot.starts_at).toISOString().slice(0, 16).replace("T", " ")} UTC</time><p className={styles.muted}>{formatDuration(Date.parse(slot.ends_at) - Date.parse(slot.starts_at))} · {slot.published ? "Published" : "Private draft"}</p></div>
          <div><h3>{slot.title}</h3><p className={styles.muted}>{slot.options.map((option) => option.label).join(" · ")}</p></div>
          <Link className={styles.button} href={`/admin?edit=${slot.id}`}>Edit<span className="sr-only"> {slot.title}</span></Link>
        </div>
        <DeleteSlot id={slot.id} title={slot.title} />
      </li>)}</ol>
    </section>
    <section className={styles.section} aria-labelledby="recent-changes">
      <div className={styles.sectionHeading}><h2 id="recent-changes">Recent changes</h2><p className={styles.muted}>Latest 50 · UTC · recorded by the database</p></div>
      {logNote && <p role="status" className={styles.notice}>{logNote}</p>}
      {!logNote && !changes.length && <p className={styles.muted}>No changes recorded yet.</p>}
      <ol className={styles.schedule}>{changes.map((change) => <li key={change.id}>
        <div className={styles.row}>
          <div className={styles.time}><time dateTime={change.changedAt}>{new Date(change.changedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</time>
            <p className={styles.muted}>{change.changedBy === null ? "Database or service" : change.changedBy === me ? "You" : `Admin ${change.changedBy.slice(0, 8)}`}</p></div>
          <div><h3>{change.title}</h3><p className={styles.muted}>{change.summary}</p></div>
          {change.operation === "delete" ? <span className={styles.muted}>Deleted</span> : <Link className={styles.button} href={`/admin?edit=${change.slotId}`}>Open<span className="sr-only"> {change.title}</span></Link>}
        </div>
      </li>)}</ol>
    </section>
  </StreamShell>;
}
