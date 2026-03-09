"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";

type PlayerRow = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  seasonPts: number;
  avgPtsPerGw: number;
  ghostPtsPerGw: number;
  ownershipPct: number;
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
};

type SortKey = "name" | "seasonPts" | "avgPtsPerGw" | "ghostPtsPerGw";

type PlayersTableClientProps = {
  players: PlayerRow[];
};

const positionFilters: Array<"All" | "GK" | "DEF" | "MID" | "FWD"> = ["All", "GK", "DEF", "MID", "FWD"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mixColor(a: [number, number, number], b: [number, number, number], ratio: number): string {
  const safeRatio = clamp(ratio, 0, 1);
  const r = Math.round(a[0] + (b[0] - a[0]) * safeRatio);
  const g = Math.round(a[1] + (b[1] - a[1]) * safeRatio);
  const blue = Math.round(a[2] + (b[2] - a[2]) * safeRatio);
  return `rgb(${r}, ${g}, ${blue})`;
}

function pointsBadgeBackground(value: number, min: number, max: number): string {
  const red: [number, number, number] = [239, 68, 68];
  const yellow: [number, number, number] = [234, 179, 8];
  const green: [number, number, number] = [42, 122, 59];

  if (max <= min) {
    return "rgb(234, 179, 8)";
  }

  const normalized = clamp((value - min) / (max - min), 0, 1);
  if (normalized <= 0.5) {
    return mixColor(red, yellow, normalized * 2);
  }

  return mixColor(yellow, green, (normalized - 0.5) * 2);
}

export default function PlayersTableClient({ players }: PlayersTableClientProps) {
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<(typeof positionFilters)[number]>("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [ownershipMin, setOwnershipMin] = useState("0");
  const [ownershipMax, setOwnershipMax] = useState("100");
  const [sortKey, setSortKey] = useState<SortKey>("seasonPts");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const teams = useMemo(() => {
    return [...new Set(players.map((player) => player.team))].sort((a, b) => a.localeCompare(b));
  }, [players]);

  const filteredAndSorted = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const parsedOwnershipMin = Number(ownershipMin);
    const parsedOwnershipMax = Number(ownershipMax);
    const safeOwnershipMin = Number.isFinite(parsedOwnershipMin) ? parsedOwnershipMin : 0;
    const safeOwnershipMax = Number.isFinite(parsedOwnershipMax) ? parsedOwnershipMax : 100;
    const lowerOwnershipBound = Math.max(0, Math.min(safeOwnershipMin, safeOwnershipMax));
    const upperOwnershipBound = Math.min(100, Math.max(safeOwnershipMin, safeOwnershipMax));

    const filtered = players.filter((player) => {
      const matchesPosition = positionFilter === "All" || player.position === positionFilter;
      const matchesTeam = teamFilter === "All" || player.team === teamFilter;
      const matchesSearch = !normalizedSearch || player.name.toLowerCase().includes(normalizedSearch);
      const matchesOwnership = player.ownershipPct >= lowerOwnershipBound && player.ownershipPct <= upperOwnershipBound;
      return matchesPosition && matchesTeam && matchesSearch && matchesOwnership;
    });

    const sorted = [...filtered].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDir === "asc" ? aValue - bValue : bValue - aValue;
      }

      const comparison = String(aValue).localeCompare(String(bValue));
      return sortDir === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [ownershipMax, ownershipMin, players, positionFilter, search, sortDir, sortKey, teamFilter]);

  const visibleRanges = useMemo(() => {
    if (filteredAndSorted.length === 0) {
      return {
        seasonPts: { min: 0, max: 0 },
        avgPtsPerGw: { min: 0, max: 0 },
        ghostPtsPerGw: { min: 0, max: 0 },
      };
    }

    return {
      seasonPts: {
        min: Math.min(...filteredAndSorted.map((player) => player.seasonPts)),
        max: Math.max(...filteredAndSorted.map((player) => player.seasonPts)),
      },
      avgPtsPerGw: {
        min: Math.min(...filteredAndSorted.map((player) => player.avgPtsPerGw)),
        max: Math.max(...filteredAndSorted.map((player) => player.avgPtsPerGw)),
      },
      ghostPtsPerGw: {
        min: Math.min(...filteredAndSorted.map((player) => player.ghostPtsPerGw)),
        max: Math.max(...filteredAndSorted.map((player) => player.ghostPtsPerGw)),
      },
    };
  }, [filteredAndSorted]);

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    if (nextKey === "name") {
      setSortDir("asc");
      return;
    }

    setSortDir("desc");
  }

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕");

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-3 py-2">
        <div className="overflow-x-auto">
          <div className="flex min-w-max items-end gap-2 text-xs">
            <label className="shrink-0 space-y-1">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Search player</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Player"
                className="w-44 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream placeholder:text-brand-creamDark focus:border-brand-green focus:outline-none"
              />
            </label>

            <div className="shrink-0 space-y-1">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Position</span>
              <div className="flex gap-1">
                {positionFilters.map((filter) => {
                  const active = positionFilter === filter;
                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setPositionFilter(filter)}
                      className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                        active
                          ? "border-brand-green bg-brand-green text-brand-cream"
                          : "border-brand-cream/35 bg-brand-dark text-brand-cream"
                      }`}
                    >
                      {filter}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="shrink-0 space-y-1">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Team</span>
              <select
                value={teamFilter}
                onChange={(event) => setTeamFilter(event.target.value)}
                className="w-24 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream focus:border-brand-green focus:outline-none"
              >
                <option value="All">All</option>
                {teams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>

            <div className="shrink-0 space-y-1">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Ownership %</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={ownershipMin}
                  onChange={(event) => setOwnershipMin(event.target.value)}
                  placeholder="Min"
                  className="w-16 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={ownershipMax}
                  onChange={(event) => setOwnershipMax(event.target.value)}
                  placeholder="Max"
                  className="w-16 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="text-brand-creamDark">
            <tr>
              <th className="sticky left-0 top-0 z-30 border-b border-r border-brand-cream/35 bg-[#0F1F13] px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                <button type="button" onClick={() => handleSort("name")} className="inline-flex items-center gap-1">
                  <span>Player</span>
                  <span aria-hidden="true">{sortArrow("name")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-brand-cream">
                <button
                  type="button"
                  onClick={() => handleSort("seasonPts")}
                  className="inline-flex items-center justify-center gap-1"
                >
                  <span>Season Pts</span>
                  <span aria-hidden="true">{sortArrow("seasonPts")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-brand-cream">
                <button
                  type="button"
                  onClick={() => handleSort("avgPtsPerGw")}
                  className="inline-flex items-center justify-center gap-1"
                >
                  <span>Avg Pts/GW</span>
                  <span aria-hidden="true">{sortArrow("avgPtsPerGw")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-brand-cream">
                <button
                  type="button"
                  onClick={() => handleSort("ghostPtsPerGw")}
                  className="inline-flex items-center justify-center gap-1"
                >
                  <span>Ghost Pts/GW</span>
                  <span aria-hidden="true">{sortArrow("ghostPtsPerGw")}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((player, index) => {
              const rowHref = `/portal/players/${player.id}`;
              const rowShade = index % 2 === 0 ? "bg-brand-dark/60" : "bg-brand-dark/90";

              return (
                <tr key={player.id} className="text-brand-cream">
                  <td className={`sticky left-0 z-20 border-b border-r border-brand-cream/10 px-4 py-3 ${rowShade}`}>
                    <Link href={rowHref} className="block hover:text-brand-greenLight">
                      <div className="flex items-center gap-1 font-semibold leading-tight">
                        <span>{player.name}</span>
                        <AvailabilityIcon
                          chanceOfPlaying={player.chanceOfPlaying}
                          status={player.availabilityStatus}
                          news={player.availabilityNews}
                        />
                      </div>
                      <div className="mt-0.5 text-xs text-brand-creamDark/70">
                        {player.team} / {player.position} / {player.ownershipPct.toFixed(1)}%
                      </div>
                    </Link>
                  </td>
                  <td className={`border-b border-r border-brand-cream/10 px-4 py-3 text-center ${rowShade}`}>
                    <Link href={rowHref} className="inline-flex">
                      <span
                        className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold text-white"
                        style={{
                          backgroundColor: pointsBadgeBackground(
                            player.seasonPts,
                            visibleRanges.seasonPts.min,
                            visibleRanges.seasonPts.max
                          ),
                        }}
                      >
                        {player.seasonPts.toFixed(2)}
                      </span>
                    </Link>
                  </td>
                  <td className={`border-b border-r border-brand-cream/10 px-4 py-3 text-center ${rowShade}`}>
                    <Link href={rowHref} className="inline-flex">
                      <span
                        className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold text-white"
                        style={{
                          backgroundColor: pointsBadgeBackground(
                            player.avgPtsPerGw,
                            visibleRanges.avgPtsPerGw.min,
                            visibleRanges.avgPtsPerGw.max
                          ),
                        }}
                      >
                        {player.avgPtsPerGw.toFixed(2)}
                      </span>
                    </Link>
                  </td>
                  <td className={`border-b border-r border-brand-cream/10 px-4 py-3 text-center ${rowShade}`}>
                    <Link href={rowHref} className="inline-flex">
                      <span
                        className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold text-white"
                        style={{
                          backgroundColor: pointsBadgeBackground(
                            player.ghostPtsPerGw,
                            visibleRanges.ghostPtsPerGw.min,
                            visibleRanges.ghostPtsPerGw.max
                          ),
                        }}
                      >
                        {player.ghostPtsPerGw.toFixed(2)}
                      </span>
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filteredAndSorted.length === 0 && (
              <tr>
                <td colSpan={4} className="border-b border-brand-cream/10 bg-brand-dark/90 px-4 py-6 text-center text-brand-creamDark">
                  No players match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
