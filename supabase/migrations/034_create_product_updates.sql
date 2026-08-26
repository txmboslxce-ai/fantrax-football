-- Product updates feed: a simple "what's new" list shown on the portal
-- Dashboard. Writes go through /api/admin/product-updates using the
-- service-role client (bypasses RLS), matching the rest of the app's
-- admin-only-write tables -- there are deliberately no insert/update/
-- delete policies for anon/authenticated below.

create table public.product_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index product_updates_created_at_idx
  on public.product_updates (created_at desc);

alter table public.product_updates enable row level security;

create policy product_updates_public_read
  on public.product_updates
  for select
  to anon, authenticated
  using (true);
