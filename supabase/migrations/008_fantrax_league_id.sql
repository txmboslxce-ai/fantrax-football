alter table profiles add column if not exists fantrax_league_id text;
alter table profiles add column if not exists fantrax_league_last_synced_at timestamptz;

-- Allow users to update their own profile (needed for league sync)
drop policy if exists profiles_update_own on profiles;

create policy profiles_update_own
  on profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
