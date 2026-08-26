import { createServerSupabaseClient } from "@/lib/supabase-server";

type ProductUpdate = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

function formatUpdateDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default async function UpdatesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: updates, error } = await supabase
    .from("product_updates")
    .select("id, title, body, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load product updates: ${error.message}`);
  }

  const allUpdates = (updates ?? []) as ProductUpdate[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">What&apos;s New</h1>
        <p className="mt-2 text-sm text-brand-dark/70">Everything we&apos;ve shipped on the portal, newest first.</p>
      </div>

      {allUpdates.length === 0 ? (
        <p className="text-sm text-brand-dark/70">Nothing posted yet — check back soon.</p>
      ) : (
        <div className="space-y-4">
          {allUpdates.map((update) => (
            <article key={update.id} className="rounded-xl border-2 border-amber-400/70 bg-brand-dark p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold text-amber-200">{update.title}</h2>
                <span className="shrink-0 text-xs uppercase tracking-wide text-brand-creamDark">
                  {formatUpdateDate(update.created_at)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-brand-creamDark">{update.body}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
