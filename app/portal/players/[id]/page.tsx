import PremiumGate from "@/components/PremiumGate";
import { isPremiumUserEmail } from "@/lib/premium";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type PlayerDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function PlayerDetailPage({ params }: PlayerDetailPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const [
    {
      data: { user },
    },
    { data: player },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("players").select("id, name, team, position").eq("id", id).maybeSingle(),
  ]);

  const isPremium = isPremiumUserEmail(user?.email);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">{player?.name ?? "Player"}</h1>
        <p className="mt-2 text-sm text-brand-creamDark">Detailed player analytics and trend breakdown.</p>
      </div>

      <PremiumGate isPremium={isPremium}>
        <section className="rounded-xl border border-brand-cream/20 bg-brand-dark/80 p-6 text-brand-cream">
          <p className="text-sm text-brand-creamDark">Team: {player?.team ?? "Unknown"}</p>
          <p className="mt-2 text-sm text-brand-creamDark">Position: {player?.position ?? "Unknown"}</p>
          <p className="mt-4">Premium detail placeholder. Full content will be wired in a later phase.</p>
        </section>
      </PremiumGate>
    </div>
  );
}
