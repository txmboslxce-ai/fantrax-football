import Link from "next/link";

type TeamPlayerRow = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  seasonPts: number;
  avgGw: number;
  ghostGw: number;
};

type TeamCard = {
  team: string;
  teamName: string;
  totalPoints: number;
  avgPointsPerPlayerPerGame: number;
  topScorer: string;
  topScorerPts: number;
  topGhost: string;
  topGhostGw: number;
  players: TeamPlayerRow[];
};

export default function TeamsClient({ teamCards }: { teamCards: TeamCard[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {teamCards.map((team) => (
        <Link
          key={team.team}
          href={`/portal/teams/${encodeURIComponent(team.team.toLowerCase())}`}
          className="rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-4 text-left text-brand-cream transition-colors hover:bg-brand-greenDark"
        >
          <h2 className="text-lg font-black">{team.teamName}</h2>
          <p className="mt-2 text-sm">Total Pts: {team.totalPoints.toFixed(2)}</p>
          <p className="text-sm">Avg Pts/Player/G: {team.avgPointsPerPlayerPerGame.toFixed(2)}</p>
          <p className="mt-2 text-xs text-brand-creamDark">Top Scorer: {team.topScorer} ({team.topScorerPts.toFixed(2)})</p>
          <p className="text-xs text-brand-creamDark">Top Ghost: {team.topGhost} ({team.topGhostGw.toFixed(2)} / GW)</p>
        </Link>
      ))}
    </div>
  );
}
