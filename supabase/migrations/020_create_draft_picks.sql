create table if not exists public.draft_picks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  picked boolean not null default false,
  notes text,
  updated_at timestamptz not null default now(),
  primary key (user_id, player_id)
);

alter table public.draft_picks enable row level security;

drop policy if exists draft_picks_own on public.draft_picks;

create policy draft_picks_own
  on public.draft_picks
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
