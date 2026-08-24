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

export function formatArticleDate(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
