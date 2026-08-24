-- Articles system: writer roles, articles table, RLS, image storage bucket.

-- 1. profiles: writer flag + display name
alter table public.profiles add column if not exists is_writer boolean not null default false;
alter table public.profiles add column if not exists display_name text;

-- Prevent users self-granting writer status. is_writer is admin-only (service role / SQL editor).
revoke update (is_writer) on public.profiles from authenticated, anon;

-- 2. articles table
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  body_markdown text not null default '',
  category text not null check (category in (
    'Waiver Wire', 'Player Analysis', 'News', 'GW Preview', 'Trade Analysis'
  )),
  cover_image_url text,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists articles_status_published_at_idx
  on public.articles (status, published_at desc);
create index if not exists articles_category_idx on public.articles (category);
create index if not exists articles_author_id_idx on public.articles (author_id);

-- 3. updated_at trigger (uniquely named to avoid collision)
create or replace function public.articles_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists articles_set_updated_at_trg on public.articles;
create trigger articles_set_updated_at_trg
  before update on public.articles
  for each row execute function public.articles_set_updated_at();

-- 4. RLS
alter table public.articles enable row level security;

drop policy if exists articles_public_read on public.articles;
create policy articles_public_read on public.articles
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists articles_author_read_own on public.articles;
create policy articles_author_read_own on public.articles
  for select to authenticated
  using (author_id = auth.uid());

drop policy if exists articles_author_insert on public.articles;
create policy articles_author_insert on public.articles
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_writer)
  );

drop policy if exists articles_author_update on public.articles;
create policy articles_author_update on public.articles
  for update to authenticated
  using (
    author_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_writer)
  )
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_writer)
  );

drop policy if exists articles_author_delete on public.articles;
create policy articles_author_delete on public.articles
  for delete to authenticated
  using (
    author_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_writer)
  );

-- Note: admin "edit/unpublish anything" is done server-side via the service-role
-- client gated by ADMIN_EMAILS. No RLS policy needed for that path.

-- 5. Storage bucket for pasted/uploaded article images
insert into storage.buckets (id, name, public)
values ('article-images', 'article-images', true)
on conflict (id) do nothing;

drop policy if exists "article images public read" on storage.objects;
create policy "article images public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'article-images');

drop policy if exists "article images writer insert" on storage.objects;
create policy "article images writer insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'article-images'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_writer)
  );

drop policy if exists "article images writer delete" on storage.objects;
create policy "article images writer delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'article-images'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_writer)
  );

-- 6. Grant yourself writer access + a byline (edit the email, then run):
-- update public.profiles set is_writer = true, display_name = 'Tim'
-- where email = 'YOUR_EMAIL_HERE';
