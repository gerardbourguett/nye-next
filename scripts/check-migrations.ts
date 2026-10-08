/**
 * Applies every migration, in order, to a throwaway Postgres database and
 * checks what the application relies on: the migrations run cleanly, the
 * newest one can be run again, and `valid_stream_url` agrees with the
 * application on the shared case table (tests/streams/url-cases.ts).
 *
 * Needs `psql` and a server it can reach with the usual PG* variables
 * (PGHOST, PGPORT, PGUSER, PGPASSWORD); the user must be allowed to create
 * databases and roles. It never touches an existing database.
 *
 *   pnpm check:migrations
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { URL_CASES } from "../tests/streams/url-cases";

const root = join(import.meta.dirname, "..");
const migrations = readdirSync(join(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
const database = `migration_check_${process.pid}`;

/** `expectError` keeps psql's complaint to itself: the caller is checking that a statement is refused. */
function psql(db: string, args: string[], expectError = false) {
  return execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", db, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", expectError ? "ignore" : "inherit"] });
}
const file = (db: string, path: string) => psql(db, ["-f", path]);
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

let failures = 0;
function check(ok: boolean, message: string) {
  if (!ok) { failures++; console.error(`FAIL  ${message}`); }
}

psql("postgres", ["-c", `create database ${database}`]);
try {
  file(database, join(root, "supabase/tests/stubs.sql"));
  for (const name of migrations) {
    file(database, join(root, "supabase/migrations", name));
    console.log(`applied  ${name}`);
  }
  // Documented as safe to repeat: the newest migration only replaces functions and constraints.
  file(database, join(root, "supabase/migrations", migrations[migrations.length - 1]));
  console.log(`re-ran   ${migrations[migrations.length - 1]}`);

  const values = URL_CASES.map(([provider, id]) => `(${literal(provider)}, ${literal(id)})`).join(",\n");
  const rows = psql(database, ["-tA", "-F", "\t", "-c",
    `select provider, id, public.valid_stream_url(provider, id) from (values ${values}) as cases(provider, id)`]).trim().split("\n");
  check(rows.length === URL_CASES.length, `expected ${URL_CASES.length} rows from valid_stream_url, got ${rows.length}`);
  rows.forEach((row, index) => {
    const [provider, id, ok] = URL_CASES[index];
    check(row.endsWith(ok ? "\tt" : "\tf"), `valid_stream_url(${provider}, ${id}) should be ${ok}`);
  });

  const option = (provider: string, id: string, label = "Studio") => ({ provider, id, label });
  const options = (...list: object[]) => literal(JSON.stringify(list));
  const optionCases: [string, string, boolean][] = [
    ["twitch option", options(option("twitch", "vanderfondi")), true],
    ["hls option", options(option("hls", "https://cdn.example.com/live/index.m3u8")), true],
    ["hls option with a private host", options(option("hls", "https://10.0.0.5/index.m3u8")), false],
    ["no options", "'[]'", false],
    ["five options", options(...Array.from({ length: 5 }, (_, n) => option("twitch", `studio${n}`, `Studio ${n}`))), false],
  ];
  for (const [name, json, ok] of optionCases) {
    const answer = psql(database, ["-tA", "-c", `select public.valid_stream_options(${json}::jsonb)`]).trim();
    check(answer === (ok ? "t" : "f"), `valid_stream_options: ${name} should be ${ok}`);
  }

  // Slot lengths: 5 minutes to 92 days, whole minutes only.
  const slot = (length: string) => `insert into public.stream_slots (title, starts_at, ends_at, options)
    values ('Check', timestamptz '2030-01-01 00:00+00', timestamptz '2030-01-01 00:00+00' + interval '${length}', ${options(option("twitch", "vanderfondi"))}::jsonb)`;
  for (const [length, ok] of [["5 minutes", true], ["92 days", true], ["4 minutes", false], ["93 days", false], ["90 seconds", false]] as const) {
    let accepted = true;
    try { psql(database, ["-c", `begin; ${slot(length)}; rollback;`], true); } catch { accepted = false; }
    check(accepted === ok, `a slot of ${length} should be ${ok ? "accepted" : "refused"}`);
  }
} finally {
  psql("postgres", ["-c", `drop database if exists ${database} with (force)`]);
}

if (failures > 0) {
  console.error(`${failures} migration check(s) failed`);
  process.exit(1);
}
console.log(`ok  ${migrations.length} migrations, ${URL_CASES.length} URL cases`);
