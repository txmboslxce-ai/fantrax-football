import type { MetadataRoute } from "next";
import { getPublishedArticles } from "@/lib/articles-server";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.draftacademical.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/articles`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/episodes`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/contact`, changeFrequency: "monthly", priority: 0.3 },
  ];

  let articleRoutes: MetadataRoute.Sitemap = [];
  try {
    const articles = await getPublishedArticles();
    articleRoutes = articles.map((a) => ({
      url: `${BASE}/articles/${a.slug}`,
      lastModified: a.published_at ?? undefined,
      changeFrequency: "monthly",
      priority: 0.8,
    }));
  } catch {
    // If the DB read fails, still return static routes.
  }

  return [...staticRoutes, ...articleRoutes];
}
