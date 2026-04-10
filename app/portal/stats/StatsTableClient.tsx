"use client";

import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";
import RosterPill from "@/app/components/ui/RosterPill";
import type { LeagueRosterData } from "@/lib/portal/leagueRoster";
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

type ColumnCategory = "Attacking" | "Defensive" | "Goalkeeping" | "Discipline" | "Involvement";

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
  { key: "yellow_cards", label: "Yellow Cards", category: "Discipline", digits: 0 },
  { key: "red_cards", label: "Red Cards", category: "Discipline", digits: 0 },
  { key: "own_goals", label: "Own Goals", category: "Discipline", digits: 0 },
  { key: "penalties_missed", label: "Penalties Missed", category: "Discipline", digits: 0 },
  { key: "games_played", label: "Games Played", category: "Involvement", digits: 0 },
  { key: "minutes_played", label: "Minutes Played", category: "Involvement", digits: 0 },
  { key: "penalties_drawn", label: "Penalties Drawn", category: "Involvement", digits: 0 },
];

const COLUMN_CATEGORIES: ColumnCategory[] = ["Attacking", "Defensive", "Goalkeeping", "Discipline", "Involvement"];
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

function positionLetter(position: StatsRow["position"]): "G" | "D" | "M" | "F" {
  if (position === "GK") {
    return "G";
  }
  if (position === "DEF") {
    return "D";
  }
  if (position === "MID") {
    return "M";
  }
  return "F";
}

