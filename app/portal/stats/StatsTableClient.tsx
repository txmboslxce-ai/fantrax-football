"use client";

import { useMemo, useState } from "react";

type StatsRow = {
  id: string;
  player: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  seasonPts: number;
  avgGw: number;
  ghostGw: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  saves: number;
  tackles: number;
  interceptions: number;
  clearances: number;
  aerials: number;
  keyPasses: number;
  gamesPlayed: number;
};

type SortKey = keyof StatsRow;

const positions: Array<"All" | "GK" | "DEF" | "MID" | "FWD"> = ["All", "GK", "DEF", "MID", "FWD"];

const columns: Array<{ key: SortKey; label: string }> = [
  { key: "player", label: "Player" },
  { key: "team", label: "Team" },
  { key: "position", label: "Position" },
  { key: "seasonPts", label: "Season Pts" },
  { key: "avgGw", label: "Avg/GW" },
  { key: "ghostGw", label: "Ghost Pts/GW" },
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "cleanSheets", label: "Clean Sheets" },
  { key: "saves", label: "Saves" },
  { key: "tackles", label: "Tackles" },
  { key: "interceptions", label: "Interceptions" },
  { key: "clearances", label: "Clearances" },
  { key: "aerials", label: "Aerials" },
  { key: "keyPasses", label: "Key Passes" },
];

export default function StatsTableClient({ rows }: { rows: StatsRow[] }) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<(typeof positions)[number]>("All");
  const [minGames, setMinGames] = useState(3);
  const [sortKey, setSortKey] = useState<SortKey>("seasonPts");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filteredSorted = useMemo(() => {
    const term = search.trim().toLowerCase();

    const filtered = rows.filter((row) => {
      const matchesSearch = !term || row.player.toLowerCase().includes(term);
      const matchesPosition = position === "All" || row.position === position;
      const matchesGames = row.gamesPlayed >= minGames;
      return matchesSearch && matchesPosition && matchesGames;
    });

    return filtered.sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDir === "asc" ? aValue - bValue : bValue - aValue;
      }
      const cmp = String(aValue).localeCompare(String(bValue));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [minGames, position, rows, search, sortDir, sortKey]);

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(typeof rows[0]?.[key] === "number" ? "desc" : "asc");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search player"
          className="rounded-md border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream"
        />
        <select
          value={position}
          onChange={(event) => setPosition(event.target.value as (typeof positions)[number])}
          className="rounded-md border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream"
        >
          {positions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded-md border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream">
          Min games
          <input
            type="range"
            min={0}
            max={38}
            value={minGames}
            onChange={(event) => setMinGames(Number(event.target.value))}
            className="w-full"
          />
          <span>{minGames}</span>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-brand-dark text-brand-creamDark">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3">
                  <button type="button" onClick={() => onSort(column.key)} className="font-semibold">
                    {column.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredSorted.map((row, index) => (
              <tr key={row.id} className={index % 2 === 0 ? "bg-brand-dark/75 text-brand-cream" : "bg-brand-dark text-brand-cream"}>
                <td className="px-4 py-3">{row.player}</td>
                <td className="px-4 py-3">{row.team}</td>
                <td className="px-4 py-3">{row.position}</td>
                <td className="px-4 py-3">{row.seasonPts.toFixed(1)}</td>
                <td className="px-4 py-3">{row.avgGw.toFixed(2)}</td>
                <td className="px-4 py-3">{row.ghostGw.toFixed(2)}</td>
                <td className="px-4 py-3">{row.goals}</td>
                <td className="px-4 py-3">{row.assists}</td>
                <td className="px-4 py-3">{row.cleanSheets}</td>
                <td className="px-4 py-3">{row.position === "GK" ? row.saves : "-"}</td>
                <td className="px-4 py-3">{row.tackles}</td>
                <td className="px-4 py-3">{row.interceptions}</td>
                <td className="px-4 py-3">{row.clearances}</td>
                <td className="px-4 py-3">{row.aerials}</td>
                <td className="px-4 py-3">{row.keyPasses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
