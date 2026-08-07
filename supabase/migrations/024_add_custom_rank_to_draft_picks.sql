alter table public.draft_picks
  add column if not exists custom_rank numeric;
