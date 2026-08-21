create table public.sync_log (
  job text primary key,
  last_run_at timestamptz not null,
  last_success_at timestamptz,
  status text not null check (status in ('success', 'error')),
  gameweek integer,
  error text
);

alter table public.sync_log enable row level security;
