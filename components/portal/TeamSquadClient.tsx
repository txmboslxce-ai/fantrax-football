"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type SquadRow = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  seasonPts: number;
  avgPtsPerGw: number;
  avgPtsPerGame: number;
  ghostPtsPerGw: number;
  ownershipPct: number;
};

type SortKey = "name" | "position" | "seasonPts" | "avgPtsPerGw" | "avgPtsPerGame" | "ghostPtsPerGw" | "ownershipPct";

const positionFilters: Array<"All" | "GK" | "DEF" | "MID" | "FWD"> = ["All", "GK", "DEF", "MID", "FWD"];

export default function TeamSquadClient({ players }: { players: SquadRow[] }) {
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<(typeof positionFilters)[number]>("All");
  const [sortKey, setSortKey] = useState<SortKey>("seasonPts");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const statRanges = useMemo(() => {
    const rangeFor = (values: number[]) => ({
      min: values.length > 0 ? Math.min(...values) : 0,
      max: values.length > 0 ? Math.max(...values) : 0,
    });

    return {
      seasonPts: rangeFor(players.map((player) => player.seasonPts)),
      avgPtsPerGw: rangeFor(players.map((player) => player.avgPtsPerGw)),
      avgPtsPerGame: rangeFor(players.map((player) => player.avgPtsPerGame)),
      ghostPtsPerGw: rangeFor(players.map((player) => player.ghostPtsPerGw)),
    };
  }, [players]);

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

  function mixColor(a: [number, number, number], b: [number, number, number], ratio: number): string {
    const safeRatio = Math.max(0, Math.min(1, ratio));
    const r = Math.round(a[0] + (b[0] - a[0]) * safeRatio);
    const g = Math.round(a[1] + (b[1] - a[1]) * safeRatio);
    const blue = Math.round(a[2] + (b[2] - a[2]) * safeRatio);
    return `rgb(${r}, ${g}, ${blue})`;
  }

  function gradientBackground(value: number, min: number, max: number): string {
    const red: [number, number, number] = [239, 68, 68];
    const yellow: [number, number, number] = [234, 179, 8];
    const green: [number, number, number] = [42, 122, 59];

    const ratio = max > min ? (value - min) / (max - min) : 0.5;
    if (ratio <= 0.5) {
      return mixColor(red, yellow, ratio * 2);
    }
    return mixColor(yellow, green, (ratio - 0.5) * 2);
  }

  function renderStatBadge(value: number, min: number, max: number) {
    return (
      <span
        className="inline-flex min-w-14 justify-center rounded-md px-2 py-0.5 text-xs font-bold text-white"
        style={{ backgroundColor: gradientBackground(value, min, max) }}
      >
        {value.toFixed(2)}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {positionFilters.map((filter) => {
          const active = positionFilter === filter;
          return (
            <button
              key={filter}
              type="button"
              onClick={() => setPositionFilter(filter)}
              className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${
                active
                  ? "border-brand-green bg-brand-green text-brand-cream"
                  : "border-brand-cream/40 bg-brand-dark text-brand-cream hover:bg-brand-cream/10"
              }`}
            >
              {filter}
            </button>
          );
        })}

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search player"
          className="ml-auto w-full max-w-sm rounded-md border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream placeholder:text-brand-creamDark focus:border-brand-green focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-brand-dark text-brand-creamDark">
            <tr>
              <th className="px-4 py-3">
                <button type="button" onClick={() => handleSort("name")} className="font-semibold">
                  Name
                </button>
              </th>
              <th className="px-4 py-3">
                <button type="button" onClick={() => handleSort("position")} className="font-semibold">
                  Position
                </button>
              </th>
              <th className="px-4 py-3">
                <button type="button" onClick={() => handleSort("seasonPts")} className="font-semibold">
                  Season Pts
                </button>
              </th>
              <th className="px-4 py-3">
                <button type="button" onClick={() => handleSort("avgPtsPerGw")} className="font-semibold">
                  Avg Pts/GW
                </button>
              </th>
              <th className="px-4 py-3">
                <button type="button" onClick={() => handleSort("avgPtsPerGame")} className="font-semibold">
                  Avg Pts/Game
                </button>
              </th>
              <th className="px-4 py-3">
                <button type="button" onClick={() => handleSort("ghostPtsPerGw")} className="font-semibold">
                  Ghost Pts/GW
                </button>
              </th>
              <th className="px-4 py-3">
                <button type="button" onClick={() => handleSort("ownershipPct")} className="font-semibold">
                  Ownership %
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((player, index) => {
              const rowHref = `/portal/players/${player.id}`;
              return (
                <tr
                  key={player.id}
                  className={index % 2 === 0 ? "bg-brand-dark/75 text-brand-cream" : "bg-brand-dark text-brand-cream"}
                >
                  <td className="px-4 py-3 font-semibold">
                    <Link href={rowHref} className="block hover:text-brand-greenLight">
                      {player.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={rowHref} className="block hover:text-brand-greenLight">
                      {player.position}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link href={rowHref} className="inline-flex hover:brightness-110">
                      {renderStatBadge(player.seasonPts, statRanges.seasonPts.min, statRanges.seasonPts.max)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link href={rowHref} className="inline-flex hover:brightness-110">
                      {renderStatBadge(player.avgPtsPerGw, statRanges.avgPtsPerGw.min, statRanges.avgPtsPerGw.max)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link href={rowHref} className="inline-flex hover:brightness-110">
                      {renderStatBadge(player.avgPtsPerGame, statRanges.avgPtsPerGame.min, statRanges.avgPtsPerGame.max)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link href={rowHref} className="inline-flex hover:brightness-110">
                      {renderStatBadge(player.ghostPtsPerGw, statRanges.ghostPtsPerGw.min, statRanges.ghostPtsPerGw.max)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={rowHref} className="block hover:text-brand-greenLight">
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
  );
}
