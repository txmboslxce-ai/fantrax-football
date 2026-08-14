create table if not exists live_draft_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id text not null,
  connected_at timestamptz not null default now()
);

create index if not exists live_draft_connections_user_id_idx
  on live_draft_connections(user_id);

alter table live_draft_connections enable row level security;

create policy "Users can insert their own connections"
  on live_draft_connections for insert
  with check (auth.uid() = user_id);

create policy "Users can view their own connections"
  on live_draft_connections for select
  using (auth.uid() = user_id);
