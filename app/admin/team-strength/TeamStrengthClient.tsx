"use client";

import { Fragment, useEffect, useState } from "react";

type TeamStatKey =
  | "expected_goals"
  | "total_shots"
  | "shots_on_target"
  | "shots_inside_box"
  | "shots_outside_box"
  | "big_chances"
  | "big_chances_scored"
  | "big_chances_missed"
  | "touches_in_penalty_area"
  | "tackles_won"
  | "interceptions"
  | "clearances"
  | "corner_kicks"
  | "dispossessed"
  | "blocked_shots"
  | "ball_possession"
  | "pass_accuracy_pct"
  | "dangerous_attack_pct";

type TeamStrengthProfile = {
  teamAbbrev: string;
  gamesPlayed: number;
  createdPerMatch: Record<TeamStatKey, number>;
  createdFactor: Record<TeamStatKey, number>;
  concededPerMatch: Record<TeamStatKey, number>;
  concededFactor: Record<TeamStatKey, number>;
};

// The full rating covers every column on team_match_stats -- this view
// surfaces the handful most relevant to sanity-checking the numbers at a
// glance; the rest is available from /api/admin/team-strength-ratings.
const DISPLAY_STATS: Array<{ key: TeamStatKey; label: string }> = [
  { key: "expected_goals", label: "xG" },
  { key: "total_shots", label: "Shots" },
  { key: "shots_on_target", label: "Shots on Target" },
  { key: "big_chances", label: "Big Chances" },
  { key: "touches_in_penalty_area", label: "Box Touches" },
];

function factorClass(factor: number): string {
  if (factor >= 1.15) return "text-red-300 font-semibold";
  if (factor <= 0.85) return "text-emerald-300 font-semibold";
  return "text-brand-creamDark";
}

export default function TeamStrengthClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamStrengthProfile[]>([]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/team-strength-ratings");
        const body = (await response.json().catch(() => ({}))) as { teams?: TeamStrengthProfile[]; message?: string };
        if (!response.ok) throw new Error(body.message ?? `Failed to load (${response.status})`);
        if (alive) setTeams(body.teams ?? []);
      } catch (err: unknown) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load team strength ratings");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-black sm:text-4xl">Team Strength Ratings</h1>
        <p className="mt-2 text-sm text-brand-creamDark">
          Opponent-adjustment factors computed from backfilled BSD match stats, shrunk toward league average for teams with
          few games played. 1.00 = league average; &gt;1 means this team&apos;s opponents create/concede more of that stat
          than average, &lt;1 means less. &quot;For&quot; is the team&apos;s own output, &quot;Against&quot; is what they
          concede.
        </p>

        {loading ? <p className="mt-6 text-sm text-brand-creamDark">Loading...</p> : null}
        {error ? <p className="mt-6 text-sm text-red-300">{error}</p> : null}

        {!loading && !error ? (
          <div className="mt-6 overflow-x-auto rounded-lg border border-brand-cream/20">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-brand-green text-brand-cream">
                <tr>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Team</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Games</th>
                  {DISPLAY_STATS.map((stat) => (
                    <th key={stat.key} className="px-3 py-2 text-center font-bold uppercase tracking-wide" colSpan={2}>
                      {stat.label}
                    </th>
                  ))}
                </tr>
                <tr className="bg-brand-dark/60 text-brand-creamDark">
                  <th className="px-3 py-1" />
                  <th className="px-3 py-1" />
                  {DISPLAY_STATS.map((stat) => (
                    <Fragment key={stat.key}>
                      <th className="px-3 py-1 text-center font-semibold">For</th>
                      <th className="px-3 py-1 text-center font-semibold">Against</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((team, index) => (
                  <tr key={team.teamAbbrev} className={index % 2 === 0 ? "bg-brand-dark/40" : "bg-brand-dark/20"}>
                    <td className="px-3 py-2 font-semibold">{team.teamAbbrev}</td>
                    <td className="px-3 py-2 text-brand-creamDark">{team.gamesPlayed}</td>
                    {DISPLAY_STATS.map((stat) => (
                      <Fragment key={stat.key}>
                        <td className={`px-3 py-2 text-center ${factorClass(team.createdFactor[stat.key])}`}>{team.createdFactor[stat.key].toFixed(2)}</td>
                        <td className={`px-3 py-2 text-center ${factorClass(team.concededFactor[stat.key])}`}>{team.concededFactor[stat.key].toFixed(2)}</td>
                      </Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && teams.length === 0 ? (
          <p className="mt-4 text-sm text-brand-creamDark">No data yet -- run the match stats backfill on /admin/upload first.</p>
        ) : null}
      </div>
    </div>
  );
}
