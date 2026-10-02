// A stand-in for the few Supabase REST endpoints the public pages read, so
// the end-to-end suite runs without a project or credentials. It answers
// like PostgREST for the filters the app sends and nothing else.
import http from "node:http";

import { fixtureSlots, MOCK_PORT } from "./fixtures";

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

http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${MOCK_PORT}`);
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (url.pathname === "/health") return send(200, { ok: true });
  if (url.pathname === "/rest/v1/stream_slots") return send(200, query(url));
  // No persisted catalog: the relay falls back to the bundled one.
  if (url.pathname === "/rest/v1/timezone_catalog") return send(200, []);
  if (url.pathname.startsWith("/auth/v1/")) return send(401, { code: 401, message: "No session in tests" });
  send(404, { message: "Not mocked" });
}).listen(MOCK_PORT, "127.0.0.1", () => console.log(`Supabase mock on ${MOCK_PORT}`));
