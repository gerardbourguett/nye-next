begin;

-- Slots may now run up to 92 days, so a rehearsal can stay on air from
-- early October until New Year. Every existing row (5 minutes to 7 days)
-- satisfies the new check. Mirrors MAX_SLOT_DAYS / validateWindow() in
-- lib/streams/domain.ts; published slots still may not overlap.
alter table public.stream_slots drop constraint slot_duration;
alter table public.stream_slots add constraint slot_duration check (
  ends_at - starts_at between interval '5 minutes' and interval '92 days'
  and mod(extract(epoch from ends_at - starts_at), 60) = 0
);

commit;
