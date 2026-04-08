"use client";

import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";
import type { PlayerTableWindowKey, PlayerWindowStats } from "@/lib/portal/playerMetrics";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PlayerRow = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  ownershipPct: number;
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
  windows: Record<PlayerTableWindowKey, PlayerWindowStats>;
};

type NumericColumnKey = keyof PlayerWindowStats;
type SortKey = "name" | NumericColumnKey;

type PlayersTableClientProps = {
  players: PlayerRow[];
};

type ColumnDefinition = {
  key: NumericColumnKey;
  label: string;
  category: "Scoring" | "Involvement" | "Home/Away" | "Point Breakdown";
  alwaysVisible?: boolean;
  isPercent?: boolean;
  digits?: number;
};

const positionFilters: Array<"All" | "GK" | "DEF" | "MID" | "FWD"> = ["All", "GK", "DEF", "MID", "FWD"];

const WINDOW_OPTIONS: Array<{ key: PlayerTableWindowKey; label: string }> = [
  { key: "last5", label: "Last 5" },
  { key: "last10", label: "Last 10" },
  { key: "season", label: "Season" },
];

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: "fantasy_pts_per_start", label: "Fantasy Pts/Start", category: "Scoring", alwaysVisible: true },
  { key: "ghost_pts_per_start", label: "Ghost Pts/Start", category: "Scoring", alwaysVisible: true },
  { key: "games_started", label: "Games Started", category: "Involvement", alwaysVisible: true, digits: 0 },
  { key: "minutes_per_start", label: "Minutes/Start", category: "Involvement", alwaysVisible: true },
  { key: "floor_per_start", label: "Floor/Start", category: "Scoring", alwaysVisible: true },
  { key: "ceiling_per_start", label: "Ceiling/Start", category: "Scoring", alwaysVisible: true },
  { key: "season_pts", label: "Season Pts", category: "Scoring" },
  { key: "avg_pts_per_gw", label: "Avg Pts/GW", category: "Scoring" },
  { key: "std_deviation", label: "Std Deviation", category: "Scoring" },
  { key: "median_pts_per_start", label: "Median Pts/Start", category: "Scoring" },
  { key: "coefficient_of_variation", label: "Coefficient of Variation", category: "Scoring" },
  { key: "games_played", label: "Games Played", category: "Involvement", digits: 0 },
  { key: "total_minutes", label: "Total Minutes", category: "Involvement", digits: 0 },
  { key: "home_pts_per_start", label: "Home Pts/Start", category: "Home/Away" },
  { key: "home_pts_pct", label: "Home Pts %", category: "Home/Away", isPercent: true },
  { key: "away_pts_per_start", label: "Away Pts/Start", category: "Home/Away" },
  { key: "away_pts_pct", label: "Away Pts %", category: "Home/Away", isPercent: true },
  { key: "goals_pts_pct", label: "Goals Pts %", category: "Point Breakdown", isPercent: true },
  { key: "assist_pts_pct", label: "Assist Pts %", category: "Point Breakdown", isPercent: true },
  { key: "clean_sheet_pts_pct", label: "Clean Sheet Pts %", category: "Point Breakdown", isPercent: true },
  { key: "ghost_pts_pct", label: "Ghost Pts %", category: "Point Breakdown", isPercent: true },
  { key: "attacking_pts_pct", label: "Attacking Pts %", category: "Point Breakdown", isPercent: true },
  { key: "defensive_pts_pct", label: "Defensive Pts %", category: "Point Breakdown", isPercent: true },
  { key: "total_attacking_defensive_pct", label: "Total Attacking + Defensive %", category: "Point Breakdown", isPercent: true },
];

const COLUMN_CATEGORIES = ["Scoring", "Involvement", "Home/Away", "Point Breakdown"] as const;
type ColumnCategory = (typeof COLUMN_CATEGORIES)[number];

const OPTIONAL_COLUMN_KEYS = COLUMN_DEFINITIONS.filter((column) => !column.alwaysVisible).map((column) => column.key);

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

function formatValue(value: number, column: ColumnDefinition): string {
  const digits = column.digits ?? 2;
  if (!Number.isFinite(value)) {
    return column.isPercent ? `0.${"0".repeat(digits)}%` : (0).toFixed(digits);
  }

  const formatted = value.toFixed(digits);
  return column.isPercent ? `${formatted}%` : formatted;
}

