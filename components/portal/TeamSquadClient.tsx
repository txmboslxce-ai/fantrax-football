"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import RosterPill from "@/app/components/ui/RosterPill";
import type { LeagueRosterData } from "@/lib/portal/leagueRoster";

type SquadRow = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  seasonPts: number;
  fantasyPtsPerStart: number;
  ghostPtsPerStart: number;
  goals: number;
  assists: number;
  keyPasses: number;
  shotsOnTarget: number;
  cornerKicks: number;
  freeKickShots: number;
  ownershipPct: number;
};

type SortKey =
  | "name"
  | "position"
  | "seasonPts"
  | "fantasyPtsPerStart"
  | "ghostPtsPerStart"
  | "goals"
  | "assists"
  | "keyPasses"
  | "shotsOnTarget"
  | "cornerKicks"
  | "freeKickShots"
  | "ownershipPct";

const positionFilters: Array<"All" | "GK" | "DEF" | "MID" | "FWD"> = ["All", "GK", "DEF", "MID", "FWD"];

export default function TeamSquadClient({ players, leagueRoster }: { players: SquadRow[]; leagueRoster: LeagueRosterData | null }) {
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<(typeof positionFilters)[number]>("All");
  const [sortKey, setSortKey] = useState<SortKey>("seasonPts");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filteredAndSorted = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const filtered = players.filter((player) => {
      const matchesPosition = positionFilter === "All" || player.position === positionFilter;
      const matchesSearch = !normalizedSearch || player.name.toLowerCase().includes(normalizedSearch);
      return matchesPosition && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDir === "asc" ? aValue - bValue : bValue - aValue;
      }

      const comparison = String(aValue).localeCompare(String(bValue));
      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [players, positionFilter, search, sortDir, sortKey]);

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    if (nextKey === "name" || nextKey === "position") {
      setSortDir("asc");
      return;
    }
    setSortDir("desc");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
            <span className="block font-semibold uppercase tracking-wide text-slate-500">Position</span>
            <div className="flex flex-nowrap gap-1">
              {positionFilters.map((filter) => {
                const active = positionFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setPositionFilter(filter)}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold transition-colors ${
                      active
                        ? "border-brand-green bg-brand-green text-brand-cream"
                        : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                    }`}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search player"
            className="ml-auto w-full max-w-sm rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-brand-dark placeholder:text-slate-400 focus:border-brand-green focus:outline-none"
          />
        </div>
      </div>

      <div className="max-w-full overflow-x-auto">
        <div className="max-h-[75vh] w-max overflow-y-auto rounded-lg border border-slate-200 bg-white [scrollbar-gutter:stable]">
          <table className="border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr>
              <th className="sticky top-0 z-20 w-48 min-w-48 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("name")} className="font-bold">
                  Name
                </button>
              </th>
              <th className="sticky top-0 z-20 w-16 min-w-16 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("position")} className="font-bold">
                  Position
                </button>
              </th>
              <th className="sticky top-0 z-20 w-[88px] min-w-[88px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("seasonPts")} className="w-full text-right font-bold">
                  Season Pts
                </button>
              </th>
              <th className="sticky top-0 z-20 w-[88px] min-w-[88px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("fantasyPtsPerStart")} className="w-full text-right font-bold">
                  FPts/S
                </button>
              </th>
              <th className="sticky top-0 z-20 w-[88px] min-w-[88px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("ghostPtsPerStart")} className="w-full text-right font-bold">
                  GhPts/S
                </button>
              </th>
              <th className="sticky top-0 z-20 w-[88px] min-w-[88px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("goals")} className="w-full text-right font-bold">
                  Goals
                </button>
              </th>
              <th className="sticky top-0 z-20 w-[88px] min-w-[88px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("assists")} className="w-full text-right font-bold">
                  Assists
                </button>
              </th>
              <th className="sticky top-0 z-20 w-[88px] min-w-[88px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("keyPasses")} className="w-full text-right font-bold">
                  Key Passes
                </button>
              </th>
              <th className="sticky top-0 z-20 w-[88px] min-w-[88px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("shotsOnTarget")} className="w-full text-right font-bold">
                  SOT
                </button>
              </th>
              <th className="sticky top-0 z-20 w-[88px] min-w-[88px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("cornerKicks")} className="w-full text-right font-bold">
                  Corners
                </button>
              </th>
              <th className="sticky top-0 z-20 w-[88px] min-w-[88px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("freeKickShots")} className="w-full text-right font-bold">
                  FK Shots
                </button>
              </th>
              <th className="sticky top-0 z-20 w-[88px] min-w-[88px] border-b border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("ownershipPct")} className="w-full text-right font-bold">
                  Ownership %
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((player, index) => {
              const rowHref = `/portal/players/${player.id}`;
              const rowShade = index % 2 === 0 ? "bg-white" : "bg-slate-50";
              return (
                <tr
                  key={player.id}
                  className={`group ${rowShade} text-brand-dark transition-colors hover:bg-brand-green/10`}
                >
                  <td className="w-48 min-w-48 border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-brand-dark">
                    <div className="flex items-center gap-1">
                      <Link href={rowHref} prefetch={false} className="hover:text-brand-green hover:underline">
                        {player.name}
                      </Link>
                      <RosterPill playerId={player.id} leagueRoster={leagueRoster} />
                    </div>
                  </td>
                  <td className="w-16 min-w-16 border-b border-r border-slate-200 px-2 py-1.5 font-medium text-slate-600">
                    <Link href={rowHref} prefetch={false} className="block hover:text-brand-green hover:underline">
                      {player.position}
                    </Link>
                  </td>
                  <td className="w-[88px] min-w-[88px] border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                    <Link href={rowHref} prefetch={false} className="block hover:text-brand-green">
                      {player.seasonPts.toFixed(2)}
                    </Link>
                  </td>
                  <td className="w-[88px] min-w-[88px] border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                    <Link href={rowHref} prefetch={false} className="block hover:text-brand-green">
                      {player.fantasyPtsPerStart.toFixed(2)}
                    </Link>
                  </td>
                  <td className="w-[88px] min-w-[88px] border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                    <Link href={rowHref} prefetch={false} className="block hover:text-brand-green">
                      {player.ghostPtsPerStart.toFixed(2)}
                    </Link>
                  </td>
                  <td className="w-[88px] min-w-[88px] border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                    <Link href={rowHref} prefetch={false} className="block hover:text-brand-green">
                      {player.goals.toFixed(0)}
                    </Link>
                  </td>
                  <td className="w-[88px] min-w-[88px] border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                    <Link href={rowHref} prefetch={false} className="block hover:text-brand-green">
                      {player.assists.toFixed(0)}
                    </Link>
                  </td>
                  <td className="w-[88px] min-w-[88px] border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                    <Link href={rowHref} prefetch={false} className="block hover:text-brand-green">
                      {player.keyPasses.toFixed(0)}
                    </Link>
                  </td>
                  <td className="w-[88px] min-w-[88px] border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                    <Link href={rowHref} prefetch={false} className="block hover:text-brand-green">
                      {player.shotsOnTarget.toFixed(0)}
                    </Link>
                  </td>
                  <td className="w-[88px] min-w-[88px] border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                    <Link href={rowHref} prefetch={false} className="block hover:text-brand-green">
                      {player.cornerKicks.toFixed(0)}
                    </Link>
                  </td>
                  <td className="w-[88px] min-w-[88px] border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                    <Link href={rowHref} prefetch={false} className="block hover:text-brand-green">
                      {player.freeKickShots.toFixed(0)}
                    </Link>
                  </td>
                  <td className="w-[88px] min-w-[88px] border-b border-r border-slate-200 px-2 py-1.5 text-right font-medium tabular-nums text-slate-600">
                    <Link href={rowHref} prefetch={false} className="block hover:text-brand-green">
                      {player.ownershipPct.toFixed(1)}%
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