export default function StatsTableClient({ rows, leagueRoster }: { rows: StatsRow[]; leagueRoster: LeagueRosterData | null }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [position, setPosition] = useState<(typeof positions)[number]>("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [minGames, setMinGames] = useState("0");
  const [ownershipMin, setOwnershipMin] = useState("0");
  const [ownershipMax, setOwnershipMax] = useState("100");
  const [availabilityFilter, setAvailabilityFilter] = useState<"All" | "Available" | "Taken">("All");
  const [selectedWindow, setSelectedWindow] = useState<PlayerTableWindowKey>("season");
  const [selectedColumns, setSelectedColumns] = useState<StatColumnKey[]>(DEFAULT_SELECTED_COLUMN_KEYS);
  const [sortKey, setSortKey] = useState<SortKey>("goals");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<ColumnCategory, boolean>>({
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
      const isTaken = leagueRoster ? Boolean(leagueRoster.teamByPlayerId[row.id]) : false;
      const matchesAvailability =
        availabilityFilter === "All" ||
        (availabilityFilter === "Available" && !isTaken) ||
        (availabilityFilter === "Taken" && isTaken);
      return matchesSearch && matchesPosition && matchesTeam && matchesGames && matchesOwnership && matchesAvailability;
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
  }, [availabilityFilter, deferredSearch, leagueRoster, minGames, ownershipMax, ownershipMin, position, rows, selectedWindow, sortDir, sortKey, teamFilter]);

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

  const hasActiveFilters = useMemo(() => {
    const defaultSet = new Set<StatColumnKey>(DEFAULT_SELECTED_COLUMN_KEYS);
    const currentSet = new Set(selectedColumns);
    const columnsChanged =
      defaultSet.size !== currentSet.size ||
      DEFAULT_SELECTED_COLUMN_KEYS.some((k) => !currentSet.has(k));
    return (
      position !== "All" ||
      availabilityFilter !== "All" ||
      teamFilter !== "All" ||
      search !== "" ||
      minGames !== "0" ||
      ownershipMin !== "0" ||
      ownershipMax !== "100" ||
      columnsChanged
    );
  }, [position, availabilityFilter, teamFilter, search, minGames, ownershipMin, ownershipMax, selectedColumns]);

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
      {/* Filters — hidden on mobile until button tapped, always visible on md+ */}
      <div
        className={
          mobileFiltersOpen
            ? "fixed inset-0 z-50 space-y-3 overflow-y-auto bg-brand-dark p-4 pb-24 md:static md:inset-auto md:z-auto md:overflow-visible md:bg-transparent md:p-0"
            : "hidden md:block md:space-y-3"
        }
      >
        {mobileFiltersOpen ? (
          <div className="flex items-center justify-between md:hidden">
            <span className="text-sm font-bold uppercase tracking-widest text-brand-cream">Filters</span>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="rounded-full border border-brand-cream/35 px-4 py-1.5 text-sm font-semibold text-brand-cream"
            >
              Done
            </button>
          </div>
        ) : null}

      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-3 py-2">
        <div className="grid grid-cols-2 gap-2 text-xs md:flex md:flex-nowrap md:items-end md:gap-2">
          <label className="space-y-1 md:shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Search player</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Player"
              className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream placeholder:text-brand-creamDark focus:border-brand-green focus:outline-none md:w-40"
            />
          </label>

          <div className="col-span-2 space-y-1 md:col-span-1 md:shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Position</span>
            <div className="flex flex-nowrap gap-1">
              {positions.map((filter) => {
                const active = position === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setPosition(filter)}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold ${
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
            <div className="col-span-2 space-y-1 md:col-span-1 md:shrink-0">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Availability</span>
              <div className="flex flex-nowrap gap-1">
                {(["All", "Available", "Taken"] as const).map((option) => {
                  const active = availabilityFilter === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setAvailabilityFilter(option)}
                      className={`rounded border px-2 py-1 text-[11px] font-semibold ${
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

          <label className="space-y-1 md:shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Team</span>
            <select
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
              className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream focus:border-brand-green focus:outline-none md:w-24"
            >
              <option value="All">All</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 md:shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Min games</span>
            <input
              type="number"
              min={0}
              value={minGames}
              onChange={(event) => setMinGames(event.target.value)}
              className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream focus:border-brand-green focus:outline-none md:w-16"
            />
          </label>

          <div className="col-span-2 space-y-1 md:col-span-1 md:shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Ownership %</span>
            <div className="grid grid-cols-2 gap-1 md:flex">
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={ownershipMin}
                onChange={(event) => setOwnershipMin(event.target.value)}
                placeholder="Min"
                className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream md:w-16"
              />
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={ownershipMax}
                onChange={(event) => setOwnershipMax(event.target.value)}
                placeholder="Max"
                className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream md:w-16"
              />
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-2 border-t border-brand-cream/10 pt-2">
          <div className="space-y-1">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Window</span>
            <div className="flex flex-nowrap gap-1">
              {WINDOW_OPTIONS.map((option) => {
                const active = selectedWindow === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSelectedWindow(option.key)}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold ${
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
            className={`rounded border px-2 py-1 text-xs font-semibold ${
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

        {/* Active columns — visible inside drawer and on desktop */}
        <div className="rounded-xl border border-brand-cream/20 bg-brand-dark/40 px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-creamDark">Active Columns</span>
            <button
              type="button"
              onClick={clearAllColumns}
              disabled={visibleColumns.length === 0}
              className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                visibleColumns.length === 0
                  ? "cursor-not-allowed border-brand-cream/10 text-brand-creamDark/50"
                  : "border-brand-cream/35 text-brand-cream"
              }`}
            >
              Clear all
            </button>
          </div>
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
        </div>
      </div>{/* end filter wrapper */}

      {/* Floating Filters button — mobile only */}
      <button
        type="button"
        onClick={() => setMobileFiltersOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-brand-green px-5 py-3 text-sm font-semibold text-brand-cream shadow-lg shadow-black/40 md:hidden"
      >
        {hasActiveFilters ? (
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-white ring-2 ring-brand-dark" aria-hidden="true" />
        ) : null}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z" clipRule="evenodd" />
        </svg>
        Filters
      </button>

      <div className="overflow-x-auto rounded-xl border border-brand-cream/20 [scrollbar-gutter:stable]">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-20 text-brand-creamDark">
            <tr>
              <th className="sticky left-0 top-0 z-30 w-[48px] min-w-[48px] border-b border-r border-brand-cream/25 bg-[#1A4D2E] px-1.5 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
                #
              </th>
              <th className="sticky left-[48px] top-0 z-30 w-[120px] min-w-[120px] max-w-[120px] overflow-hidden border-b border-r border-brand-cream/25 bg-[#1A4D2E] px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-brand-creamDark md:w-[220px] md:min-w-[220px] md:max-w-[220px]">
                <button type="button" onClick={() => onSort("player")} className="inline-flex items-center gap-1">
                  <span>Player</span>
                  <span aria-hidden="true">{sortArrow("player")}</span>
                </button>
              </th>
              {visibleColumns.map((column) => (
                <th
                  key={column.key}
                  className="sticky top-0 z-20 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-brand-cream"
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
            {(() => {
              const posCounters: Record<string, number> = {};
              return filteredSorted.map((row, index) => {
                const rowHref = `/portal/players/${row.id}`;
                const rowShade = index % 2 === 0 ? "bg-brand-dark/60" : "bg-brand-dark/90";
                const overallRank = index + 1;
                const posKey = positionLetter(row.position);
                posCounters[posKey] = (posCounters[posKey] ?? 0) + 1;
                const posRank = posCounters[posKey];

                return (
                  <tr
                    key={row.id}
                    className={`${rowShade} cursor-pointer text-brand-cream`}
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
                    <td className={`sticky left-0 z-20 w-[48px] min-w-[48px] border-b border-r border-brand-cream/10 px-1.5 py-1.5 text-center ${rowShade}`}>
                      <div className="text-sm font-bold text-brand-cream">{overallRank}</div>
                      <div className="text-xs text-brand-creamDark/80">
                        {posKey} #{posRank}
                      </div>
                    </td>
                    <td className={`sticky left-[48px] z-20 w-[120px] min-w-[120px] max-w-[120px] overflow-hidden border-b border-r border-brand-cream/10 px-2 py-1.5 font-semibold text-brand-cream md:w-[220px] md:min-w-[220px] md:max-w-[220px] ${rowShade}`}>
                      <div className="truncate text-sm leading-tight md:overflow-visible md:whitespace-normal">
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <span>{row.player}</span>
                          <AvailabilityIcon
                            chanceOfPlaying={row.chanceOfPlaying}
                            status={row.availabilityStatus}
                            news={row.availabilityNews}
                          />
                          <RosterPill playerId={row.id} leagueRoster={leagueRoster} />
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-brand-creamDark/70 md:overflow-visible md:whitespace-normal">
                        {row.team} / {row.position} / {row.ownershipPct.toFixed(1)}%
                      </div>
                    </td>
                    {visibleColumns.map((column) => {
                      const value = row.windows[selectedWindow][column.key];
                      const range = visibleRanges[column.key];

                      return (
                        <td key={column.key} className={`border-b border-r border-brand-cream/10 px-2 py-1.5 text-center ${rowShade}`}>
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
              });
            })()}
            {filteredSorted.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + 2}
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
