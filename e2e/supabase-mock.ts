// A stand-in for the few Supabase REST endpoints the public pages read, so
// the end-to-end suite runs without a project or credentials. It answers
// like PostgREST for the filters the app sends and nothing else.
import http from "node:http";

import { ADMIN, fixtureChanges, fixtureSlots, MOCK_PORT } from "./fixtures";

type Row = ReturnType<typeof fixtureSlots>[number];
const slots = fixtureSlots(Date.now());

function compare(op: string, actual: string, expected: string) {
  if (op === "eq") return actual === expected;
  const [a, b] = [Date.parse(actual), Date.parse(expected)];
  return op === "gt" ? a > b : op === "gte" ? a >= b : op === "lt" ? a < b : op === "lte" ? a <= b : false;
}

function query(url: URL) {
  let rows: Row[] = slots;
  for (const [field, filter] of url.searchParams) {
    if (["select", "order", "limit", "offset"].includes(field)) continue;
    const dot = filter.indexOf(".");
    const [op, value] = [filter.slice(0, dot), filter.slice(dot + 1)];
    rows = rows.filter((row) => compare(op, String(row[field as keyof Row]), value));
  }
  const [column, direction] = (url.searchParams.get("order") ?? "starts_at.asc").split(".") as [keyof Row, string];
  rows = [...rows].sort((a, b) => (direction === "desc" ? -1 : 1) * String(a[column]).localeCompare(String(b[column])));
  return rows.slice(0, Number(url.searchParams.get("limit") ?? 1000));
}

/** The tiny part of PostgREST the admin's writes use: rows by `id=eq.`, answered as an object when asked for one. */
function write(method: string, url: URL, body: Record<string, unknown> | undefined, asObject: boolean) {
  const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
  let rows: Row[];
  if (method === "POST") {
    const row = { id: crypto.randomUUID(), ...body } as unknown as Row;
    slots.push(row);
    rows = [row];
  } else if (method === "PATCH") {
    rows = slots.filter((row) => row.id === id);
    for (const row of rows) Object.assign(row, body);
  } else {
    rows = slots.filter((row) => row.id === id);
    for (const row of rows) slots.splice(slots.indexOf(row), 1);
  }
  const select = (url.searchParams.get("select") ?? "").split(",").filter(Boolean);
  const shaped = rows.map((row) => (select.length ? Object.fromEntries(select.map((key) => [key, row[key as keyof Row]])) : row));
  return asObject ? { status: shaped.length === 1 ? 201 : 406, body: shaped[0] ?? { message: "No rows" } } : { status: method === "POST" ? 201 : 200, body: shaped };
}

http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${MOCK_PORT}`);
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  const signedIn = request.headers.authorization === `Bearer ${ADMIN.token}`;
  if (url.pathname === "/health") return send(200, { ok: true });
  if (url.pathname === "/rest/v1/stream_slots" && request.method !== "GET") {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (!signedIn) return send(401, { message: "Not signed in" });
      const text = Buffer.concat(chunks).toString();
      const { status, body } = write(request.method ?? "POST", url, text ? JSON.parse(text) : undefined, /pgrst\.object/.test(String(request.headers.accept)));
      send(status, body);
    });
    return;
  }
  if (url.pathname === "/rest/v1/stream_slots") return send(200, query(url));
  // Only the signed-in administrator is a member and may read the change log.
  if (url.pathname === "/rest/v1/stream_admins") return send(200, signedIn ? [{ user_id: ADMIN.id }] : []);
  if (url.pathname === "/rest/v1/stream_slot_changes") return send(200, signedIn ? fixtureChanges(Date.now()) : []);
  if (url.pathname === "/auth/v1/user" && signedIn) {
    return send(200, { id: ADMIN.id, aud: "authenticated", role: "authenticated", email: ADMIN.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
  }
  // No persisted catalog: the relay falls back to the bundled one.
  // `/health` asks only for when it was last checked; the relay's full read finds no row.
  if (url.pathname === "/rest/v1/timezone_catalog") return send(200, url.searchParams.get("select") === "checked_at" ? [{ checked_at: new Date().toISOString() }] : []);
  if (url.pathname.startsWith("/auth/v1/")) return send(401, { code: 401, message: "No session in tests" });
  send(404, { message: "Not mocked" });
}).listen(MOCK_PORT, "127.0.0.1", () => console.log(`Supabase mock on ${MOCK_PORT}`));
