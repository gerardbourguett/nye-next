import Link from "next/link";
import { redirect } from "next/navigation";
import { StreamShell } from "@/components/streams/shell";
import { adminAccess, SLOT_FIELDS } from "@/lib/streams/server";
import { decodeSlots, UUID, type Slot } from "@/lib/streams/domain";
import { DeleteSlot, SignOut } from "./controls";
import { SlotEditor } from "./slot-editor";
import styles from "@/components/streams/surface.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule manager | #2027Live", robots: { index: false, follow: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { client, status } = await adminAccess();
  if (status === "unauthenticated") redirect("/admin/login");
  if (status !== "admin" || !client) return <StreamShell admin title="Schedule manager." description="Private hourly programming for the viewing room.">
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

  return <StreamShell admin title="Schedule manager." description="Build the running order, choose the alternatives, and publish each hour when it is ready.">
    <div className={styles.actions}><SignOut /><Link href="/admin">Reload schedule / new slot</Link></div>
    <section className={styles.section}>
      {failure ? <p role="status" className={styles.notice}>{failure}</p> : <SlotEditor key={selected?.id ?? "new"} slot={selected} />}
    </section>
    <section className={styles.section} aria-labelledby="stored-slots">
      <div className={styles.sectionHeading}><h2 id="stored-slots">Saved slots</h2><p className={styles.muted}>Latest 200 by start time · UTC</p></div>
      {!slots.length && !failure && <p className={styles.muted}>No slots saved. Create a draft above; nothing appears publicly until you publish it.</p>}
      <ol className={styles.schedule}>{slots.map((slot) => <li key={slot.id}>
        <div className={styles.row}><div className={styles.time}><time dateTime={slot.starts_at}>{new Date(slot.starts_at).toISOString().slice(0, 16).replace("T", " ")} UTC</time><p className={styles.muted}>One hour · {slot.published ? "Published" : "Private draft"}</p></div>
          <div><h3>{slot.title}</h3><p className={styles.muted}>{slot.options.map((option) => option.label).join(" · ")}</p></div>
          <Link className={styles.button} href={`/admin?edit=${slot.id}`}>Edit<span className="sr-only"> {slot.title}</span></Link>
        </div>
        <DeleteSlot id={slot.id} title={slot.title} />
      </li>)}</ol>
    </section>
  </StreamShell>;
}
