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

export default function SquadTableClient({ players }: { players: SquadRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("seasonPts");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDir === "asc" ? aValue - bValue : bValue - aValue;
      }

      const comparison = String(aValue).localeCompare(String(bValue));
      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [players, sortDir, sortKey]);

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "name" || nextKey === "position" ? "asc" : "desc");
  }

  return (
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
          {sortedPlayers.map((player, index) => {
            const rowHref = `/portal/players/${player.id}`;
            return (
              <tr key={player.id} className={index % 2 === 0 ? "bg-brand-dark/75 text-brand-cream" : "bg-brand-dark text-brand-cream"}>
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
                <td className="px-4 py-3">
                  <Link href={rowHref} className="block hover:text-brand-greenLight">
                    {player.seasonPts.toFixed(2)}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={rowHref} className="block hover:text-brand-greenLight">
                    {player.avgPtsPerGw.toFixed(2)}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={rowHref} className="block hover:text-brand-greenLight">
                    {player.avgPtsPerGame.toFixed(2)}
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
  );
}
