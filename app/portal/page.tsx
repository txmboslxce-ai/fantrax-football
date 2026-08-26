import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type LatestUpdate = {
  title: string;
};

const portalCards = [
  { href: "/portal/players", title: "Players", description: "Search and filter all 900+ players by position and form. Click any player for an in-depth profile including full stat history and gameweek breakdown." },
  { href: "/portal/drafttool", title: "Draft Tool", description: "Compare season rank, ADP and ADP vs Rank, then drag players into your own order and track Picked and Watchlist marks on draft day." },
  { href: "/portal/my-league", title: "My League", description: "Connect your Fantrax league to see which players are available in your waiver pool." },
  { href: "/portal/stats", title: "Stats", description: "Search and sort players by any stat used in Fantrax scoring. Filter by position, team, and time window to find the edge." },
  { href: "/portal/fixtures", title: "Fixtures", description: "Upcoming fixture difficulty plus a full match-by-match breakdown of Fantrax scores across every gameweek." },
  { href: "/portal/compare", title: "Compare", description: "Head-to-head player comparisons across key metrics." },
  { href: "/portal/teams", title: "Teams", description: "Team pages with set piece takers, points conceded by position, and form data." },
  { href: "/portal/advice", title: "Advice", description: "See how players' recent form stacks up against what their next opponent has been conceding — a quick way to spot a favorable matchup before you set your lineup." },
];

export default async function PortalPage() {
  const supabase = await createServerSupabaseClient();
  const { data: latestUpdateRow } = await supabase
    .from("product_updates")
    .select("title")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestUpdate = latestUpdateRow as LatestUpdate | null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">Dashboard</h1>
          <p className="mt-2 text-sm text-brand-dark/70">Your Draft Academical subscriber portal.</p>
        </div>

        <Link
          href="/portal/updates"
          prefetch={false}
          className="flex min-w-0 shrink-0 items-center gap-2 rounded-full border border-amber-400/60 bg-brand-dark px-5 py-1.5 text-xs transition-colors hover:bg-amber-500/10"
        >
          <span className="shrink-0 font-bold uppercase tracking-wide text-amber-300">What&apos;s New</span>
          <span className="min-w-[10rem] truncate text-brand-creamDark sm:min-w-[16rem]">
            {latestUpdate ? latestUpdate.title : "Nothing posted yet"}
          </span>
          <span className="shrink-0 text-amber-300">&rarr;</span>
        </Link>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {portalCards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            prefetch={false}
            className="rounded-xl border border-brand-cream/25 bg-brand-dark p-6 transition-colors hover:bg-brand-dark/80"
          >
            <h2 className="text-2xl font-bold text-brand-cream">{card.title}</h2>
            <p className="mt-2 text-sm text-brand-creamDark">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
