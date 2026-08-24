-- Article view counter: column + security-definer increment RPC.

alter table public.articles add column if not exists view_count integer not null default 0;

-- Increment via RPC so the public (anon) detail page can count views
-- without direct UPDATE rights on the table. security definer runs the
-- update with the function owner's privileges; the search_path is pinned
-- to prevent hijacking.
create or replace function public.increment_article_view(article_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.articles
  set view_count = view_count + 1
  where slug = article_slug and status = 'published';
$$;

-- Anon and authenticated can execute the RPC, but still cannot UPDATE the table directly.
grant execute on function public.increment_article_view(text) to anon, authenticated;
