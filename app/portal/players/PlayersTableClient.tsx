"use client";

import type { PlayerTableWindowKey, PlayerWindowStats } from "@/lib/portal/playerMetrics";
import type { LeagueRosterData } from "@/lib/portal/leagueRoster";
import { injuryStatusIndicator } from "@/lib/portal/injuryStatus";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  windows: Partial<Record<PlayerTableWindowKey, PlayerWindowStats>>;
};

type NumericColumnKey = keyof PlayerWindowStats;
type SortKey = "name" | NumericColumnKey;

type PlayersTableClientProps = {
  players: PlayerRow[];
  latestGameweek: number;
  leagueRoster: LeagueRosterData | null;
  season: string;
  availableSeasons: string[];
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
  "ghost_pts_pct",
  "minutes_per_start",
  "games_started",
  "floor_per_start",
  "ceiling_per_start",
];
const COLUMN_PRESETS: Array<{ label: string; keys: NumericColumnKey[] }> = [
  { label: "Essentials", keys: DEFAULT_SELECTED_COLUMN_KEYS },
  { label: "Scoring", keys: COLUMN_DEFINITIONS.filter((column) => column.category === "Scoring").map((column) => column.key) },
  { label: "Everything", keys: COLUMN_DEFINITIONS.map((column) => column.key) },
];

function formatValue(value: number, column: ColumnDefinition): string {
  const digits = column.digits ?? 2;
  if (!Number.isFinite(value)) {
    return column.isPercent ? `0.${"0".repeat(digits)}%` : (0).toFixed(digits);
  }

  const formatted = value.toFixed(digits);
  return column.isPercent ? `${formatted}%` : formatted;
}

function positionLetter(position: PlayerRow["position"]): "G" | "D" | "M" | "F" {
  if (position === "GK") return "G";
  if (position === "DEF") return "D";
  if (position === "MID") return "M";
  return "F";
}

function positionBadgeClass(position: PlayerRow["position"]): string {
  if (position === "GK") return "bg-amber-100 text-amber-900";
  if (position === "DEF") return "bg-emerald-200 text-emerald-950";
  if (position === "MID") return "bg-violet-200 text-violet-950";
  return "bg-orange-200 text-orange-950";
}

