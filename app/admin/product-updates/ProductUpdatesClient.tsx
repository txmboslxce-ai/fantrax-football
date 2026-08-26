"use client";

import { useState } from "react";

type ProductUpdate = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProductUpdatesClient({ initialUpdates }: { initialUpdates: ProductUpdate[] }) {
  const [updates, setUpdates] = useState<ProductUpdate[]>(initialUpdates);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handlePost() {
    setIsPosting(true);
    setPostError(null);

    try {
      const response = await fetch("/api/admin/product-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const result = (await response.json()) as { success: boolean; update?: ProductUpdate; message?: string };

      if (!result.success || !result.update) {
        setPostError(result.message ?? "Failed to post update.");
        return;
      }

      setUpdates((current) => [result.update as ProductUpdate, ...current]);
      setTitle("");
      setBody("");
    } catch (error) {
      setPostError(error instanceof Error ? error.message : "Failed to post update.");
    } finally {
      setIsPosting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);

    try {
      const response = await fetch(`/api/admin/product-updates?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const result = (await response.json()) as { success: boolean; message?: string };

      if (!result.success) {
        setPostError(result.message ?? "Failed to delete update.");
        return;
      }

      setUpdates((current) => current.filter((update) => update.id !== id));
    } catch (error) {
      setPostError(error instanceof Error ? error.message : "Failed to delete update.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-black sm:text-4xl">Product Updates</h1>
          <p className="mt-2 text-sm text-brand-creamDark">
            Posts here show up on subscribers&apos; Dashboard under &quot;What&apos;s New,&quot; newest first.
          </p>
        </div>

        <section className="rounded-xl border border-brand-green/40 bg-brand-green/10 p-6">
          <h2 className="text-xl font-bold text-brand-cream">Post an update</h2>

          <div className="mt-4 space-y-4">
            <label className="block text-sm">
              <span className="mb-2 block font-semibold text-brand-creamDark">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Faster page loads across Players, Stats & Draft Tool"
                className="w-full rounded-md border border-brand-cream/30 bg-brand-dark px-3 py-2 text-brand-cream"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-2 block font-semibold text-brand-creamDark">Description</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={4}
                placeholder="What changed and why it matters to subscribers."
                className="w-full rounded-md border border-brand-cream/30 bg-brand-dark px-3 py-2 text-brand-cream"
              />
            </label>

            <button
              type="button"
              onClick={handlePost}
              disabled={isPosting || !title.trim() || !body.trim()}
              className="rounded-md border border-brand-cream/30 bg-brand-dark px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60"
            >
              {isPosting ? "Posting..." : "Post Update"}
            </button>

            {postError ? (
              <div className="rounded-lg border border-red-400/50 bg-red-950/25 p-4 text-sm">{postError}</div>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-brand-cream">Posted updates ({updates.length})</h2>

          {updates.length === 0 ? (
            <p className="text-sm text-brand-creamDark">Nothing posted yet.</p>
          ) : (
            <div className="space-y-3">
              {updates.map((update) => (
                <article key={update.id} className="rounded-xl border border-brand-cream/25 bg-brand-green/10 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-brand-cream">{update.title}</h3>
                      <p className="mt-1 text-xs uppercase tracking-wide text-brand-creamDark">{formatDate(update.created_at)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(update.id)}
                      disabled={deletingId === update.id}
                      className="shrink-0 rounded-md border border-red-400/40 bg-red-950/20 px-3 py-1.5 text-xs font-semibold text-red-200 transition-colors hover:bg-red-950/40 disabled:opacity-60"
                    >
                      {deletingId === update.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-brand-creamDark">{update.body}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
