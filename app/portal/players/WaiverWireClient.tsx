"use client";

import { createClient } from "@/lib/supabase";
import type { LeagueRosterData } from "@/lib/portal/leagueRoster";
import Link from "next/link";
import RosterPill from "@/app/components/ui/RosterPill";
import { useEffect, useMemo, useState } from "react";

type WaiverRow = {
  id: string;
  name: string;
  team: string;
  position: "G" | "D" | "M" | "F";
  ownershipPct: number;
  rawFantraxPts: number;
};

type PlayerGameweekJoinRow = {
  raw_fantrax_pts: number | string | null;
  players:
    | {
        id: string;
        name: string;
        team: string;
        position: string;
        ownership_pct: string | null;
      }
    | Array<{
        id: string;
        name: string;
        team: string;
        position: string;
        ownership_pct: string | null;
      }>
    | null;
};

function parseOwnership(value: string | null): number {
  if (!value) {
    return 0;
  }

  const numeric = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

function toPoints(value: number | string | null): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isPosition(value: string): value is "G" | "D" | "M" | "F" {
  return value === "G" || value === "D" || value === "M" || value === "F";
}

function buildWaiverXI(rows: WaiverRow[]): { lineup: WaiverRow[]; formation: string | null } {
  const sorted = [...rows].sort((a, b) => b.rawFantraxPts - a.rawFantraxPts);
  const byPosition = {
    G: sorted.filter((row) => row.position === "G").slice(0, 1),
    D: sorted.filter((row) => row.position === "D").slice(0, 5),
    M: sorted.filter((row) => row.position === "M").slice(0, 5),
    F: sorted.filter((row) => row.position === "F").slice(0, 3),
  };

  const validFormations = [
    { def: 3, mid: 4, fwd: 3 },
    { def: 3, mid: 5, fwd: 2 },
    { def: 4, mid: 3, fwd: 3 },
    { def: 4, mid: 4, fwd: 2 },
    { def: 4, mid: 5, fwd: 1 },
    { def: 5, mid: 3, fwd: 2 },
    { def: 5, mid: 4, fwd: 1 },
  ] as const;

  let best:
    | {
        lineup: WaiverRow[];
        formation: string;
        totalPoints: number;
      }
    | null = null;

  for (const formation of validFormations) {
    if (
      byPosition.G.length < 1 ||
      byPosition.D.length < formation.def ||
      byPosition.M.length < formation.mid ||
      byPosition.F.length < formation.fwd
    ) {
      continue;
    }

    const lineup = [
      ...byPosition.G.slice(0, 1),
      ...byPosition.D.slice(0, formation.def),
      ...byPosition.M.slice(0, formation.mid),
      ...byPosition.F.slice(0, formation.fwd),
    ];
    const totalPoints = lineup.reduce((sum, row) => sum + row.rawFantraxPts, 0);

    if (!best || totalPoints > best.totalPoints) {
      best = {
        lineup,
        formation: `${formation.def}-${formation.mid}-${formation.fwd}`,
        totalPoints,
      };
    }
  }

  const orderedLineup = (best?.lineup ?? [...byPosition.G, ...byPosition.D, ...byPosition.M, ...byPosition.F])
    .sort((a, b) => {
      const posOrder = { G: 1, D: 2, M: 3, F: 4 };
      if (posOrder[a.position] !== posOrder[b.position]) {
        return posOrder[a.position] - posOrder[b.position];
      }
      return b.rawFantraxPts - a.rawFantraxPts;
    })
    .slice(0, 11);

  return {
    lineup: orderedLineup,
    formation: best?.formation ?? null,
  };
}

const positionBadgeClass: Record<WaiverRow["position"], string> = {
  G: "bg-amber-100 text-amber-900",
  D: "bg-emerald-200 text-emerald-950",
  M: "bg-violet-200 text-violet-950",
  F: "bg-orange-200 text-orange-950",
};

export default function WaiverWireClient({
  leagueRoster,
  season,
}: {
  leagueRoster: LeagueRosterData | null;
  season: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [gameweeks, setGameweeks] = useState<number[]>([]);
  const [selectedGw, setSelectedGw] = useState<number | null>(null);
  const [rows, setRows] = useState<WaiverRow[]>([]);
  const [formationLabel, setFormationLabel] = useState<string | null>(null);
  const [loadingGameweeks, setLoadingGameweeks] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [availabilityFilter, setAvailabilityFilter] = useState<"All" | "Available" | "Taken">("All");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadGameweeks() {
      setLoadingGameweeks(true);
      setError(null);

      const { data, error: gwError } = await supabase
        .from("player_gameweeks")
        .select("gameweek")
        .eq("season", season)
        .order("gameweek", { ascending: false });

      if (!alive) {
        return;
      }

      if (gwError) {
        setError(`Unable to load gameweeks: ${gwError.message}`);
        setGameweeks([]);
        setSelectedGw(null);
        setLoadingGameweeks(false);
        return;
      }

      const distinct = Array.from(new Set((data ?? []).map((row) => Number(row.gameweek ?? 0)).filter((gw) => gw > 0))).sort(
        (a, b) => b - a
      );
      setGameweeks(distinct);
      setSelectedGw((prev) => (prev && distinct.includes(prev) ? prev : (distinct[0] ?? null)));
      setLoadingGameweeks(false);
    }

    void loadGameweeks();

    return () => {
      alive = false;
    };
  }, [supabase, season]);

  useEffect(() => {
    let alive = true;

    async function loadRows() {
      if (!selectedGw) {
        setRows([]);
        setFormationLabel(null);
        return;
      }

      setLoadingRows(true);
      setError(null);

      const { data, error: rowsError } = await supabase
        .from("player_gameweeks")
        .select("raw_fantrax_pts, players!inner(id, name, team, position, ownership_pct)")
        .eq("season", season)
        .eq("gameweek", selectedGw)
        .gt("games_played", 0);

      if (!alive) {
        return;
      }

      if (rowsError) {
        setError(`Unable to load waiver wire data: ${rowsError.message}`);
        setRows([]);
        setFormationLabel(null);
        setLoadingRows(false);
        return;
      }

      const eligible: WaiverRow[] = ((data ?? []) as PlayerGameweekJoinRow[])
        .map((row) => {
          const player = Array.isArray(row.players) ? row.players[0] : row.players;
          if (!player || !isPosition(player.position)) {
            return null;
          }

          const ownershipPct = parseOwnership(player.ownership_pct);
          if (ownershipPct > 50) {
            return null;
          }

          return {
            id: player.id,
            name: player.name,
            team: player.team,
            position: player.position,
            ownershipPct,
            rawFantraxPts: toPoints(row.raw_fantrax_pts),
          };
        })
        .filter((row): row is WaiverRow => row !== null);

      const bestXi = buildWaiverXI(eligible);
      setRows(bestXi.lineup);
      setFormationLabel(bestXi.formation ? `Best XI — ${bestXi.formation}` : null);
      setLoadingRows(false);
    }

    void loadRows();

    return () => {
      alive = false;
    };
  }, [selectedGw, supabase, season]);

  const filteredRows = useMemo(() => {
    if (availabilityFilter === "All" || !leagueRoster) return rows;
    return rows.filter((row) => {
      const isTaken = Boolean(leagueRoster.teamByPlayerId[row.id]);
      return availabilityFilter === "Taken" ? isTaken : !isTaken;
    });
  }, [rows, availabilityFilter, leagueRoster]);

  const totalPoints = filteredRows.reduce((sum, row) => sum + row.rawFantraxPts, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-stretch gap-3">
          <label className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-xs">
            <span className="block font-semibold uppercase tracking-wide text-slate-600">Gameweek</span>
            <select
              value={selectedGw ?? ""}
              onChange={(event) => setSelectedGw(Number.parseInt(event.target.value, 10))}
              className="min-w-32 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-brand-dark focus:border-brand-green focus:outline-none"
              disabled={loadingGameweeks || gameweeks.length === 0}
            >
              {gameweeks.map((gw) => (
                <option key={gw} value={gw}>
                  GW {gw}
                </option>
              ))}
            </select>
            {formationLabel ? <p className="text-xs text-slate-500">{formationLabel}</p> : null}
            <p className="max-w-72 text-xs leading-snug text-slate-500">
              Players are eligible at 50% ownership or lower; the availability filter only changes which rows of this XI are shown.
            </p>
          </label>

          {leagueRoster ? (
            <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-xs">
              <span className="block font-semibold uppercase tracking-wide text-slate-600">Availability</span>
              <div className="flex gap-1">
                {(["All", "Available", "Taken"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAvailabilityFilter(option)}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                      availabilityFilter === option
                        ? "border-brand-green bg-brand-green text-brand-cream"
                        : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {loadingGameweeks || loadingRows ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Loading Waiver Wire XI...
        </div>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <div className="max-h-[75vh] w-max overflow-y-auto rounded-lg border border-slate-200 bg-white [scrollbar-gutter:stable]">
          <table className="border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="bg-brand-green text-brand-cream">
                <th className="sticky top-0 z-20 w-64 min-w-64 border-b border-r border-brand-cream/25 bg-brand-green px-4 py-3 text-xs font-semibold uppercase tracking-wide">Name</th>
                <th className="sticky top-0 z-20 w-20 min-w-20 border-b border-r border-brand-cream/25 bg-brand-green px-4 py-3 text-xs font-semibold uppercase tracking-wide">Team</th>
                <th className="sticky top-0 z-20 w-20 min-w-20 border-b border-r border-brand-cream/25 bg-brand-green px-4 py-3 text-xs font-semibold uppercase tracking-wide">Position</th>
                <th className="sticky top-0 z-20 w-28 min-w-28 border-b border-r border-brand-cream/25 bg-brand-green px-4 py-3 text-xs font-semibold uppercase tracking-wide">Ownership %</th>
                <th className="sticky top-0 z-20 w-20 min-w-20 border-b border-brand-cream/25 bg-brand-green px-4 py-3 text-xs font-semibold uppercase tracking-wide text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr key={`${row.id}-${index}`} className={`group ${index % 2 === 0 ? "bg-white" : "bg-slate-50"} text-brand-dark transition-colors hover:bg-brand-green/10`}>
                  <td className="w-64 min-w-64 border-b border-r border-slate-200 px-4 py-3 font-semibold">
                    <div className="flex flex-wrap items-center gap-1">
                      <Link href={`/portal/players/${row.id}`} prefetch={false} className="hover:text-brand-green hover:underline">
                        {row.name}
                      </Link>
                      <RosterPill playerId={row.id} leagueRoster={leagueRoster} />
                    </div>
                  </td>
                  <td className="w-20 min-w-20 border-b border-r border-slate-200 px-4 py-3">{row.team}</td>
                  <td className="w-20 min-w-20 border-b border-r border-slate-200 px-4 py-3">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${positionBadgeClass[row.position]}`}>
                      {row.position}
                    </span>
                  </td>
                  <td className="w-28 min-w-28 border-b border-r border-slate-200 px-4 py-3 tabular-nums">{row.ownershipPct.toFixed(1)}%</td>
                  <td className="w-20 min-w-20 border-b border-slate-200 px-4 py-3 text-right font-semibold tabular-nums">{row.rawFantraxPts.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="bg-brand-green/10 text-brand-dark">
                <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-600">
                  Total Points
                </td>
                <td className="px-4 py-3 text-right text-sm font-black tabular-nums text-brand-dark">{totalPoints.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
