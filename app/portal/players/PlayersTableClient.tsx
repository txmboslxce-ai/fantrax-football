"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type PlayerRow = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  seasonPts: number;
  avgPtsPerGw: number;
  ghostPtsPerGw: number;
  ownershipPct: number;
};

type SortKey = "name" | "team" | "position" | "seasonPts" | "avgPtsPerGw" | "ghostPtsPerGw" | "ownershipPct";

type PlayersTableClientProps = {
  players: PlayerRow[];
  isPremiumUser: boolean;
};

const positionFilters: Array<"All" | "GK" | "DEF" | "MID" | "FWD"> = ["All", "GK", "DEF", "MID", "FWD"];

export default function PlayersTableClient({ players, isPremiumUser }: PlayersTableClientProps) {
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
  }, [players, positionFilter, search, sortDir, sortKey]);

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    if (nextKey === "name" || nextKey === "team" || nextKey === "position") {
      setSortDir("asc");
      return;
    }

    setSortDir("desc");
  }

  const indicator = isPremiumUser ? "👑" : "🔒";

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
                  Player
                </button>
              </th>
              <th className="px-4 py-3">
                <button type="button" onClick={() => handleSort("team")} className="font-semibold">
                  Team
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
                      <span className="mr-2" aria-hidden="true">
                        {indicator}
                      </span>
                      {player.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={rowHref} className="block hover:text-brand-greenLight">
                      {player.team}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={rowHref} className="block hover:text-brand-greenLight">
                      {player.position}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={rowHref} className="block hover:text-brand-greenLight">
                      {player.seasonPts.toFixed(1)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={rowHref} className="block hover:text-brand-greenLight">
                      {player.avgPtsPerGw.toFixed(2)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={rowHref} className="block hover:text-brand-greenLight">
                      {player.ghostPtsPerGw.toFixed(2)}
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
