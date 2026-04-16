import Link from "next/link";

const portalCards = [
  {
    href: "/portal/players",
    title: "Players",
    description: "Search and filter all 900+ players by position and form. Click any player for an in-depth profile including full stat history and gameweek breakdown.",
    premium: false,
  },
  {
    href: "/portal/my-league",
    title: "My League",
    description: "Connect your Fantrax league to see which players are available in your waiver pool.",
    premium: true,
  },
  {
    href: "/portal/stats",
    title: "Stats",
    description: "Search and sort players by any stat used in Fantrax scoring. Filter by position, team, and time window to find the edge.",
    premium: true,
  },
  {
    href: "/portal/fixtures",
    title: "Fixtures",
    description: "Upcoming fixture difficulty plus a full match-by-match breakdown of Fantrax scores across every gameweek.",
    premium: false,
  },
  {
    href: "/portal/compare",
    title: "Compare",
    description: "Head-to-head player comparisons across key metrics.",
    premium: true,
  },
  {
    href: "/portal/teams",
    title: "Teams",
    description: "Team pages with set piece takers, points conceded by position, and form data.",
    premium: true,
  },
];

export default function PortalPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Dashboard</h1>
        <p className="mt-2 text-sm text-brand-creamDark">Your Fantrax and Football subscriber portal.</p>
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
