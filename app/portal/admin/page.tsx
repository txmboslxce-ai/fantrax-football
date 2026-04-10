import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    redirect("/portal");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Admin</h1>
        <p className="mt-2 text-sm text-brand-creamDark">Admin tools — visible to admins only.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-200">Lineup Predictor</h2>
          <p className="mt-2 text-xs text-brand-creamDark">
            Override predicted start percentages for the upcoming gameweek lineup.
          </p>
          <Link
            href="/portal/lineup-predictor"
            className="mt-4 inline-flex items-center gap-2 rounded border border-amber-400/50 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
          >
            Open Lineup Predictor →
          </Link>
          <p className="mt-2 text-[10px] text-brand-creamDark/50">
            Use the &quot;Edit Start %&quot; button on the lineup predictor to override values.
            Changes are saved back to player_predictions.
          </p>
        </div>
      </div>
    </div>
  );
}
