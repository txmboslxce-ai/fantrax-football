create table if not exists league_analytics_cache (
  league_id text primary key,
  computed_at timestamptz not null default now(),
  payload jsonb not null
);
alter table league_analytics_cache enable row level security;
create policy "Public read" on league_analytics_cache for select using (true);
create policy "Service role write" on league_analytics_cache for all using (auth.role() = 'service_role');
