import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type ProductUpdate = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

function formatUpdateDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

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
  const { data: updates } = await supabase
    .from("product_updates")
    .select("id, title, body, created_at")
    .order("created_at", { ascending: false })
    .limit(12);

  const recentUpdates = (updates ?? []) as ProductUpdate[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">Dashboard</h1>
        <p className="mt-2 text-sm text-brand-dark/70">Your Draft Academical subscriber portal.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex max-h-80 flex-col rounded-xl border border-amber-400/50 bg-amber-500/10 p-6">
          <h2 className="text-2xl font-bold text-amber-200">What&apos;s New</h2>
          <div className="mt-3 flex-1 space-y-4 overflow-y-auto pr-1">
            {recentUpdates.length === 0 ? (
              <p className="text-sm text-brand-creamDark">Nothing posted yet — check back soon.</p>
            ) : (
              recentUpdates.map((update) => (
                <div key={update.id} className="border-t border-amber-400/20 pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-bold text-brand-cream">{update.title}</p>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-brand-creamDark">
                      {formatUpdateDate(update.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-brand-creamDark">{update.body}</p>
                </div>
              ))
            )}
          </div>
        </div>

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
