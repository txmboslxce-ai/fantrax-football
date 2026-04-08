"use client";

import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";
import type { PlayerTableWindowKey } from "@/lib/portal/playerMetrics";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type StatsWindowRow = {
  season_pts: number;
  avg_pts_per_gw: number;
  ghost_pts_per_gw: number;
  goals: number;
  assists: number;
  key_passes: number;
  shots_on_target: number;
  dribbles_succeeded: number;
  dispossessed: number;
  tackles_won: number;
  interceptions: number;
  clearances: number;
  blocked_shots: number;
  aerials_won: number;
  accurate_crosses: number;
  goals_against_outfield: number;
  clean_sheets: number;
  saves: number;
  penalty_saves: number;
  goals_against: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
  penalties_missed: number;
  penalties_drawn: number;
  games_played: number;
  games_started: number;
  minutes_played: number;
};

type StatsRow = {
  id: string;
  player: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  ownershipPct: number;
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
  windows: Record<PlayerTableWindowKey, StatsWindowRow>;
};

type StatColumnKey = keyof StatsWindowRow;
type SortKey = "player" | StatColumnKey;

type ColumnCategory = "Fantasy" | "Attacking" | "Defensive" | "Goalkeeping" | "Discipline" | "Involvement";

type ColumnDefinition = {
  key: StatColumnKey;
  label: string;
  category: ColumnCategory;
  digits?: number;
};

const positions: Array<"All" | "GK" | "DEF" | "MID" | "FWD"> = ["All", "GK", "DEF", "MID", "FWD"];
const WINDOW_OPTIONS: Array<{ key: PlayerTableWindowKey; label: string }> = [
  { key: "last5", label: "Last 5" },
  { key: "last10", label: "Last 10" },
  { key: "season", label: "Season" },
];

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: "season_pts", label: "Season Pts", category: "Fantasy" },
  { key: "avg_pts_per_gw", label: "Avg Pts/GW", category: "Fantasy" },
  { key: "ghost_pts_per_gw", label: "Ghost Pts/GW", category: "Fantasy" },
  { key: "games_started", label: "Games Started", category: "Involvement", digits: 0 },
  { key: "goals", label: "Goals", category: "Attacking", digits: 0 },
  { key: "assists", label: "Assists", category: "Attacking", digits: 0 },
  { key: "key_passes", label: "Key Passes", category: "Attacking", digits: 0 },
  { key: "shots_on_target", label: "Shots on Target", category: "Attacking", digits: 0 },
  { key: "dribbles_succeeded", label: "Dribbles Succeeded", category: "Attacking", digits: 0 },
  { key: "dispossessed", label: "Dispossessed", category: "Attacking", digits: 0 },
  { key: "tackles_won", label: "Tackles Won", category: "Defensive", digits: 0 },
  { key: "interceptions", label: "Interceptions", category: "Defensive", digits: 0 },
  { key: "clearances", label: "Clearances", category: "Defensive", digits: 0 },
  { key: "blocked_shots", label: "Blocked Shots", category: "Defensive", digits: 0 },
  { key: "aerials_won", label: "Aerials Won", category: "Defensive", digits: 0 },
  { key: "accurate_crosses", label: "Accurate Crosses", category: "Defensive", digits: 0 },
  { key: "goals_against_outfield", label: "Goals Against Outfield", category: "Defensive", digits: 0 },
  { key: "clean_sheets", label: "Clean Sheets", category: "Defensive", digits: 0 },
  { key: "saves", label: "Saves", category: "Goalkeeping", digits: 0 },
  { key: "penalty_saves", label: "Penalty Saves", category: "Goalkeeping", digits: 0 },
  { key: "goals_against", label: "Goals Against", category: "Goalkeeping", digits: 0 },
  { key: "clean_sheets", label: "Clean Sheets", category: "Goalkeeping", digits: 0 },
  { key: "yellow_cards", label: "Yellow Cards", category: "Discipline", digits: 0 },
  { key: "red_cards", label: "Red Cards", category: "Discipline", digits: 0 },
  { key: "own_goals", label: "Own Goals", category: "Discipline", digits: 0 },
  { key: "penalties_missed", label: "Penalties Missed", category: "Discipline", digits: 0 },
  { key: "games_played", label: "Games Played", category: "Involvement", digits: 0 },
  { key: "minutes_played", label: "Minutes Played", category: "Involvement", digits: 0 },
  { key: "penalties_drawn", label: "Penalties Drawn", category: "Involvement", digits: 0 },
];

const COLUMN_CATEGORIES: ColumnCategory[] = ["Fantasy", "Attacking", "Defensive", "Goalkeeping", "Discipline", "Involvement"];
const DEFAULT_SELECTED_COLUMN_KEYS: StatColumnKey[] = ["goals", "assists", "key_passes", "clean_sheets"];
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
  return Number.isFinite(value) ? value.toFixed(digits) : (0).toFixed(digits);
}

