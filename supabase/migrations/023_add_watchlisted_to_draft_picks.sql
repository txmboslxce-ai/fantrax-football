alter table public.draft_picks
  add column if not exists watchlisted boolean;
