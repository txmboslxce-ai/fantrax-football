"use client";

import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";
import RosterPill from "@/app/components/ui/RosterPill";
import type { PlayerTableWindowKey, PlayerWindowStats } from "@/lib/portal/playerMetrics";
import type { LeagueRosterData } from "@/lib/portal/leagueRoster";
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
  leagueRoster: LeagueRosterData | null;
};

type ColumnDefinition = {
  key: NumericColumnKey;
  label: string;
  category: "Scoring" | "Involvement" | "Home/Away" | "Point Breakdown";
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
  { key: "season_pts", label: "Season Pts", category: "Scoring" },
  { key: "fantasy_pts_per_start", label: "Fantasy Pts/Start", category: "Scoring" },
  { key: "ghost_pts_per_start", label: "Ghost Pts/Start", category: "Scoring" },
  { key: "minutes_per_start", label: "Minutes/Start", category: "Involvement" },
  { key: "games_started", label: "Games Started", category: "Scoring", digits: 0 },
  { key: "floor_per_start", label: "Floor/Start", category: "Scoring" },
  { key: "ceiling_per_start", label: "Ceiling/Start", category: "Scoring" },
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

const DEFAULT_SELECTED_COLUMN_KEYS: NumericColumnKey[] = [
  "season_pts",
  "fantasy_pts_per_start",
  "ghost_pts_per_start",
  "minutes_per_start",
];
const MAX_SELECTED_COLUMNS = 6;

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

export default function PlayersTableClient({ players, leagueRoster }: PlayersTableClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [positionFilter, setPositionFilter] = useState<(typeof positionFilters)[number]>("All");
  const [availabilityFilter, setAvailabilityFilter] = useState<"All" | "Available" | "Taken">("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [ownershipMin, setOwnershipMin] = useState("0");
  const [ownershipMax, setOwnershipMax] = useState("100");
  const [selectedWindow, setSelectedWindow] = useState<PlayerTableWindowKey>("season");
  const [selectedColumns, setSelectedColumns] = useState<NumericColumnKey[]>(DEFAULT_SELECTED_COLUMN_KEYS);
  const [sortKey, setSortKey] = useState<SortKey>("fantasy_pts_per_start");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<ColumnCategory, boolean>>({
    Scoring: false,
    Involvement: false,
    "Home/Away": false,
    "Point Breakdown": false,
  });

  const teams = useMemo(() => {
    return [...new Set(players.map((player) => player.team))].sort((a, b) => a.localeCompare(b));
  }, [players]);

  const visibleColumns = useMemo(() => {
    return selectedColumns
      .map((key) => COLUMN_DEFINITIONS.find((column) => column.key === key))
      .filter((column): column is ColumnDefinition => Boolean(column));
  }, [selectedColumns]);

  const selectedColumnDefinitions = visibleColumns;

  const hasReachedColumnLimit = selectedColumns.length >= MAX_SELECTED_COLUMNS;

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
      const isTaken = leagueRoster ? Boolean(leagueRoster.teamByPlayerId[player.id]) : false;
      const matchesAvailability =
        availabilityFilter === "All" ||
        (availabilityFilter === "Available" && !isTaken) ||
        (availabilityFilter === "Taken" && isTaken);
      return matchesPosition && matchesTeam && matchesSearch && matchesOwnership && matchesAvailability;
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
    availabilityFilter,
    deferredSearch,
    leagueRoster,
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
      accumulator[category] = COLUMN_DEFINITIONS.filter((column) => column.category === category);
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
    setSelectedColumns((current) => {
      if (current.includes(columnKey)) {
        return current.filter((key) => key !== columnKey);
      }

      if (current.length >= MAX_SELECTED_COLUMNS) {
        return current;
      }

      const next = [...current, columnKey];
      return COLUMN_DEFINITIONS.map((column) => column.key).filter((key) => next.includes(key));
    });
  }

  function clearAllColumns() {
    setSelectedColumns([]);
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
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          <label className="space-y-1">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Search player</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Player"
              className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2.5 py-1.5 text-xs text-brand-cream placeholder:text-brand-creamDark focus:border-brand-green focus:outline-none"
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
                    className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${
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

          {leagueRoster ? (
            <div className="space-y-1">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Availability</span>
              <div className="flex flex-wrap gap-1">
                {(["All", "Available", "Taken"] as const).map((option) => {
                  const active = availabilityFilter === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setAvailabilityFilter(option)}
                      className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${
                        active
                          ? "border-brand-green bg-brand-green text-brand-cream"
                          : "border-brand-cream/35 bg-brand-dark text-brand-cream"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <label className="space-y-1">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Team</span>
            <select
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
              className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2.5 py-1.5 text-xs text-brand-cream focus:border-brand-green focus:outline-none"
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
                className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2.5 py-1.5 text-xs text-brand-cream"
              />
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={ownershipMax}
                onChange={(event) => setOwnershipMax(event.target.value)}
                placeholder="Max"
                className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2.5 py-1.5 text-xs text-brand-cream"
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
                    className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${
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
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
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
              Expand a category to add or remove columns.
            </p>
            {hasReachedColumnLimit ? (
              <p className="mt-2 text-xs font-semibold text-amber-300">Maximum columns selected</p>
            ) : null}
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
                      <div className="text-xs text-brand-creamDark">{categoryColumns.length} columns</div>
                    </div>
                    <span className="text-lg text-brand-cream">{expanded ? "−" : "+"}</span>
                  </button>

                  {expanded ? (
                    <div className="grid gap-3 border-t border-brand-cream/10 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
                      {categoryColumns.map((column) => {
                        const checked = selectedColumns.includes(column.key);
                        const disabled = !checked && hasReachedColumnLimit;
                        return (
                          <label
                            key={column.key}
                            className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-sm ${
                              disabled
                                ? "border-brand-cream/5 bg-brand-dark/30 text-brand-creamDark/50"
                                : "border-brand-cream/10 bg-brand-dark/70 text-brand-cream"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
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

      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark/40 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {selectedColumnDefinitions.length > 0 ? (
              selectedColumnDefinitions.map((column) => (
                <span
                  key={column.key}
                  className="inline-flex items-center gap-2 rounded-full border border-brand-green/40 bg-brand-green/15 px-3 py-1 text-xs font-semibold text-brand-cream"
                >
                  <span>{column.label}</span>
                  <button
                    type="button"
                    onClick={() => toggleColumn(column.key)}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] text-brand-creamDark hover:bg-brand-green/30 hover:text-brand-cream"
                    aria-label={`Remove ${column.label}`}
                  >
                    ×
                  </button>
                </span>
              ))
            ) : (
              <span className="text-xs text-brand-creamDark">No optional columns selected.</span>
            )}
          </div>

          <button
            type="button"
            onClick={clearAllColumns}
            disabled={selectedColumnDefinitions.length === 0}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
              selectedColumnDefinitions.length === 0
                ? "cursor-not-allowed border-brand-cream/10 text-brand-creamDark/50"
                : "border-brand-cream/35 text-brand-cream"
            }`}
          >
            Clear all
          </button>
        </div>
      </div>

      <div className="overflow-x-scroll rounded-xl border border-brand-cream/20 [scrollbar-gutter:stable]">
        <div className="flex items-center justify-between border-b border-brand-cream/10 bg-brand-dark/70 px-3 py-2 text-xs text-brand-creamDark">
          <span>Player column stays pinned while you scroll.</span>
          <span>Scroll horizontally for more stats.</span>
        </div>
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
                    <div className="flex flex-wrap items-center gap-1 font-semibold leading-tight">
                      <span>{player.name}</span>
                      <AvailabilityIcon
                        chanceOfPlaying={player.chanceOfPlaying}
                        status={player.availabilityStatus}
                        news={player.availabilityNews}
                      />
                      <RosterPill playerId={player.id} leagueRoster={leagueRoster} />
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
