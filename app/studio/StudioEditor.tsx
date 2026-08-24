"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ARTICLE_CATEGORIES, type ArticleCategory } from "@/lib/articles";
import { createClient } from "@/lib/supabase";
import { slugify } from "@/lib/slug";

export type ArticleSummary = {
  id: string;
  slug: string;
  title: string;
  category: string;
  status: string;
  published_at: string | null;
  updated_at: string;
};

type StudioEditorProps = {
  initialArticles: ArticleSummary[];
};

type ArticleResponse = {
  id: string;
  title: string;
  excerpt: string | null;
  body_markdown: string;
  category: string;
  cover_image_url: string | null;
  status: string;
};

function getFileExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  return file.type.split("/")[1]?.toLowerCase() || "png";
}

export default function StudioEditor({ initialArticles }: StudioEditorProps) {
  const supabase = useMemo(() => createClient(), []);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [articleId, setArticleId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ArticleCategory>(ARTICLE_CATEGORIES[0]);
  const [excerpt, setExcerpt] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [body, setBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingArticle, setIsLoadingArticle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ slug: string; status: string } | null>(null);

  function resetForm() {
    setArticleId(null);
    setTitle("");
    setCategory(ARTICLE_CATEGORIES[0]);
    setExcerpt("");
    setCoverImageUrl("");
    setBody("");
    setError(null);
    setSuccess(null);
  }

  async function loadArticle(id: string) {
    setIsLoadingArticle(true);
    setError(null);
    setSuccess(null);

    const { data, error: loadError } = await supabase
      .from("articles")
      .select("*")
      .eq("id", id)
      .single();

    setIsLoadingArticle(false);
    if (loadError || !data) {
      setError(loadError?.message ?? "Unable to load article.");
      return;
    }

    const article = data as ArticleResponse;
    setArticleId(article.id);
    setTitle(article.title);
    setCategory(
      (ARTICLE_CATEGORIES as readonly string[]).includes(article.category)
        ? (article.category as ArticleCategory)
        : ARTICLE_CATEGORIES[0]
    );
    setExcerpt(article.excerpt ?? "");
    setCoverImageUrl(article.cover_image_url ?? "");
    setBody(article.body_markdown ?? "");
  }

  function insertMarkdown(markdown: string, start: number, end: number) {
    setBody((current) => `${current.slice(0, start)}${markdown}${current.slice(end)}`);
    window.setTimeout(() => {
      const textarea = bodyRef.current;
      if (!textarea) return;
      textarea.focus();
      const cursor = start + markdown.length;
      textarea.setSelectionRange(cursor, cursor);
    }, 0);
  }

  async function uploadImage(file: File, start: number, end: number) {
    if (!file.type.startsWith("image/")) return;

    setIsUploading(true);
    setError(null);
    const path = `${crypto.randomUUID()}.${getFileExtension(file)}`;
    const { error: uploadError } = await supabase.storage
      .from("article-images")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setError(uploadError.message);
      setIsUploading(false);
      return;
    }

    const { data } = supabase.storage.from("article-images").getPublicUrl(path);
    insertMarkdown(`![](${data.publicUrl})`, start, end);
    setIsUploading(false);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
    if (!file) return;

    event.preventDefault();
    void uploadImage(file, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
  }

  function handleDrop(event: DragEvent<HTMLTextAreaElement>) {
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
    if (!file) return;

    event.preventDefault();
    void uploadImage(file, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
  }

  async function save(status: "draft" | "published") {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/studio/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(articleId ? { id: articleId } : {}),
          title,
          category,
          excerpt,
          cover_image_url: coverImageUrl,
          body_markdown: body,
          status,
        }),
      });
      const data = (await response.json()) as { slug?: string; status?: string; message?: string };

      if (!response.ok || !data.slug || !data.status) {
        setError(data.message ?? "Unable to save article.");
        return;
      }

      setSuccess({ slug: data.slug, status: data.status });

      if (!articleId) {
        const { data: savedArticle } = await supabase
          .from("articles")
          .select("id")
          .eq("slug", data.slug)
          .maybeSingle();
        setArticleId(savedArticle?.id ?? null);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const slug = slugify(title);

  return (
    <div className="mt-8 space-y-10">
      <section className="rounded-2xl border border-brand-green/20 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-brand-dark">{articleId ? "Edit article" : "New article"}</h2>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-md border border-brand-green/30 px-4 py-2 text-sm font-semibold text-brand-greenDark transition-colors hover:bg-brand-cream"
          >
            New article
          </button>
        </div>

        <div className="mt-6 grid gap-5">
          <label className="block">
            <span className="text-sm font-semibold text-brand-dark">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-brand-green/30 bg-white px-3 py-2 text-brand-dark outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20"
              type="text"
              placeholder="Article title"
            />
            <span className="mt-1.5 block text-xs text-brand-dark/60">
              URL: /articles/{slug || "article-slug"}
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-brand-dark">Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ArticleCategory)}
              className="mt-1.5 w-full rounded-md border border-brand-green/30 bg-white px-3 py-2 text-brand-dark outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20"
            >
              {ARTICLE_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-brand-dark">Excerpt <span className="font-normal text-brand-dark/60">(optional)</span></span>
            <textarea
              value={excerpt}
              onChange={(event) => setExcerpt(event.target.value)}
              className="mt-1.5 min-h-24 w-full rounded-md border border-brand-green/30 bg-white px-3 py-2 text-brand-dark outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20"
              placeholder="A short summary for article cards"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-brand-dark">Cover image URL <span className="font-normal text-brand-dark/60">(optional)</span></span>
            <input
              value={coverImageUrl}
              onChange={(event) => setCoverImageUrl(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-brand-green/30 bg-white px-3 py-2 text-brand-dark outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20"
              type="url"
              placeholder="https://..."
            />
          </label>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <label className="block min-w-0">
            <span className="text-sm font-semibold text-brand-dark">Markdown body</span>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onPaste={handlePaste}
              onDrop={handleDrop}
              className="mt-1.5 min-h-105 w-full rounded-md border border-brand-green/30 bg-brand-cream/40 px-3 py-3 font-mono text-sm text-brand-dark outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20"
              placeholder="Write your article in Markdown. Paste or drop images here to upload them."
            />
            <span className="mt-1.5 block text-xs text-brand-dark/60">
              Paste or drop an image here to upload it and insert Markdown.
              {isUploading ? " Uploading…" : ""}
            </span>
          </label>

          <div className="min-w-0 rounded-xl border border-brand-green/20 bg-brand-cream/40 p-5">
            <p className="text-sm font-semibold text-brand-dark">Preview</p>
            <div className="prose prose-lg mt-4 max-w-none prose-headings:font-heading prose-headings:text-brand-dark prose-a:text-brand-green prose-strong:text-brand-dark prose-img:rounded-xl">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body || "_Start writing to preview your article._"}</ReactMarkdown>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isSaving || isUploading}
            onClick={() => void save("draft")}
            className="rounded-md border border-brand-green/40 bg-white px-4 py-2 font-heading font-semibold text-brand-greenDark transition-colors hover:bg-brand-cream disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={isSaving || isUploading}
            onClick={() => void save("published")}
            className="rounded-md bg-brand-green px-4 py-2 font-heading font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Publish"}
          </button>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          {success ? (
            <p className="text-sm text-brand-greenDark">
              {success.status === "published" ? "Published:" : "Saved as draft:"}{" "}
              <Link href={`/articles/${success.slug}`} className="font-semibold underline">
                /articles/{success.slug}
              </Link>
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-brand-dark">Your articles</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-brand-green/20 bg-white">
          {initialArticles.length === 0 ? (
            <p className="p-6 text-sm text-brand-dark/60">No articles yet.</p>
          ) : (
            <ul className="divide-y divide-brand-green/10">
              {initialArticles.map((article) => (
                <li key={article.id}>
                  <button
                    type="button"
                    onClick={() => void loadArticle(article.id)}
                    className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-brand-cream/60"
                  >
                    <div>
                      <span className="font-semibold text-brand-dark">{article.title}</span>
                      <span className="ml-2 text-xs uppercase tracking-wide text-brand-green">{article.category}</span>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        article.status === "published"
                          ? "bg-brand-green/15 text-brand-greenDark"
                          : "bg-amber-500/15 text-amber-700"
                      }`}
                    >
                      {isLoadingArticle && articleId === article.id ? "Loading…" : article.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
