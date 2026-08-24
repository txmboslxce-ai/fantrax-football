import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isWriter } from "@/lib/writer";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await isWriter(supabase, user.id))) {
    return (
      <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-red-400/40 bg-red-950/20 p-6">
          <h1 className="text-2xl font-bold">Writer Access Required</h1>
          <p className="mt-2 text-sm text-brand-creamDark">
            Your account does not have writer access. Contact an admin.
          </p>
        </div>
      </div>
    );
  }

  const { data: articles } = await supabase
    .from("articles")
    .select("id, slug, title, category, status, published_at, updated_at")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="min-h-full bg-brand-cream px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-4xl font-black text-brand-dark">Studio</h1>
        <p className="mt-2 text-brand-dark/70">Write and manage your articles.</p>

        <div className="mt-8 rounded-2xl border border-dashed border-brand-green/40 bg-white p-10 text-center text-brand-dark/60">
          Editor coming in the next step.
        </div>

        <h2 className="mt-12 text-2xl font-bold text-brand-dark">Your articles</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-brand-green/20 bg-white">
          {(articles ?? []).length === 0 ? (
            <p className="p-6 text-sm text-brand-dark/60">No articles yet.</p>
          ) : (
            <ul className="divide-y divide-brand-green/10">
              {(articles ?? []).map((a) => (
                <li key={a.id} className="flex items-center justify-between p-4">
                  <div>
                    <span className="font-semibold text-brand-dark">{a.title}</span>
                    <span className="ml-2 text-xs uppercase tracking-wide text-brand-green">{a.category}</span>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      a.status === "published"
                        ? "bg-brand-green/15 text-brand-greenDark"
                        : "bg-amber-500/15 text-amber-700"
                    }`}
                  >
                    {a.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
