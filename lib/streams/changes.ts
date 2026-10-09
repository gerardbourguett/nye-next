import { UUID } from "./domain";

/** One row of `stream_slot_changes`, as the admin page shows it. */
export type SlotChange = {
  id: number;
  changedAt: string;
  changedBy: string | null;
  operation: "insert" | "update" | "delete";
  slotId: string;
  title: string;
  summary: string;
};

type SlotRow = { title?: unknown; starts_at?: unknown; ends_at?: unknown; published?: unknown; options?: unknown };
const asRow = (value: unknown): SlotRow | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as SlotRow) : null);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What changed, in plain words: "Published; changed title and time". */
export function describeChange(operation: SlotChange["operation"], before: unknown, after: unknown): string {
  const old = asRow(before);
  const next = asRow(after);
  if (operation === "insert") return next?.published === true ? "Created and published" : "Created as a draft";
  if (operation === "delete") return old?.published === true ? "Deleted (it was published)" : "Deleted";
  if (!old || !next) return "Changed";
  const parts: string[] = [];
  if (old.published !== next.published) parts.push(next.published === true ? "Published" : "Unpublished");
  const fields: string[] = [];
  if (!same(old.title, next.title)) fields.push("title");
  if (!same(old.starts_at, next.starts_at) || !same(old.ends_at, next.ends_at)) fields.push("time");
  if (!same(old.options, next.options)) fields.push("streams");
  if (fields.length) {
    const list = fields.length > 1 ? `${fields.slice(0, -1).join(", ")} and ${fields[fields.length - 1]}` : fields[0];
    parts.push(parts.length ? `changed ${list}` : `Changed ${list}`);
  }
  return parts.length ? parts.join("; ") : "Changed";
}

/** Rows from the database, or nothing for a row that is not shaped as expected (the log is only a view). */
export function decodeChanges(rows: unknown): SlotChange[] {
  if (!Array.isArray(rows)) return [];
  const changes: SlotChange[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { id, changed_at, changed_by, operation, slot_id, before, after } = row as Record<string, unknown>;
    if (typeof id !== "number" || typeof changed_at !== "string" || !Number.isFinite(Date.parse(changed_at))) continue;
    if (operation !== "insert" && operation !== "update" && operation !== "delete") continue;
    if (typeof slot_id !== "string" || !UUID.test(slot_id)) continue;
    const title = asRow(after)?.title ?? asRow(before)?.title;
    changes.push({
      id,
      changedAt: changed_at,
      changedBy: typeof changed_by === "string" && UUID.test(changed_by) ? changed_by : null,
      operation,
      slotId: slot_id,
      title: typeof title === "string" ? title : "(untitled)",
      summary: describeChange(operation, before, after),
    });
  }
  return changes;
}
