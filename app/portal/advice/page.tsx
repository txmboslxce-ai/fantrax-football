import AdviceClient from "@/app/portal/advice/AdviceClient";
import { getAdviceData } from "@/app/portal/advice/getAdviceData";
import { getUserLeagueRoster } from "@/lib/portal/leagueRoster";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SEASON } from "@/lib/portal/playerMetrics";

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
        <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Advice</h1>
        <p className="mt-2 text-sm text-brand-creamDark">
          Season {SEASON} — player averages vs upcoming fixture difficulty.
        </p>
      </div>
      <AdviceClient players={players} leagueRoster={leagueRoster} />
    </div>
  );
}
