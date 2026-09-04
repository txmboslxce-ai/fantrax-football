"use client";

import { useState } from "react";

type ProjectedStatLine = {
  goals: number;
  assists: number;
  clean_sheet: number;
  key_passes: number;
  shots_on_target: number;
  tackles_won: number;
};

type ProjectionRow = {
  player_id: string;
  opponent_abbrev: string;
  is_home: boolean;
  expected_minutes: number;
  projected_score: number;
  stat_line: ProjectedStatLine;
  computed_at: string;
  players: { name: string; team: string; position: string } | null;
};

export default function ProjectionsClient() {
  const [gameweek, setGameweek] = useState(2);
  const [computing, setComputing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<ProjectionRow[]>([]);

  async function loadProjections(gw: number) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/projections?gameweek=${gw}`);
      const body = (await response.json().catch(() => ({}))) as { projections?: ProjectionRow[]; message?: string };
      if (!response.ok) throw new Error(body.message ?? `Failed to load (${response.status})`);
      setRows(body.projections ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load projections");
    } finally {
      setLoading(false);
    }
  }

  async function handleCompute() {
    setComputing(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/projections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameweek }),
      });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; count?: number; message?: string };
      if (!response.ok) throw new Error(body.message ?? `Failed to compute (${response.status})`);
      setMessage(`Computed and saved projections for ${body.count ?? 0} players.`);
      await loadProjections(gameweek);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to compute projections");
    } finally {
      setComputing(false);
    }
  }

  return (
    <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-black sm:text-4xl">Player Projections</h1>
        <p className="mt-2 text-sm text-brand-creamDark">
          Full stat-line projections assembled from team strength ratings and player shot profiles, run through the real
          scoring formula. Expected minutes uses average minutes when played this season -- there&apos;s no start-probability
          model yet, so a rotation-risk player&apos;s number assumes they play their usual minutes if selected.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-semibold uppercase tracking-wide text-brand-creamDark">Gameweek</span>
            <input
              type="number"
              min={1}
              max={38}
              value={gameweek}
              onChange={(event) => setGameweek(Number.parseInt(event.target.value, 10) || 1)}
              className="w-20 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1.5 text-brand-cream focus:border-brand-green focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleCompute()}
            disabled={computing}
            className="rounded bg-brand-green px-4 py-2 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60"
          >
            {computing ? "Computing..." : "Compute & Save Projections"}
          </button>
          <button
            type="button"
            onClick={() => void loadProjections(gameweek)}
            disabled={loading}
            className="rounded border border-brand-cream/35 px-4 py-2 text-sm font-semibold text-brand-creamDark transition-colors hover:bg-brand-greenDark disabled:opacity-60"
          >
            {loading ? "Loading..." : "Load Saved Projections"}
          </button>
        </div>

        {message ? <p className="mt-3 text-sm text-emerald-300">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

        {rows.length > 0 ? (
          <div className="mt-6 overflow-x-auto rounded-lg border border-brand-cream/20">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-brand-green text-brand-cream">
                <tr>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Player</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Team</th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Opponent</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Exp. Mins</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Goals</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Assists</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Clean Sheet %</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Key Passes</th>
                  <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Proj. Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.player_id} className={index % 2 === 0 ? "bg-brand-dark/40" : "bg-brand-dark/20"}>
                    <td className="px-3 py-2 font-semibold">{row.players?.name ?? row.player_id}</td>
                    <td className="px-3 py-2 text-brand-creamDark">
                      {row.players?.team} <span className="text-brand-creamDark/70">({row.players?.position})</span>
                    </td>
                    <td className="px-3 py-2 text-brand-creamDark">
                      {row.is_home ? "vs" : "@"} {row.opponent_abbrev}
                    </td>
                    <td className="px-3 py-2 text-right text-brand-creamDark">{row.expected_minutes}</td>
                    <td className="px-3 py-2 text-right text-brand-creamDark">{row.stat_line.goals.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-brand-creamDark">{row.stat_line.assists.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-brand-creamDark">{(row.stat_line.clean_sheet * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right text-brand-creamDark">{row.stat_line.key_passes.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-base font-bold text-emerald-300">{row.projected_score.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading && !computing ? (
          <p className="mt-6 text-sm text-brand-creamDark">No projections saved for this gameweek yet -- compute them above.</p>
        ) : null}
      </div>
    </div>
  );
}
