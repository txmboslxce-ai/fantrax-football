import { createServerSupabaseClient } from "@/lib/supabase-server";

export const ARTICLE_CATEGORIES = [
  "Waiver Wire",
  "Player Analysis",
  "News",
  "GW Preview",
  "Trade Analysis",
] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

export type ArticleListItem = {
  slug: string;
  title: string;
  excerpt: string | null;
  category: string;
  cover_image_url: string | null;
  author_name: string | null;
  published_at: string | null;
};

export type Article = ArticleListItem & {
  id: string;
  body_markdown: string;
};

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

export function formatArticleDate(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
