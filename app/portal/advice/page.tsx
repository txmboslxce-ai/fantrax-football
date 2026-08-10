import AdviceClient from "@/app/portal/advice/AdviceClient";
import { getAdviceData } from "@/app/portal/advice/getAdviceData";
import { getUserLeagueRoster } from "@/lib/portal/leagueRoster";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export default async function AdvicePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ players }, leagueRoster] = await Promise.all([
    getAdviceData(),
    user ? getUserLeagueRoster(user.id) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">Advice</h1>
        <p className="mt-2 text-sm text-brand-dark/70">
          Season 2026-27 — player averages vs upcoming fixture difficulty.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm leading-6 text-slate-600">
          See how players&apos; recent form stacks up against what their next opponent has been conceding — a quick way to spot a favorable matchup before you set your lineup.
        </p>
      </div>
      <AdviceClient players={players} leagueRoster={leagueRoster} />
    </div>
  );
}
