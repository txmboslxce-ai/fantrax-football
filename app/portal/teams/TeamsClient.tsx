"use client";

import { useState } from "react";

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
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {teamCards.map((team) => (
          <button
            key={team.team}
            type="button"
            onClick={() => setExpandedTeam((prev) => (prev === team.team ? null : team.team))}
            className="rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-4 text-left text-brand-cream transition-colors hover:bg-brand-greenDark"
          >
            <h2 className="text-lg font-black">{team.teamName}</h2>
            <p className="mt-2 text-sm">Total Pts: {team.totalPoints.toFixed(1)}</p>
            <p className="text-sm">Avg Pts/Player/G: {team.avgPointsPerPlayerPerGame.toFixed(2)}</p>
            <p className="mt-2 text-xs text-brand-creamDark">Top Scorer: {team.topScorer} ({team.topScorerPts.toFixed(1)})</p>
            <p className="text-xs text-brand-creamDark">Top Ghost: {team.topGhost} ({team.topGhostGw.toFixed(2)} / GW)</p>
          </button>
        ))}
      </div>

      {expandedTeam && (
        <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-brand-dark text-brand-creamDark">
              <tr>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Season Pts</th>
                <th className="px-4 py-3">Avg/GW</th>
                <th className="px-4 py-3">Ghost/GW</th>
              </tr>
            </thead>
            <tbody>
              {teamCards
                .find((team) => team.team === expandedTeam)
                ?.players.map((player, index) => (
                  <tr key={player.id} className={index % 2 === 0 ? "bg-brand-dark/75 text-brand-cream" : "bg-brand-dark text-brand-cream"}>
                    <td className="px-4 py-3">{player.name}</td>
                    <td className="px-4 py-3">{player.position}</td>
                    <td className="px-4 py-3">{player.seasonPts.toFixed(1)}</td>
                    <td className="px-4 py-3">{player.avgGw.toFixed(2)}</td>
                    <td className="px-4 py-3">{player.ghostGw.toFixed(2)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
