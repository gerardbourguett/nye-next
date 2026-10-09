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

// Roles are cluster-wide: the stubs create the Supabase ones only if missing, and this run removes just those.
const ROLES = ["anon", "authenticated", "service_role"];
const existing = new Set(psql("postgres", ["-tA", "-c", `select rolname from pg_roles where rolname in (${ROLES.map(literal).join(",")})`]).split("\n").filter(Boolean));
const created = ROLES.filter((role) => !existing.has(role));

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

  // The change log: every insert, update and delete of a slot is recorded by the database itself.
  const slotJson = options(option("twitch", "vanderfondi"));
  const insertSlot = (id: string, title: string) => `insert into public.stream_slots (id, title, starts_at, ends_at, options)
    values (${literal(id)}, ${literal(title)}, timestamptz '2031-01-01 00:00+00', timestamptz '2031-01-01 01:00+00', ${slotJson}::jsonb)`;
  const SLOT = "0f0f0f0f-0000-4000-8000-000000000001";
  const logged = psql(database, ["-tA", "-c", `begin;
    ${insertSlot(SLOT, "Log check")};
    update public.stream_slots set published = true where id = '${SLOT}';
    update public.stream_slots set published = true where id = '${SLOT}';
    delete from public.stream_slots where id = '${SLOT}';
    select string_agg(operation || ':' || coalesce(changed_by::text, 'none'), ',' order by id)
      from public.stream_slot_changes where slot_id = '${SLOT}'`]).trim().split("\n").pop();
  check(logged === "insert:none,update:none,delete:none", `the change log should hold insert, update (a no-op save adds nothing) and delete, got ${logged}`);

  const ADMIN = "0f0f0f0f-0000-4000-8000-0000000000a1";
  const OTHER = "0f0f0f0f-0000-4000-8000-0000000000b2";
  const asUser = (user: string) => `set local request.jwt.claim.sub = '${user}'; set local role authenticated;`;
  const setup = `begin; insert into auth.users (id) values ('${ADMIN}'), ('${OTHER}'); insert into public.stream_admins (user_id) values ('${ADMIN}');`;
  const slotId = "0f0f0f0f-0000-4000-8000-000000000002";
  const answer = (sql: string) => psql(database, ["-tA", "-c", sql]).trim().split("\n").pop();
  check(answer(`${setup} ${asUser(ADMIN)} ${insertSlot(slotId, "By admin")};
    select changed_by::text from public.stream_slot_changes where slot_id = '${slotId}'`) === ADMIN,
    "an admin's change should be logged with their user id");
  check(answer(`${setup} ${asUser(ADMIN)} ${insertSlot(slotId, "By admin")};
    select count(*) from public.stream_slot_changes`) === "1", "an admin should read the change log");
  check(answer(`${setup} ${asUser(ADMIN)} ${insertSlot(slotId, "By admin")};
    reset role; ${asUser(OTHER)} select count(*) from public.stream_slot_changes`) === "0", "a signed-in user who is not an admin should read no log rows");
  // The service role bypasses RLS: only its table privileges stand between it and the log.
  for (const statement of ["update public.stream_slot_changes set operation = 'delete'", "delete from public.stream_slot_changes",
    `insert into public.stream_slot_changes (operation, slot_id) values ('insert', '${SLOT}')`]) {
    let allowed = true;
    try { psql(database, ["-c", `begin; set local role service_role; ${statement}`], true); } catch { allowed = false; }
    check(!allowed, `the service role should not be able to write the change log directly (${statement.split(" ")[0]})`);
  }
  for (const [name, statement] of [["update", "update public.stream_slot_changes set operation = 'delete'"], ["delete", "delete from public.stream_slot_changes"],
    ["insert", `insert into public.stream_slot_changes (operation, slot_id) values ('insert', '${SLOT}')`]] as const) {
    let allowed = true;
    try { psql(database, ["-c", `${setup} ${asUser(ADMIN)} ${statement}`], true); } catch { allowed = false; }
    check(!allowed, `an admin should not be able to ${name} the change log directly`);
  }
} finally {
  psql("postgres", ["-c", `drop database if exists ${database} with (force)`]);
  for (const role of created) psql("postgres", ["-c", `drop role if exists ${role}`]);
}

if (failures > 0) {
  console.error(`${failures} migration check(s) failed`);
  process.exit(1);
}
console.log(`ok  ${migrations.length} migrations, ${URL_CASES.length} URL cases`);
