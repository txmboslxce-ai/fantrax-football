import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Article, ArticleListItem } from "@/lib/articles";

const LIST_COLUMNS =
  "slug, title, excerpt, category, cover_image_url, author_name, published_at";

export async function getPublishedArticles(
  category?: string
): Promise<ArticleListItem[]> {
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("articles")
    .select(LIST_COLUMNS)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(200);

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load articles: ${error.message}`);
  }
  return (data ?? []) as ArticleListItem[];
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("articles")
    .select(`id, ${LIST_COLUMNS}, body_markdown`)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load article: ${error.message}`);
  }
  return (data as Article | null) ?? null;
}