export default function PlayersTableClient({ players }: PlayersTableClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [positionFilter, setPositionFilter] = useState<(typeof positionFilters)[number]>("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [ownershipMin, setOwnershipMin] = useState("0");
  const [ownershipMax, setOwnershipMax] = useState("100");
  const [selectedWindow, setSelectedWindow] = useState<PlayerTableWindowKey>("season");
  const [visibleOptionalColumns, setVisibleOptionalColumns] = useState<NumericColumnKey[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("fantasy_pts_per_start");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<ColumnCategory, boolean>>({
    Scoring: true,
    Involvement: true,
    "Home/Away": false,
    "Point Breakdown": false,
  });

  const teams = useMemo(() => {
    return [...new Set(players.map((player) => player.team))].sort((a, b) => a.localeCompare(b));
  }, [players]);

  const visibleColumns = useMemo(() => {
    return COLUMN_DEFINITIONS.filter((column) => column.alwaysVisible || visibleOptionalColumns.includes(column.key));
  }, [visibleOptionalColumns]);

  useEffect(() => {
    if (sortKey !== "name" && !visibleColumns.some((column) => column.key === sortKey)) {
      setSortKey("fantasy_pts_per_start");
      setSortDir("desc");
    }
  }, [sortKey, visibleColumns]);

  const filteredAndSorted = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();
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

    return [...filtered].sort((a, b) => {
      if (sortKey === "name") {
        const comparison = a.name.localeCompare(b.name);
        return sortDir === "asc" ? comparison : -comparison;
      }

      const aValue = a.windows[selectedWindow][sortKey];
      const bValue = b.windows[selectedWindow][sortKey];
      return sortDir === "asc" ? aValue - bValue : bValue - aValue;
    });
  }, [
    deferredSearch,
    ownershipMax,
    ownershipMin,
    players,
    positionFilter,
    selectedWindow,
    sortDir,
    sortKey,
    teamFilter,
  ]);

  const visibleRanges = useMemo(() => {
    const ranges = {} as Record<NumericColumnKey, { min: number; max: number }>;

    for (const column of visibleColumns) {
      const values = filteredAndSorted.map((player) => player.windows[selectedWindow][column.key]);
      ranges[column.key] = {
        min: values.length > 0 ? Math.min(...values) : 0,
        max: values.length > 0 ? Math.max(...values) : 0,
      };
    }

    return ranges;
  }, [filteredAndSorted, selectedWindow, visibleColumns]);

  const columnsByCategory = useMemo(() => {
    return COLUMN_CATEGORIES.reduce<Record<ColumnCategory, ColumnDefinition[]>>((accumulator, category) => {
      accumulator[category] = COLUMN_DEFINITIONS.filter((column) => column.category === category && !column.alwaysVisible);
      return accumulator;
    }, {} as Record<ColumnCategory, ColumnDefinition[]>);
  }, []);

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDir(nextKey === "name" ? "asc" : "desc");
  }

  function toggleColumn(columnKey: NumericColumnKey) {
    setVisibleOptionalColumns((current) => {
      if (current.includes(columnKey)) {
        return current.filter((key) => key !== columnKey);
      }

      const next = [...current, columnKey];
      return OPTIONAL_COLUMN_KEYS.filter((key) => next.includes(key));
    });
  }

  function toggleCategory(category: ColumnCategory) {
    setExpandedCategories((current) => ({
      ...current,
      [category]: !current[category],
    }));
  }

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕");

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-3 py-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Search player</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Player"
              className="w-full rounded border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream placeholder:text-brand-creamDark focus:border-brand-green focus:outline-none"
            />
          </label>

          <div className="space-y-1">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Position</span>
            <div className="flex flex-wrap gap-1">
              {positionFilters.map((filter) => {
                const active = positionFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setPositionFilter(filter)}
                    className={`rounded-md border px-3 py-2 text-xs font-semibold ${
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

          <label className="space-y-1">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Team</span>
            <select
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
              className="w-full rounded border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream focus:border-brand-green focus:outline-none"
            >
              <option value="All">All</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Ownership %</span>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={ownershipMin}
                onChange={(event) => setOwnershipMin(event.target.value)}
                placeholder="Min"
                className="w-full rounded border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream"
              />
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={ownershipMax}
                onChange={(event) => setOwnershipMax(event.target.value)}
                placeholder="Max"
                className="w-full rounded border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-brand-cream/10 pt-3">
          <div className="space-y-1">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Window</span>
            <div className="flex flex-wrap gap-1">
              {WINDOW_OPTIONS.map((option) => {
                const active = selectedWindow === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSelectedWindow(option.key)}
                    className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                      active
                        ? "border-brand-green bg-brand-green text-brand-cream"
                        : "border-brand-cream/35 bg-brand-dark text-brand-cream"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsColumnPanelOpen((current) => !current)}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
              isColumnPanelOpen
                ? "border-brand-green bg-brand-green text-brand-cream"
                : "border-brand-cream/35 bg-brand-dark text-brand-cream"
            }`}
          >
            {isColumnPanelOpen ? "Hide columns" : "Add / Remove columns"}
          </button>
        </div>
      </div>

      {isColumnPanelOpen ? (
        <div className="rounded-xl border border-brand-cream/20 bg-[#102116] p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-brand-cream">Columns</h2>
            <p className="mt-1 text-sm text-brand-creamDark">
              Base columns stay visible. Expand a category to add or remove optional columns.
            </p>
          </div>

          <div className="space-y-3">
            {COLUMN_CATEGORIES.map((category) => {
              const expanded = expandedCategories[category];
              const categoryColumns = columnsByCategory[category];

              return (
                <section key={category} className="rounded-xl border border-brand-cream/15 bg-brand-dark/40">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div>
                      <div className="text-sm font-bold text-brand-cream">{category}</div>
                      <div className="text-xs text-brand-creamDark">{categoryColumns.length} optional columns</div>
                    </div>
                    <span className="text-lg text-brand-cream">{expanded ? "−" : "+"}</span>
                  </button>

                  {expanded ? (
                    <div className="grid gap-3 border-t border-brand-cream/10 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
                      {categoryColumns.map((column) => {
                        const checked = visibleOptionalColumns.includes(column.key);
                        return (
                          <label
                            key={column.key}
                            className="flex items-start gap-3 rounded-lg border border-brand-cream/10 bg-brand-dark/70 px-3 py-3 text-sm text-brand-cream"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleColumn(column.key)}
                              className="mt-0.5 h-5 w-5 rounded border-brand-cream/35 bg-brand-dark text-brand-green focus:ring-brand-green"
                            />
                            <span className="leading-snug">{column.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      ) : null}

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
              {visibleColumns.map((column) => (
                <th
                  key={column.key}
                  className="sticky top-0 z-20 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-brand-cream"
                >
                  <button
                    type="button"
                    onClick={() => handleSort(column.key)}
                    className="inline-flex items-center justify-center gap-1"
                  >
                    <span>{column.label}</span>
                    <span aria-hidden="true">{sortArrow(column.key)}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((player, index) => {
              const rowHref = `/portal/players/${player.id}`;
              const rowShade = index % 2 === 0 ? "bg-brand-dark/60" : "bg-brand-dark/90";

              return (
                <tr
                  key={player.id}
                  className="cursor-pointer text-brand-cream"
                  onClick={() => router.push(rowHref)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(rowHref);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                >
                  <td className={`sticky left-0 z-20 border-b border-r border-brand-cream/10 px-4 py-3 ${rowShade}`}>
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
                  </td>
                  {visibleColumns.map((column) => {
                    const value = player.windows[selectedWindow][column.key];
                    const range = visibleRanges[column.key];

                    return (
                      <td key={column.key} className={`border-b border-r border-brand-cream/10 px-4 py-3 text-center ${rowShade}`}>
                        <span
                          className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold text-white"
                          style={{ backgroundColor: pointsBadgeBackground(value, range.min, range.max) }}
                        >
                          {formatValue(value, column)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + 1}
                  className="border-b border-brand-cream/10 bg-brand-dark/90 px-4 py-6 text-center text-brand-creamDark"
                >
                  No players match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