export default function PlayersTableClient({ players, latestGameweek, leagueRoster, season, availableSeasons }: PlayersTableClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [positionFilter, setPositionFilter] = useState<(typeof positionFilters)[number]>("All");
  const [availabilityFilter, setAvailabilityFilter] = useState<"All" | "Available" | "Taken" | "My Team">("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [minGames, setMinGames] = useState("0");
  const [ownershipMin, setOwnershipMin] = useState("0");
  const [ownershipMax, setOwnershipMax] = useState("100");
  const [selectedWindow, setSelectedWindow] = useState<PlayerTableWindowKey>("season");
  const [onDemandWindows, setOnDemandWindows] = useState<Partial<Record<"last5" | "last10", Record<string, PlayerWindowStats>>>>({});
  const [isWindowLoading, setIsWindowLoading] = useState(false);
  const [windowLoadError, setWindowLoadError] = useState<string | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<NumericColumnKey[]>(DEFAULT_SELECTED_COLUMN_KEYS);
  const [sortKey, setSortKey] = useState<SortKey>("season_pts");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  const playersWithWindows = useMemo(() => {
    return players.map((player) => ({
      ...player,
      windows: {
        ...player.windows,
        last5: onDemandWindows.last5?.[player.id],
        last10: onDemandWindows.last10?.[player.id],
      },
    }));
  }, [onDemandWindows, players]);

  const teams = useMemo(() => {
    return [...new Set(playersWithWindows.map((player) => player.team))].sort((a, b) => a.localeCompare(b));
  }, [playersWithWindows]);

  const visibleColumns = useMemo(() => {
    return selectedColumns
      .map((key) => COLUMN_DEFINITIONS.find((column) => column.key === key))
      .filter((column): column is ColumnDefinition => Boolean(column));
  }, [selectedColumns]);

  const selectedColumnDefinitions = visibleColumns;

  const activePresetLabel = useMemo(() => {
    const selected = new Set(selectedColumns);
    return COLUMN_PRESETS.find(
      (preset) => preset.keys.length === selected.size && preset.keys.every((key) => selected.has(key))
    )?.label;
  }, [selectedColumns]);

  useEffect(() => {
    if (!isColumnPanelOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(event.target as Node)) {
        setIsColumnPanelOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsColumnPanelOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isColumnPanelOpen]);

  useEffect(() => {
    if (sortKey !== "name" && !visibleColumns.some((column) => column.key === sortKey)) {
      setSortKey("fantasy_pts_per_start");
      setSortDir("desc");
    }
  }, [sortKey, visibleColumns]);

  const filteredAndSorted = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();
    const parsedMinGames = Number(minGames);
    const safeMinGames = Number.isFinite(parsedMinGames) ? parsedMinGames : 0;
    const parsedOwnershipMin = Number(ownershipMin);
    const parsedOwnershipMax = Number(ownershipMax);
    const safeOwnershipMin = Number.isFinite(parsedOwnershipMin) ? parsedOwnershipMin : 0;
    const safeOwnershipMax = Number.isFinite(parsedOwnershipMax) ? parsedOwnershipMax : 100;
    const lowerOwnershipBound = Math.max(0, Math.min(safeOwnershipMin, safeOwnershipMax));
    const upperOwnershipBound = Math.min(100, Math.max(safeOwnershipMin, safeOwnershipMax));

    const filtered = playersWithWindows.filter((player) => {
      const windowStats = player.windows[selectedWindow] ?? player.windows.season;
      if (!windowStats) return false;
      const matchesPosition = positionFilter === "All" || player.position === positionFilter;
      const matchesTeam = teamFilter === "All" || player.team === teamFilter;
      const matchesSearch = !normalizedSearch || player.name.toLowerCase().includes(normalizedSearch);
      const matchesOwnership = player.ownershipPct >= lowerOwnershipBound && player.ownershipPct <= upperOwnershipBound;
      const matchesGames = windowStats.games_started >= safeMinGames;
      const isTaken = leagueRoster ? Boolean(leagueRoster.teamByPlayerId[player.id]) : false;
      const isMyTeam = leagueRoster ? leagueRoster.myTeamPlayerIds.includes(player.id) : false;
      const matchesAvailability =
        availabilityFilter === "All" ||
        (availabilityFilter === "Available" && !isTaken) ||
        (availabilityFilter === "Taken" && isTaken) ||
        (availabilityFilter === "My Team" && isMyTeam);
      return matchesPosition && matchesTeam && matchesSearch && matchesOwnership && matchesGames && matchesAvailability;
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === "name") {
        const comparison = a.name.localeCompare(b.name);
        return sortDir === "asc" ? comparison : -comparison;
      }

      const aValue = (a.windows[selectedWindow] ?? a.windows.season)![sortKey];
      const bValue = (b.windows[selectedWindow] ?? b.windows.season)![sortKey];
      return sortDir === "asc" ? aValue - bValue : bValue - aValue;
    });
  }, [
    availabilityFilter,
    deferredSearch,
    leagueRoster,
    minGames,
    ownershipMax,
    ownershipMin,
    playersWithWindows,
    positionFilter,
    selectedWindow,
    sortDir,
    sortKey,
    teamFilter,
  ]);

  const columnsByCategory = useMemo(() => {
    return COLUMN_CATEGORIES.reduce<Record<ColumnCategory, ColumnDefinition[]>>((accumulator, category) => {
      accumulator[category] = COLUMN_DEFINITIONS.filter((column) => column.category === category);
      return accumulator;
    }, {} as Record<ColumnCategory, ColumnDefinition[]>);
  }, []);

  const hasActiveFilters = useMemo(() => {
    const defaultSet = new Set<NumericColumnKey>(DEFAULT_SELECTED_COLUMN_KEYS);
    const currentSet = new Set(selectedColumns);
    const columnsChanged =
      defaultSet.size !== currentSet.size ||
      DEFAULT_SELECTED_COLUMN_KEYS.some((k) => !currentSet.has(k));
    return (
      positionFilter !== "All" ||
      availabilityFilter !== "All" ||
      teamFilter !== "All" ||
      search !== "" ||
      minGames !== "0" ||
      ownershipMin !== "0" ||
      ownershipMax !== "100" ||
      columnsChanged
    );
  }, [positionFilter, availabilityFilter, teamFilter, search, ownershipMin, ownershipMax, selectedColumns]);

  // On mobile, only show the first stat column to avoid horizontal scroll
  const displayColumns = visibleColumns;

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

      const next = [...current, columnKey];
      return COLUMN_DEFINITIONS.map((column) => column.key).filter((key) => next.includes(key));
    });
  }

  function clearAllColumns() {
    setSelectedColumns([]);
  }

  function selectColumns(columnKeys: NumericColumnKey[]) {
    const selected = new Set(columnKeys);
    setSelectedColumns(COLUMN_DEFINITIONS.map((column) => column.key).filter((key) => selected.has(key)));
  }

  function selectSeason(nextSeason: string) {
    const params = new URLSearchParams({ tab: "players", season: nextSeason });
    router.push(`/portal/players?${params.toString()}`);
  }

  async function selectWindow(nextWindow: PlayerTableWindowKey) {
    if (isWindowLoading || nextWindow === selectedWindow) return;
    if (nextWindow === "season" || onDemandWindows[nextWindow]) {
      setSelectedWindow(nextWindow);
      return;
    }

    setIsWindowLoading(true);
    setWindowLoadError(null);
    try {
      const params = new URLSearchParams({ season, window: nextWindow, latestGameweek: String(latestGameweek) });
      const response = await fetch(`/api/portal/players/window?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as { message?: string; statsByPlayerId?: Record<string, PlayerWindowStats> };
      if (!response.ok || !payload.statsByPlayerId) {
        throw new Error(payload.message ?? "Unable to load player window data.");
      }

      setOnDemandWindows((current) => ({ ...current, [nextWindow]: payload.statsByPlayerId }));
      setSelectedWindow(nextWindow);
    } catch (error) {
      setWindowLoadError(error instanceof Error ? error.message : "Unable to load player window data.");
    } finally {
      setIsWindowLoading(false);
    }
  }

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕");

  return (
    <div className="space-y-3">
      {/* Search + Filters inline row */}
      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search player…"
          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-brand-dark placeholder:text-slate-400 focus:border-brand-green focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className="relative shrink-0 flex items-center gap-1.5 rounded-xl border border-brand-greenLight bg-brand-green px-3 py-2 text-sm font-semibold text-brand-cream md:hidden"
        >
          {hasActiveFilters ? (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-white ring-2 ring-brand-dark" aria-hidden="true" />
          ) : null}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
            <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z" clipRule="evenodd" />
          </svg>
          +/- Data
        </button>
      </div>

      {/* Filters — hidden on mobile until button tapped, always visible on md+ */}
      <div
        className={
          mobileFiltersOpen
            ? "fixed inset-0 z-50 flex flex-col bg-brand-dark md:static md:inset-auto md:flex md:flex-none md:bg-transparent"
            : "hidden md:block md:space-y-3"
        }
      >
        {/* Scrollable filter content */}
        <div className={mobileFiltersOpen ? "flex-1 space-y-3 overflow-y-auto p-4" : "space-y-3"}>
          {mobileFiltersOpen ? (
            <span className="block text-sm font-bold uppercase tracking-widest text-brand-cream md:hidden">Filters</span>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-end gap-2 text-xs">
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
                        className={`rounded border px-2 py-1 text-[11px] font-semibold ${
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

              {leagueRoster ? (
                <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                  <span className="block font-semibold uppercase tracking-wide text-slate-500">Availability</span>
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
                              : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                    {leagueRoster.myTeamPlayerIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setAvailabilityFilter("My Team")}
                        className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                          availabilityFilter === "My Team"
                            ? "border-brand-green bg-brand-green text-brand-cream"
                            : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                        }`}
                      >
                        My Team
                      </button>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
              <label className="space-y-1">
                <span className="block font-semibold uppercase tracking-wide text-slate-500">Team</span>
                <select
                  value={teamFilter}
                  onChange={(event) => setTeamFilter(event.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark focus:border-brand-green focus:outline-none md:w-24"
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
                <span className="block font-semibold uppercase tracking-wide text-slate-500">Min games</span>
                <input
                  type="number"
                  min={0}
                  value={minGames}
                  onChange={(event) => setMinGames(event.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark focus:border-brand-green focus:outline-none md:w-16"
                />
              </label>

              <div className="space-y-1">
                <span className="block font-semibold uppercase tracking-wide text-slate-500">Ownership %</span>
                <div className="grid grid-cols-2 gap-1 md:flex">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={ownershipMin}
                    onChange={(event) => setOwnershipMin(event.target.value)}
                    placeholder="Min"
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark md:w-16"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={ownershipMax}
                    onChange={(event) => setOwnershipMax(event.target.value)}
                    placeholder="Max"
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark md:w-16"
                  />
                </div>
              </div>
            </div>

              <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                <span className="block font-semibold uppercase tracking-wide text-slate-500">Window</span>
                <div className="flex flex-nowrap gap-1">
                  {WINDOW_OPTIONS.map((option) => {
                    const active = selectedWindow === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => void selectWindow(option.key)}
                        disabled={isWindowLoading}
                        className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                          active
                            ? "border-brand-green bg-brand-green text-brand-cream"
                            : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                        } disabled:cursor-wait disabled:opacity-60`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {windowLoadError ? <p className="text-[11px] font-medium text-red-700">{windowLoadError}</p> : null}
              </div>

              <label className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                <span className="block font-semibold uppercase tracking-wide text-slate-500">Season</span>
                <select
                  value={season}
                  onChange={(event) => selectSeason(event.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark focus:border-brand-green focus:outline-none"
                >
                  {availableSeasons.map((availableSeason) => (
                    <option key={availableSeason} value={availableSeason}>{availableSeason}</option>
                  ))}
                </select>
              </label>

              <div ref={columnPickerRef} className="relative space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                <span className="block font-semibold uppercase tracking-wide text-slate-500">Columns</span>
                <button
                  type="button"
                  onClick={() => setIsColumnPanelOpen((current) => !current)}
                  aria-expanded={isColumnPanelOpen}
                  aria-controls="players-column-picker"
                  className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                    isColumnPanelOpen
                      ? "border-brand-green bg-brand-green text-brand-cream"
                      : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                  }`}
                >
                  {isColumnPanelOpen ? "Hide columns" : "+/- Data"}
                </button>
                {isColumnPanelOpen ? (
                  <div id="players-column-picker" className="absolute right-0 top-full z-40 mt-2 w-[30rem] max-w-[calc(100vw-2rem)] rounded-xl border border-brand-cream/20 bg-[#102116] p-4 shadow-xl sm:p-5">
                    <div className="mb-3">
                      <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-brand-cream">Columns</h2>
                      <p className="mt-1 text-sm text-brand-creamDark">Choose the stats to show in the table.</p>
                    </div>

                    <div className="mb-4 flex flex-wrap gap-2 border-b border-brand-cream/15 pb-4">
                      {COLUMN_PRESETS.map((preset) => {
                        const active = activePresetLabel === preset.label;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => selectColumns(preset.keys)}
                            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                              active
                                ? "border-brand-green bg-brand-green text-brand-cream"
                                : "border-brand-cream/35 text-brand-cream hover:bg-brand-cream/10"
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                      <button type="button" onClick={clearAllColumns} disabled={selectedColumnDefinitions.length === 0} className="rounded-md border border-brand-cream/35 px-3 py-1.5 text-xs font-semibold text-brand-cream transition-colors hover:bg-brand-cream/10 disabled:cursor-not-allowed disabled:opacity-40">
                        Clear all
                      </button>
                    </div>

                    <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
                      {COLUMN_CATEGORIES.map((category) => {
                        const categoryColumns = columnsByCategory[category];
                        return (
                          <section key={category}>
                            <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-brand-creamDark">{category}</h3>
                            <div className="grid gap-x-5 sm:grid-cols-2">
                              {categoryColumns.map((column) => {
                                const checked = selectedColumns.includes(column.key);
                                return (
                                  <label key={column.key} className="flex items-center gap-2 border-b border-brand-cream/10 py-2 text-sm text-brand-cream hover:bg-brand-cream/5">
                                    <input type="checkbox" checked={checked} onChange={() => toggleColumn(column.key)} className="h-4 w-4 rounded border-brand-cream/35 bg-brand-dark text-brand-green focus:ring-brand-green" />
                                    <span className="leading-snug">{column.label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

            </div>
          </div>

          {/* Active columns */}
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
            <div className="mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Columns</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedColumnDefinitions.length > 0 ? (
                selectedColumnDefinitions.map((column) => (
                  <span
                    key={column.key}
                    className="inline-flex items-center gap-2 rounded-full border border-brand-green/30 bg-brand-green/10 px-3 py-1 text-xs font-semibold text-brand-dark"
                  >
                    <span>{column.label}</span>
                    <button
                      type="button"
                      onClick={() => toggleColumn(column.key)}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] text-brand-dark/60 hover:bg-brand-green/20 hover:text-brand-dark"
                      aria-label={`Remove ${column.label}`}
                    >
                      ×
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">No optional columns selected.</span>
              )}
            </div>
          </div>
        </div>

        {/* Sticky Done button — mobile drawer footer only */}
        {mobileFiltersOpen ? (
          <div className="sticky bottom-0 border-t border-brand-cream/20 bg-brand-dark p-4 md:hidden">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="w-full rounded-full bg-brand-green px-4 py-3 text-sm font-semibold text-brand-cream"
            >
              Done
            </button>
          </div>
        ) : null}
      </div>

      {/* Table — single overflow-auto container for both axes so sticky works */}
      <div className="relative max-h-[75vh] overflow-x-auto overflow-y-auto rounded-lg border border-slate-200 bg-white [scrollbar-gutter:stable]">
        {isWindowLoading ? <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/70 text-sm font-semibold text-brand-dark backdrop-blur-[1px]">Loading window data…</div> : null}
        <table className="w-max border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 w-9 min-w-9 border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                #
              </th>
              <th className="sticky left-9 top-0 z-30 w-10 min-w-10 border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                Pos
              </th>
              <th className="sticky left-[76px] top-0 z-30 w-40 min-w-40 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("name")} className="inline-flex items-center gap-1">
                  <span>Player</span>
                  <span aria-hidden="true">{sortArrow("name")}</span>
                </button>
              </th>
              {/* Future ADP column belongs here, between Player and Team. */}
              <th className="sticky top-0 z-20 w-14 min-w-14 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                Team
              </th>
              <th className="sticky top-0 z-20 w-16 min-w-16 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                Own%
              </th>
              {displayColumns.map((column) => (
                <th
                  key={column.key}
                  className="sticky top-0 z-20 w-[88px] min-w-[88px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream"
                >
                  <button
                    type="button"
                    onClick={() => handleSort(column.key)}
                    className="inline-flex w-full items-center justify-end gap-1"
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
              const rowShade = index % 2 === 0 ? "bg-white" : "bg-slate-50";
              const overallRank = index + 1;
              const posKey = positionLetter(player.position);
              const rosterTeam = leagueRoster?.teamByPlayerId[player.id];
              const availabilityLabel = rosterTeam ? "Taken" : "Available";
              const injuryIndicator = injuryStatusIndicator(player.chanceOfPlaying, player.availabilityStatus);
              const injuryTitle = player.availabilityNews?.trim() || injuryIndicator?.label;
              const windowStats = player.windows[selectedWindow] ?? player.windows.season!;

              return (
                <tr
                  key={player.id}
                  className={`group ${rowShade} cursor-pointer text-brand-dark transition-colors hover:bg-brand-green/10`}
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
                  <td className={`sticky left-0 z-20 w-9 min-w-9 border-b border-r border-slate-200 px-1 py-1.5 text-center font-semibold tabular-nums text-slate-500 ${rowShade} group-hover:bg-brand-green/10`}>
                    {overallRank}
                  </td>
                  <td className={`sticky left-9 z-20 w-10 min-w-10 border-b border-r border-slate-200 px-1 py-1.5 text-center ${rowShade} group-hover:bg-brand-green/10`}>
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${positionBadgeClass(player.position)}`}>
                      {posKey}
                    </span>
                  </td>
                  <td className={`sticky left-[76px] z-20 w-40 min-w-40 border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-brand-dark ${rowShade} group-hover:bg-brand-green/10`}>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span>{player.name}</span>
                      {leagueRoster ? (
                        <span className={rosterTeam ? "text-[10px] font-medium text-slate-500" : "text-[10px] font-medium text-brand-green"}>
                          {availabilityLabel}
                        </span>
                      ) : null}
                      {leagueRoster?.myTeamPlayerIds.includes(player.id) ? <span className="text-[10px] text-brand-green" title="My Team">★</span> : null}
                      {injuryIndicator ? (
                        <span
                          title={injuryTitle}
                          aria-label={injuryTitle}
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ${injuryIndicator.className}`}
                        />
                      ) : null}
                    </span>
                  </td>
                  <td className="border-b border-r border-slate-200 px-2 py-1.5 font-medium text-slate-600">{player.team}</td>
                  <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-medium tabular-nums text-slate-600">
                    {player.ownershipPct.toFixed(1)}%
                  </td>
                  {displayColumns.map((column) => {
                    const value = windowStats[column.key];

                    return (
                      <td key={column.key} className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                        {formatValue(value, column)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td
                  colSpan={displayColumns.length + 5}
                  className="border-b border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-500"
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
