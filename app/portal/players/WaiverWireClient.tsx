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

const SEASON = "2025-26";

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
  G: "bg-brand-green",
  D: "bg-brand-greenDark",
  M: "bg-[#1e3325]",
  F: "bg-[#27412d]",
};

export default function WaiverWireClient({ leagueRoster }: { leagueRoster: LeagueRosterData | null }) {
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
        .eq("season", SEASON)
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
  }, [supabase]);

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
        .eq("season", SEASON)
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
  }, [selectedGw, supabase]);

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
      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Gameweek</span>
            <select
              value={selectedGw ?? ""}
              onChange={(event) => setSelectedGw(Number.parseInt(event.target.value, 10))}
              className="min-w-32 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1.5 text-sm text-brand-cream focus:border-brand-green focus:outline-none"
              disabled={loadingGameweeks || gameweeks.length === 0}
            >
              {gameweeks.map((gw) => (
                <option key={gw} value={gw}>
                  GW {gw}
                </option>
              ))}
            </select>
            {formationLabel ? <p className="text-xs text-brand-creamDark">{formationLabel}</p> : null}
          </label>

          {leagueRoster ? (
            <div className="space-y-1 text-xs">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Availability</span>
              <div className="flex gap-1">
                {(["All", "Available", "Taken"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAvailabilityFilter(option)}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                      availabilityFilter === option
                        ? "border-brand-green bg-brand-green text-brand-cream"
                        : "border-brand-cream/35 bg-brand-dark text-brand-cream"
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
        <div className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      {loadingGameweeks || loadingRows ? (
        <div className="rounded-xl border border-brand-cream/20 bg-brand-dark/70 px-4 py-6 text-sm text-brand-creamDark">
          Loading Waiver Wire XI...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm text-brand-cream">
            <thead>
              <tr className="bg-brand-dark text-brand-creamDark">
                <th className="border-b border-r border-brand-cream/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide">Name</th>
                <th className="border-b border-r border-brand-cream/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide">Team</th>
                <th className="border-b border-r border-brand-cream/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide">Position</th>
                <th className="border-b border-r border-brand-cream/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide">Ownership %</th>
                <th className="border-b border-brand-cream/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr key={`${row.id}-${index}`} className={index % 2 === 0 ? "bg-brand-dark/65" : "bg-brand-dark/85"}>
                  <td className="border-b border-r border-brand-cream/10 px-4 py-3 font-semibold">
                    <div className="flex flex-wrap items-center gap-1">
                      <Link href={`/portal/players/${row.id}`} className="hover:text-brand-green hover:underline">
                        {row.name}
                      </Link>
                      <RosterPill playerId={row.id} leagueRoster={leagueRoster} />
                    </div>
                  </td>
                  <td className="border-b border-r border-brand-cream/10 px-4 py-3">{row.team}</td>
                  <td className="border-b border-r border-brand-cream/10 px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold text-brand-cream ${positionBadgeClass[row.position]}`}>
                      {row.position}
                    </span>
                  </td>
                  <td className="border-b border-r border-brand-cream/10 px-4 py-3">{row.ownershipPct.toFixed(1)}%</td>
                  <td className="border-b border-brand-cream/10 px-4 py-3 text-right font-semibold">{row.rawFantraxPts.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="bg-brand-green/20">
                <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-brand-creamDark">
                  Total Points
                </td>
                <td className="px-4 py-3 text-right text-sm font-black text-brand-cream">{totalPoints.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