export default function StatsTableClient({ rows }: { rows: StatsRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [position, setPosition] = useState<(typeof positions)[number]>("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [minGames, setMinGames] = useState("0");
  const [ownershipMin, setOwnershipMin] = useState("0");
  const [ownershipMax, setOwnershipMax] = useState("100");
  const [selectedWindow, setSelectedWindow] = useState<PlayerTableWindowKey>("season");
  const [selectedColumns, setSelectedColumns] = useState<StatColumnKey[]>(DEFAULT_SELECTED_COLUMN_KEYS);
  const [sortKey, setSortKey] = useState<SortKey>("goals");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<ColumnCategory, boolean>>({
    Fantasy: false,
    Attacking: false,
    Defensive: false,
    Goalkeeping: false,
    Discipline: false,
    Involvement: false,
  });

  const teams = useMemo(() => {
    return [...new Set(rows.map((row) => row.team))].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const visibleColumns = useMemo(() => {
    return selectedColumns
      .map((key) => COLUMN_DEFINITIONS.find((column) => column.key === key))
      .filter((column): column is ColumnDefinition => Boolean(column));
  }, [selectedColumns]);

  const hasReachedColumnLimit = selectedColumns.length >= MAX_SELECTED_COLUMNS;

  useEffect(() => {
    if (sortKey !== "player" && !visibleColumns.some((column) => column.key === sortKey)) {
      setSortKey("goals");
      setSortDir("desc");
    }
  }, [sortKey, visibleColumns]);

  const filteredSorted = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    const parsedMinGames = Number(minGames);
    const safeMinGames = Number.isFinite(parsedMinGames) ? parsedMinGames : 0;
    const parsedOwnershipMin = Number(ownershipMin);
    const parsedOwnershipMax = Number(ownershipMax);
    const safeOwnershipMin = Number.isFinite(parsedOwnershipMin) ? parsedOwnershipMin : 0;
    const safeOwnershipMax = Number.isFinite(parsedOwnershipMax) ? parsedOwnershipMax : 100;
    const lowerOwnershipBound = Math.max(0, Math.min(safeOwnershipMin, safeOwnershipMax));
    const upperOwnershipBound = Math.min(100, Math.max(safeOwnershipMin, safeOwnershipMax));

    const filtered = rows.filter((row) => {
      const matchesSearch = !term || row.player.toLowerCase().includes(term);
      const matchesPosition = position === "All" || row.position === position;
      const matchesTeam = teamFilter === "All" || row.team === teamFilter;
      const matchesGames = row.windows[selectedWindow].games_played >= safeMinGames;
      const matchesOwnership = row.ownershipPct >= lowerOwnershipBound && row.ownershipPct <= upperOwnershipBound;
      return matchesSearch && matchesPosition && matchesTeam && matchesGames && matchesOwnership;
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === "player") {
        const comparison = a.player.localeCompare(b.player);
        return sortDir === "asc" ? comparison : -comparison;
      }

      const aValue = a.windows[selectedWindow][sortKey];
      const bValue = b.windows[selectedWindow][sortKey];
      return sortDir === "asc" ? aValue - bValue : bValue - aValue;
    });
  }, [deferredSearch, minGames, ownershipMax, ownershipMin, position, rows, selectedWindow, sortDir, sortKey, teamFilter]);

  const visibleRanges = useMemo(() => {
    const ranges = {} as Record<StatColumnKey, { min: number; max: number }>;

    for (const column of visibleColumns) {
      const values = filteredSorted.map((row) => row.windows[selectedWindow][column.key]);
      ranges[column.key] = {
        min: values.length > 0 ? Math.min(...values) : 0,
        max: values.length > 0 ? Math.max(...values) : 0,
      };
    }

    return ranges;
  }, [filteredSorted, selectedWindow, visibleColumns]);

  const columnsByCategory = useMemo(() => {
    return COLUMN_CATEGORIES.reduce<Record<ColumnCategory, ColumnDefinition[]>>((accumulator, category) => {
      accumulator[category] = COLUMN_DEFINITIONS.filter((column) => column.category === category);
      return accumulator;
    }, {} as Record<ColumnCategory, ColumnDefinition[]>);
  }, []);

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDir(key === "player" ? "asc" : "desc");
  }

  function toggleColumn(columnKey: StatColumnKey) {
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
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
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
              {positions.map((filter) => {
                const active = position === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setPosition(filter)}
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

          <label className="space-y-1">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Min games</span>
            <input
              type="number"
              min={0}
              value={minGames}
              onChange={(event) => setMinGames(event.target.value)}
              className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2.5 py-1.5 text-xs text-brand-cream focus:border-brand-green focus:outline-none"
            />
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
            <p className="mt-1 text-sm text-brand-creamDark">Expand a category to add or remove columns.</p>
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
                            key={`${category}:${column.key}`}
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
            {visibleColumns.length > 0 ? (
              visibleColumns.map((column) => (
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
              <span className="text-xs text-brand-creamDark">No columns selected.</span>
            )}
          </div>

          <button
            type="button"
            onClick={clearAllColumns}
            disabled={visibleColumns.length === 0}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
              visibleColumns.length === 0
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
                <button type="button" onClick={() => onSort("player")} className="inline-flex items-center gap-1">
                  <span>Player</span>
                  <span aria-hidden="true">{sortArrow("player")}</span>
                </button>
              </th>
              {visibleColumns.map((column) => (
                <th
                  key={column.key}
                  className="sticky top-0 z-20 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-brand-cream"
                >
                  <button
                    type="button"
                    onClick={() => onSort(column.key)}
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
            {filteredSorted.map((row, index) => {
              const rowHref = `/portal/players/${row.id}`;
              const rowShade = index % 2 === 0 ? "bg-brand-dark/60" : "bg-brand-dark/90";

              return (
                <tr
                  key={row.id}
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
                      <span>{row.player}</span>
                      <AvailabilityIcon
                        chanceOfPlaying={row.chanceOfPlaying}
                        status={row.availabilityStatus}
                        news={row.availabilityNews}
                      />
                    </div>
                    <div className="mt-0.5 text-xs text-brand-creamDark/70">
                      {row.team} / {row.position} / {row.ownershipPct.toFixed(1)}%
                    </div>
                  </td>
                  {visibleColumns.map((column) => {
                    const value = row.windows[selectedWindow][column.key];
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
            {filteredSorted.length === 0 ? (
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
