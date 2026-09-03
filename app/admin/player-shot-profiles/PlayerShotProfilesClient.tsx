"use client";

import { useEffect, useState } from "react";

type PlayerShotProfile = {
  fantraxId: string;
  playerName: string;
  team: string;
  position: string;
  matchesWithShotData: number;
  minutesPlayed: number;
  totalShots: number;
  totalGoals: number;
  totalAssists: number;
  totalXg: number;
  shotsPer90: number;
  xgPerShot: number;
  xgPer90: number;
  finishingFactor: number;
  projectedGoalRatePer90: number;
};

function finishingClass(factor: number): string {
  if (factor >= 1.2) return "text-emerald-300 font-semibold";
  if (factor <= 0.8) return "text-red-300 font-semibold";
  return "text-brand-creamDark";
}

export default function PlayerShotProfilesClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<PlayerShotProfile[]>([]);
  const [unmappedCount, setUnmappedCount] = useState(0);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/player-shot-profiles");
        const body = (await response.json().catch(() => ({}))) as { profiles?: PlayerShotProfile[]; unmappedBsdPlayerIds?: number[]; message?: string };
        if (!response.ok) throw new Error(body.message ?? `Failed to load (${response.status})`);
        if (alive) {
          setProfiles(body.profiles ?? []);
          setUnmappedCount(body.unmappedBsdPlayerIds?.length ?? 0);
        }
      } catch (err: unknown) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load player shot profiles");
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
        <h1 className="text-3xl font-black sm:text-4xl">Player Shot Profiles</h1>
        <p className="mt-2 text-sm text-brand-creamDark">
          Shot volume and quality from backfilled BSD match data. Finishing factor is goals per xG, regressed toward 1.00 --
          above 1 means outscoring their chance quality (likely to cool off), below 1 means underperforming it (likely to pick
          up). Projected Goal Rate/90 = xG/90 &times; finishing factor, the input Phase 4 combines with an opponent&apos;s
          defensive factor.
        </p>
        {unmappedCount > 0 ? (
          <p className="mt-2 text-xs text-amber-300">{unmappedCount} BSD player id(s) with shot data aren&apos;t linked to a Fantrax player yet -- see BSD Player Mapping.</p>
        ) : null}

        {loading ? <p className="mt-6 text-sm text-brand-creamDark">Loading...</p> : null}
        {error ? <p className="mt-6 text-sm text-red-300">{error}</p> : null}

        {!loading && !error ? (
          <div className="mt-6 overflow-x-auto rounded-lg border border-brand-cream/20">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-brand-green text-brand-cream">
                <tr>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Player</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Team</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Mins</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Shots</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Goals</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">xG</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Shots/90</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">xG/Shot</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">xG/90</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Finishing</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Proj. Goals/90</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((player, index) => (
                  <tr key={player.fantraxId} className={index % 2 === 0 ? "bg-brand-dark/40" : "bg-brand-dark/20"}>
                    <td className="px-3 py-2 font-semibold">{player.playerName}</td>
                    <td className="px-3 py-2 text-brand-creamDark">
                      {player.team} <span className="text-brand-creamDark/70">({player.position})</span>
                    </td>
                    <td className="px-3 py-2 text-right text-brand-creamDark">{player.minutesPlayed}</td>
                    <td className="px-3 py-2 text-right text-brand-creamDark">{player.totalShots}</td>
                    <td className="px-3 py-2 text-right text-brand-creamDark">{player.totalGoals}</td>
                    <td className="px-3 py-2 text-right text-brand-creamDark">{player.totalXg.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-brand-creamDark">{player.shotsPer90.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-brand-creamDark">{player.xgPerShot.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right text-brand-creamDark">{player.xgPer90.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right ${finishingClass(player.finishingFactor)}`}>{player.finishingFactor.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{player.projectedGoalRatePer90.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && profiles.length === 0 ? (
          <p className="mt-4 text-sm text-brand-creamDark">No data yet -- run the match stats backfill on /admin/upload first.</p>
        ) : null}
      </div>
    </div>
  );
}
