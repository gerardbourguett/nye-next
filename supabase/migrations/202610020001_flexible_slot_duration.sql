begin;

-- Slots were exactly one hour. They now default to one hour in the admin but
-- may run 5 minutes to 7 days (rehearsals, long simulcasts). Every existing
-- one-hour row satisfies the new check. Mirrors validateWindow() in
-- lib/streams/domain.ts; published slots still may not overlap.
alter table public.stream_slots drop constraint one_hour_window;
alter table public.stream_slots add constraint slot_duration check (
  ends_at - starts_at between interval '5 minutes' and interval '7 days'
  and date_trunc('minute', starts_at) = starts_at
  and date_trunc('minute', ends_at) = ends_at
);

commit;
