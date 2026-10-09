-- The few Supabase objects the migrations lean on, so they can run in a plain
-- Postgres 16 (CI, or a throwaway database). Not for a real project: Supabase
-- already has all of this.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
-- Like Supabase's: the signed-in user comes from the request's JWT claims.
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create extension if not exists btree_gist;
