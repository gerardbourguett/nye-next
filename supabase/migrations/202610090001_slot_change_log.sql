begin;

-- Who changed the schedule, and how. Every insert, update and delete of a
-- stream slot is recorded by a trigger, so the log cannot be skipped by the
-- application (or by another admin tool). It is append-only: no application
-- role can write, change or delete a row, and only admins can read it.
-- `changed_by` is the signed-in user (auth.uid()); it is null for changes
-- made from the SQL Editor or by the service role. Safe to run again.
create table if not exists public.stream_slot_changes (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  slot_id uuid not null,
  before jsonb,
  after jsonb
);
create index if not exists stream_slot_changes_recent on public.stream_slot_changes (changed_at desc, id desc);
alter table public.stream_slot_changes enable row level security;
revoke all on public.stream_slot_changes from public, anon, authenticated;
grant select on public.stream_slot_changes to authenticated;
drop policy if exists "Admins may read the change log" on public.stream_slot_changes;
create policy "Admins may read the change log" on public.stream_slot_changes
  for select to authenticated using (
    exists (select 1 from public.stream_admins where user_id = (select auth.uid()))
  );

create or replace function public.log_stream_slot_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.stream_slot_changes (changed_by, operation, slot_id, after)
      values ((select auth.uid()), 'insert', new.id, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    -- A save that changes nothing is not a change.
    if to_jsonb(new) is distinct from to_jsonb(old) then
      insert into public.stream_slot_changes (changed_by, operation, slot_id, before, after)
        values ((select auth.uid()), 'update', new.id, to_jsonb(old), to_jsonb(new));
    end if;
  else
    insert into public.stream_slot_changes (changed_by, operation, slot_id, before)
      values ((select auth.uid()), 'delete', old.id, to_jsonb(old));
  end if;
  return null;
end;
$$;
revoke all on function public.log_stream_slot_change() from public, anon, authenticated;

drop trigger if exists stream_slots_change_log on public.stream_slots;
create trigger stream_slots_change_log
  after insert or update or delete on public.stream_slots
  for each row execute function public.log_stream_slot_change();

commit;
