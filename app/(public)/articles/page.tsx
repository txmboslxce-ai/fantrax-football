import Link from "next/link";
import ArticleCategoryChips from "@/components/ArticleCategoryChips";
import {
  ARTICLE_CATEGORIES,
  formatArticleDate,
  type ArticleCategory,
} from "@/lib/articles";
import { getPublishedArticles } from "@/lib/articles-server";

export const dynamic = "force-dynamic";

type SearchParams = { category?: string };

function isValidCategory(value: string | undefined): value is ArticleCategory {
  return !!value && (ARTICLE_CATEGORIES as readonly string[]).includes(value);
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { category } = await searchParams;
  const activeCategory = isValidCategory(category) ? category : undefined;
  const articles = await getPublishedArticles(activeCategory);

  return (
    <div className="bg-brand-cream px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-black text-brand-dark sm:text-5xl">Articles</h1>
        <p className="mt-4 text-lg text-brand-dark/80">
          Waiver wire tips, player analysis and more
        </p>

        <ArticleCategoryChips />

        {articles.length === 0 ? (
          <section className="mt-10 rounded-2xl border border-dashed border-brand-green/40 bg-white p-10 text-center">
            <h2 className="text-2xl font-bold text-brand-greenDark">
              {activeCategory ? `No ${activeCategory} articles yet` : "New articles coming soon"}
            </h2>
          </section>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <Link
                key={article.slug}
                href={`/articles/${article.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-brand-green/20 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                {article.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={article.cover_image_url}
                    alt=""
                    className="h-44 w-full object-cover"
                  />
                ) : (
                  <div className="h-44 w-full bg-brand-green/10" />
                )}
                <div className="flex flex-1 flex-col p-5">
                  <span className="text-xs font-bold uppercase tracking-wide text-brand-green">
                    {article.category}
                  </span>
                  <h2 className="mt-2 text-xl font-bold text-brand-dark group-hover:text-brand-greenDark">
                    {article.title}
                  </h2>
                  {article.excerpt ? (
                    <p className="mt-2 flex-1 text-sm text-brand-dark/70">{article.excerpt}</p>
                  ) : (
                    <div className="flex-1" />
                  )}
                  <div className="mt-4 text-xs text-brand-dark/60">
                    {article.author_name ? `${article.author_name} · ` : ""}
                    {formatArticleDate(article.published_at)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
