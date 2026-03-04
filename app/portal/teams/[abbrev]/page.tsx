import PremiumGate from "@/components/PremiumGate";
import { isPremiumUserEmail } from "@/lib/premium";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";
import { notFound } from "next/navigation";

const TEAM_TABS = [
  { key: "overview", label: "Overview" },
  { key: "squad", label: "Squad" },
  { key: "fixtures", label: "Fixtures" },
  { key: "stats", label: "Stats" },
] as const;

type TeamTabKey = (typeof TEAM_TABS)[number]["key"];

type TeamDetailPageProps = {
  params: Promise<{
    abbrev: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
  }>;
};

function toTabKey(value: string | undefined): TeamTabKey {
  const tab = value?.toLowerCase();
  return TEAM_TABS.some((item) => item.key === tab) ? (tab as TeamTabKey) : "overview";
}

export default async function TeamDetailPage({ params, searchParams }: TeamDetailPageProps) {
  const [{ abbrev }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const teamAbbrev = abbrev.toUpperCase().trim();
  const activeTab = toTabKey(resolvedSearchParams?.tab);

  const supabase = await createServerSupabaseClient();
  const [
    {
      data: { user },
    },
    { data: team, error: teamError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("teams").select("abbrev, full_name").eq("abbrev", teamAbbrev).maybeSingle(),
  ]);

  if (teamError) {
    throw new Error(`Unable to load team: ${teamError.message}`);
  }
  if (!team) {
    notFound();
  }

  const panelContent: Record<TeamTabKey, { title: string; description: string }> = {
    overview: {
      title: "Overview",
      description: "Team summary widgets and trend snapshots will appear here.",
    },
    squad: {
      title: "Squad",
      description: "Squad depth, player roles, and position breakdowns will appear here.",
    },
    fixtures: {
      title: "Fixtures",
      description: "Upcoming fixture runs and difficulty views will appear here.",
    },
    stats: {
      title: "Stats",
      description: "Team-level performance metrics and splits will appear here.",
    },
  };

  return (
    <PremiumGate isPremium={isPremiumUserEmail(user?.email)}>
      <div className="space-y-6">
        <header className="rounded-xl border border-brand-cream/20 bg-brand-dark px-5 py-4">
          <p className="text-xs uppercase tracking-widest text-brand-creamDark">{team.abbrev}</p>
          <h1 className="mt-1 text-3xl font-black text-brand-cream sm:text-4xl">{team.full_name}</h1>
        </header>

        <nav className="flex flex-wrap gap-2">
          {TEAM_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/portal/teams/${encodeURIComponent(team.abbrev.toLowerCase())}?tab=${tab.key}`}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? "border-brand-greenLight bg-brand-green text-brand-cream"
                  : "border-brand-cream/35 bg-brand-dark text-brand-cream hover:bg-brand-greenDark"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <section className="rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-6 text-brand-cream">
          <h2 className="text-xl font-black">{panelContent[activeTab].title}</h2>
          <p className="mt-2 text-sm text-brand-creamDark">{panelContent[activeTab].description}</p>
        </section>
      </div>
    </PremiumGate>
  );
}
