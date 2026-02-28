import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const SEASON = "2025-26";

const portalCards = [
  {
    href: "/portal/players",
    title: "Players",
    description: "Search the player pool and scout breakout options.",
    premium: false,
  },
  {
    href: "/portal/fixtures",
    title: "Fixtures",
    description: "Plan waivers and transfers around upcoming fixtures.",
    premium: false,
  },
  {
    href: "/portal/teams",
    title: "Teams",
    description: "Team-level trends, pace, and chance creation profiles.",
    premium: true,
  },
  {
    href: "/portal/compare",
    title: "Compare",
    description: "Side-by-side player comparisons across advanced metrics.",
    premium: true,
  },
  {
    href: "/portal/stats",
    title: "Stats",
    description: "Position and role-driven model outputs and projections.",
    premium: true,
  },
  {
    href: "/portal/my-league",
    title: "My League",
    description: "League-specific recommendations and free-agent opportunities.",
    premium: true,
  },
];

type PlayerTotalRow = {
  player_id: string;
  raw_fantrax_pts: number;
  players:
    | {
        name: string;
      }
    | Array<{
        name: string;
      }>
    | null;
};

export default async function PortalPage() {
  const supabase = await createServerSupabaseClient();

  const [{ count: playersCount }, { data: gameweeksData }, { data: scorerRows, error: scorerError }] = await Promise.all([
    supabase.from("players").select("id", { count: "exact", head: true }),
    supabase.from("player_gameweeks").select("gameweek").eq("season", SEASON),
    supabase
      .from("player_gameweeks")
      .select("player_id, raw_fantrax_pts, players!inner(name)")
      .eq("season", SEASON)
      .eq("games_played", 1),
  ]);

  if (scorerError) {
    throw new Error(`Unable to load portal summary: ${scorerError.message}`);
  }

  const uploadedGameweeks = new Set((gameweeksData ?? []).map((row) => row.gameweek)).size;

  const totalsByPlayer = new Map<string, { name: string; points: number }>();
  for (const row of (scorerRows ?? []) as PlayerTotalRow[]) {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;
    if (!player) {
      continue;
    }

    const existing = totalsByPlayer.get(row.player_id);
    if (!existing) {
      totalsByPlayer.set(row.player_id, {
        name: player.name,
        points: Number(row.raw_fantrax_pts ?? 0),
      });
      continue;
    }

    existing.points += Number(row.raw_fantrax_pts ?? 0);
  }

  const topScorer = Array.from(totalsByPlayer.values()).sort((a, b) => b.points - a.points)[0] ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Dashboard</h1>
        <p className="mt-2 text-sm text-brand-creamDark">Free tools and season summary for {SEASON}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-brand-green/50 bg-brand-green p-5 text-brand-cream">
          <p className="text-xs uppercase tracking-widest text-brand-creamDark">Total Players</p>
          <p className="mt-2 text-3xl font-black">{playersCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-brand-green/50 bg-brand-green p-5 text-brand-cream">
          <p className="text-xs uppercase tracking-widest text-brand-creamDark">Gameweeks Uploaded</p>
          <p className="mt-2 text-3xl font-black">{uploadedGameweeks}</p>
        </div>
        <div className="rounded-xl border border-brand-green/50 bg-brand-green p-5 text-brand-cream">
          <p className="text-xs uppercase tracking-widest text-brand-creamDark">Top Scorer</p>
          <p className="mt-2 text-lg font-black sm:text-xl">
            {topScorer ? `${topScorer.name} (${topScorer.points.toFixed(1)} pts)` : "No data"}
          </p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {portalCards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className={`rounded-xl border p-6 transition-colors ${
              card.premium
                ? "border-brand-cream/25 bg-brand-dark hover:bg-brand-dark/80"
                : "border-brand-greenLight/50 bg-brand-green hover:bg-brand-greenLight"
            }`}
          >
            <h2 className="text-2xl font-bold text-brand-cream">
              {card.title}
              {card.premium ? <span className="ml-2 align-middle text-base">🔒</span> : null}
            </h2>
            <p className="mt-2 text-sm text-brand-creamDark">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
