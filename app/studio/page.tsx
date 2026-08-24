import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin";
import { isWriter } from "@/lib/writer";
import StudioEditor, { type ArticleSummary } from "./StudioEditor";

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
    .select("id, slug, title, category, status, published_at, updated_at, view_count")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="min-h-full bg-brand-cream px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-4xl font-black text-brand-dark">Studio</h1>
        <p className="mt-2 text-brand-dark/70">Write and manage your articles.</p>

        <StudioEditor initialArticles={(articles ?? []) as ArticleSummary[]} isAdmin={isAdminEmail(user.email)} />
      </div>
    </div>
  );
}
