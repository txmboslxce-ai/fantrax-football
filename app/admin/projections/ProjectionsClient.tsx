"use client";

import { useState } from "react";

type ProjectedStatLine = {
  goals: number;
  assists: number;
  clean_sheet: number;
  key_passes: number;
  shots_on_target: number;
  tackles_won: number;
  interceptions: number;
  clearances: number;
  dribbles_succeeded: number;
  blocked_shots: number;
  accurate_crosses: number;
  penalties_drawn: number;
  aerials_won: number;
  dispossessed: number;
  yellow_cards: number;
  red_cards: number;
  penalties_missed: number;
  own_goals: number;
  saves: number;
  penalty_saves: number;
  high_claims: number;
  smothers: number;
  expected_goals_against_team: number;
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

const CSV_COLUMNS: Array<{ header: string; value: (row: ProjectionRow) => string | number }> = [
  { header: "player", value: (row) => row.players?.name ?? row.player_id },
  { header: "team", value: (row) => row.players?.team ?? "" },
  { header: "position", value: (row) => row.players?.position ?? "" },
  { header: "opponent", value: (row) => row.opponent_abbrev },
  { header: "home_or_away", value: (row) => (row.is_home ? "H" : "A") },
  { header: "expected_minutes", value: (row) => row.expected_minutes },
  { header: "projected_score", value: (row) => row.projected_score },
  { header: "goals", value: (row) => row.stat_line.goals },
  { header: "assists", value: (row) => row.stat_line.assists },
  { header: "clean_sheet_probability", value: (row) => row.stat_line.clean_sheet },
  { header: "key_passes", value: (row) => row.stat_line.key_passes },
  { header: "shots_on_target", value: (row) => row.stat_line.shots_on_target },
  { header: "tackles_won", value: (row) => row.stat_line.tackles_won },
  { header: "interceptions", value: (row) => row.stat_line.interceptions },
  { header: "clearances", value: (row) => row.stat_line.clearances },
  { header: "dribbles_succeeded", value: (row) => row.stat_line.dribbles_succeeded },
  { header: "blocked_shots", value: (row) => row.stat_line.blocked_shots },
  { header: "accurate_crosses", value: (row) => row.stat_line.accurate_crosses },
  { header: "penalties_drawn", value: (row) => row.stat_line.penalties_drawn },
  { header: "aerials_won", value: (row) => row.stat_line.aerials_won },
  { header: "dispossessed", value: (row) => row.stat_line.dispossessed },
  { header: "yellow_cards", value: (row) => row.stat_line.yellow_cards },
  { header: "red_cards", value: (row) => row.stat_line.red_cards },
  { header: "penalties_missed", value: (row) => row.stat_line.penalties_missed },
  { header: "own_goals", value: (row) => row.stat_line.own_goals },
  { header: "saves", value: (row) => row.stat_line.saves },
  { header: "penalty_saves", value: (row) => row.stat_line.penalty_saves },
  { header: "high_claims", value: (row) => row.stat_line.high_claims },
  { header: "smothers", value: (row) => row.stat_line.smothers },
  { header: "expected_goals_against_team", value: (row) => row.stat_line.expected_goals_against_team },
  { header: "computed_at", value: (row) => row.computed_at },
];

function csvEscape(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function projectionsToCsv(rows: ProjectionRow[]): string {
  const header = CSV_COLUMNS.map((column) => column.header).join(",");
  const lines = rows.map((row) => CSV_COLUMNS.map((column) => csvEscape(column.value(row))).join(","));
  return [header, ...lines].join("\n");
}

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

  function handleExportCsv() {
    const csv = projectionsToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `projections-gw${gameweek}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            className="rounded border border-brand-cream/35 px-4 py-2 text-sm font-semibold text-brand-creamDark transition-colors hover:bg-brand-greenDark disabled:opacity-60"
          >
            Export CSV
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
