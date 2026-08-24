import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatArticleDate } from "@/lib/articles";
import { getArticleBySlug } from "@/lib/articles-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    return { title: "Article not found" };
  }

  const description = article.excerpt ?? undefined;
  const canonical = `/articles/${article.slug}`;

  return {
    title: article.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: article.title,
      description,
      url: canonical,
      publishedTime: article.published_at ?? undefined,
      authors: article.author_name ? [article.author_name] : undefined,
      section: article.category,
      ...(article.cover_image_url ? { images: [article.cover_image_url] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description,
      ...(article.cover_image_url ? { images: [article.cover_image_url] } : {}),
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  // Fire-and-forget view increment. Never block or fail the render on this.
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.rpc("increment_article_view", { article_slug: slug });
  } catch {
    // Ignore counting errors.
  }

  return (
    <div className="bg-brand-cream px-4 py-16 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: article.title,
            description: article.excerpt ?? undefined,
            datePublished: article.published_at ?? undefined,
            author: article.author_name
              ? { "@type": "Person", name: article.author_name }
              : undefined,
            image: article.cover_image_url ?? undefined,
            articleSection: article.category,
          }),
        }}
      />
      <article className="mx-auto max-w-3xl">
        <Link href="/articles" className="text-sm font-semibold text-brand-green hover:text-brand-greenDark">
          ← All articles
        </Link>

        <span className="mt-6 block text-xs font-bold uppercase tracking-wide text-brand-green">
          {article.category}
        </span>
        <h1 className="mt-2 text-4xl font-black text-brand-dark sm:text-5xl">{article.title}</h1>
        <div className="mt-3 text-sm text-brand-dark/60">
          {article.author_name ? `${article.author_name} · ` : ""}
          {formatArticleDate(article.published_at)}
        </div>

        {article.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.cover_image_url}
            alt=""
            className="mt-8 w-full rounded-2xl object-cover"
          />
        ) : null}

        <div className="prose prose-lg mt-8 max-w-none prose-headings:font-heading prose-headings:text-brand-dark prose-a:text-brand-green prose-strong:text-brand-dark prose-img:rounded-xl">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.body_markdown}</ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
