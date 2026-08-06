"use client";

import type { LeagueRosterData } from "@/lib/portal/leagueRoster";
import type { PlayerTableWindowKey } from "@/lib/portal/playerMetrics";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  corner_kicks: number;
  free_kick_shots: number;
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
  xgPer90: number | null;
  xaPer90: number | null;
  windows: Record<PlayerTableWindowKey, StatsWindowRow>;
};

type StatColumnKey = keyof StatsWindowRow | "xgPer90" | "xaPer90";
type SortKey = "player" | StatColumnKey;

type ColumnCategory = "Attacking" | "Defensive" | "Goalkeeping" | "Discipline" | "Involvement" | "Current Form";

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
  { key: "goals", label: "Goals", category: "Attacking", digits: 0 },
  { key: "assists", label: "Assists", category: "Attacking", digits: 0 },
  { key: "key_passes", label: "Key Passes", category: "Attacking", digits: 0 },
  { key: "shots_on_target", label: "Shots on Target", category: "Attacking", digits: 0 },
  { key: "corner_kicks", label: "Corners", category: "Attacking", digits: 0 },
  { key: "free_kick_shots", label: "FK Shots", category: "Attacking", digits: 0 },
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
  { key: "games_started", label: "Games Started", category: "Involvement", digits: 0 },
  { key: "games_played", label: "Games Played", category: "Involvement", digits: 0 },
  { key: "minutes_played", label: "Minutes Played", category: "Involvement", digits: 0 },
  { key: "penalties_drawn", label: "Penalties Drawn", category: "Involvement", digits: 0 },
  { key: "xgPer90", label: "xG/90", category: "Current Form", digits: 2 },
  { key: "xaPer90", label: "xA/90", category: "Current Form", digits: 2 },
];

const COLUMN_CATEGORIES: ColumnCategory[] = ["Attacking", "Defensive", "Goalkeeping", "Discipline", "Involvement", "Current Form"];
const DEFAULT_SELECTED_COLUMN_KEYS: StatColumnKey[] = ["goals", "assists", "key_passes", "shots_on_target", "corner_kicks", "free_kick_shots", "clean_sheets", "tackles_won", "games_started", "games_played"];
const COLUMN_PRESETS: Array<{ label: string; keys: StatColumnKey[] }> = [
  { label: "Essentials", keys: DEFAULT_SELECTED_COLUMN_KEYS },
  { label: "Attacking", keys: COLUMN_DEFINITIONS.filter((column) => column.category === "Attacking").map((column) => column.key) },
  { label: "Defensive", keys: COLUMN_DEFINITIONS.filter((column) => column.category === "Defensive").map((column) => column.key) },
  { label: "Goalkeeping", keys: COLUMN_DEFINITIONS.filter((column) => column.category === "Goalkeeping").map((column) => column.key) },
  { label: "Discipline", keys: COLUMN_DEFINITIONS.filter((column) => column.category === "Discipline").map((column) => column.key) },
  { label: "Involvement", keys: COLUMN_DEFINITIONS.filter((column) => column.category === "Involvement").map((column) => column.key) },
  { label: "Current Form", keys: COLUMN_DEFINITIONS.filter((column) => column.category === "Current Form").map((column) => column.key) },
];

function formatValue(value: number | null, column: ColumnDefinition): string {
  if (value == null) {
    return "—";
  }

  const digits = column.digits ?? 2;
  return Number.isFinite(value) ? value.toFixed(digits) : (0).toFixed(digits);
}

function columnValue(row: StatsRow, selectedWindow: PlayerTableWindowKey, columnKey: StatColumnKey): number | null {
  if (columnKey === "xgPer90" || columnKey === "xaPer90") {
    return row[columnKey];
  }

  return row.windows[selectedWindow][columnKey];
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

function positionBadgeClass(position: StatsRow["position"]): string {
  if (position === "GK") return "bg-amber-100 text-amber-900";
  if (position === "DEF") return "bg-emerald-200 text-emerald-950";
  if (position === "MID") return "bg-violet-200 text-violet-950";
  return "bg-orange-200 text-orange-950";
}

type InjuryStatusIndicator = {
  className: string;
  label: string;
};

function injuryStatusIndicator(chanceOfPlaying: number | null, status: string | null): InjuryStatusIndicator | null {
  if (chanceOfPlaying == null || chanceOfPlaying === 100) return null;
  if (chanceOfPlaying === 75) return { className: "bg-amber-400 ring-amber-700", label: "Doubtful (75%)" };
  if (chanceOfPlaying === 50) return { className: "bg-amber-500 ring-amber-800", label: "Doubtful (50%)" };
  if (chanceOfPlaying === 25) return { className: "bg-orange-500 ring-orange-800", label: "Doubtful (25%)" };
  if (chanceOfPlaying === 0 && status === "i") return { className: "bg-red-600 ring-red-900", label: "Injured" };
  if (chanceOfPlaying === 0 && status === "s") return { className: "bg-fuchsia-600 ring-fuchsia-900", label: "Suspended" };
  if (chanceOfPlaying === 0 && status === "u") return { className: "bg-slate-500 ring-slate-800", label: "Unavailable" };
  return null;
}

export default function StatsTableClient({ rows, leagueRoster, season, availableSeasons }: { rows: StatsRow[]; leagueRoster: LeagueRosterData | null; season: string; availableSeasons: string[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [position, setPosition] = useState<(typeof positions)[number]>("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [minGames, setMinGames] = useState("0");
  const [ownershipMin, setOwnershipMin] = useState("0");
  const [ownershipMax, setOwnershipMax] = useState("100");
  const [availabilityFilter, setAvailabilityFilter] = useState<"All" | "Available" | "Taken" | "My Team">("All");
  const [selectedWindow, setSelectedWindow] = useState<PlayerTableWindowKey>("season");
  const [selectedColumns, setSelectedColumns] = useState<StatColumnKey[]>(DEFAULT_SELECTED_COLUMN_KEYS);
  const [sortKey, setSortKey] = useState<SortKey>("goals");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);
  const columnPopoverRef = useRef<HTMLDivElement>(null);

  const teams = useMemo(() => {
    return [...new Set(rows.map((row) => row.team))].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const visibleColumns = useMemo(() => {
    return selectedColumns
      .map((key) => COLUMN_DEFINITIONS.find((column) => column.key === key))
      .filter((column): column is ColumnDefinition => Boolean(column));
  }, [selectedColumns]);

  const activePresetLabel = useMemo(() => {
    const selected = new Set(selectedColumns);
    return COLUMN_PRESETS.find((preset) => preset.keys.length === selected.size && preset.keys.every((key) => selected.has(key)))?.label;
  }, [selectedColumns]);

  useEffect(() => {
    if (!isColumnPanelOpen) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!columnPickerRef.current?.contains(target) && !columnPopoverRef.current?.contains(target)) {
        setIsColumnPanelOpen(false);
      }
    };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setIsColumnPanelOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [isColumnPanelOpen]);

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
      const isMyTeam = leagueRoster ? leagueRoster.myTeamPlayerIds.includes(row.id) : false;
      const matchesAvailability =
        availabilityFilter === "All" ||
        (availabilityFilter === "Available" && !isTaken) ||
        (availabilityFilter === "Taken" && isTaken) ||
        (availabilityFilter === "My Team" && isMyTeam);
      return matchesSearch && matchesPosition && matchesTeam && matchesGames && matchesOwnership && matchesAvailability;
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === "player") {
        const comparison = a.player.localeCompare(b.player);
        return sortDir === "asc" ? comparison : -comparison;
      }

      const aValue = columnValue(a, selectedWindow, sortKey) ?? Number.NEGATIVE_INFINITY;
      const bValue = columnValue(b, selectedWindow, sortKey) ?? Number.NEGATIVE_INFINITY;
      return sortDir === "asc" ? aValue - bValue : bValue - aValue;
    });
  }, [availabilityFilter, deferredSearch, leagueRoster, minGames, ownershipMax, ownershipMin, position, rows, selectedWindow, sortDir, sortKey, teamFilter]);

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

      const next = [...current, columnKey];
      return COLUMN_DEFINITIONS.map((column) => column.key).filter((key) => next.includes(key));
    });
  }

  function clearAllColumns() {
    setSelectedColumns([]);
  }

  function selectColumns(columnKeys: StatColumnKey[]) {
    const selected = new Set(columnKeys);
    setSelectedColumns(COLUMN_DEFINITIONS.map((column) => column.key).filter((key) => selected.has(key)));
  }

  function selectSeason(nextSeason: string) {
    router.push(`/portal/stats?season=${encodeURIComponent(nextSeason)}`);
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

      <div className="flex items-center gap-2">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search player…" className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-brand-dark placeholder:text-slate-400 focus:border-brand-green focus:outline-none" />
      </div>

      <div ref={columnPickerRef} className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
            <span className="block font-semibold uppercase tracking-wide text-slate-500">Position</span>
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

          <label className="space-y-1 md:shrink-0">
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
                    onClick={() => setSelectedWindow(option.key)}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                      active
                        ? "border-brand-green bg-brand-green text-brand-cream"
                        : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
            <span className="block font-semibold uppercase tracking-wide text-slate-500">Season</span>
            <select value={season} onChange={(event) => selectSeason(event.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark focus:border-brand-green focus:outline-none">
              {availableSeasons.map((availableSeason) => <option key={availableSeason} value={availableSeason}>{availableSeason}</option>)}
            </select>
          </label>

          <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
            <span className="block font-semibold uppercase tracking-wide text-slate-500">Columns</span>
            <button
              type="button"
              onClick={() => setIsColumnPanelOpen((current) => !current)}
              className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                isColumnPanelOpen
                  ? "border-brand-green bg-brand-green text-brand-cream"
                  : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
              }`}
            >
              {isColumnPanelOpen ? "Hide columns" : "+/- Data"}
            </button>
          </div>
        </div>
      </div>

      {isColumnPanelOpen ? (
        <div ref={columnPopoverRef} className="absolute right-4 z-40 mt-[-0.5rem] w-[30rem] max-w-[calc(100vw-2rem)] rounded-xl border border-brand-cream/20 bg-[#102116] p-4 shadow-xl sm:p-5">
          <div className="mb-4">
            <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-brand-cream">Columns</h2>
            <p className="mt-1 text-sm text-brand-creamDark">Choose the stats to show in the table.</p>
          </div>

          <div className="mb-4 flex flex-wrap gap-2 border-b border-brand-cream/15 pb-4">
            {COLUMN_PRESETS.map((preset) => (
              <button key={preset.label} type="button" onClick={() => selectColumns(preset.keys)} className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${activePresetLabel === preset.label ? "border-brand-green bg-brand-green text-brand-cream" : "border-brand-cream/35 text-brand-cream hover:bg-brand-cream/10"}`}>{preset.label}</button>
            ))}
            <button type="button" onClick={clearAllColumns} className="rounded-md border border-brand-cream/35 px-3 py-1.5 text-xs font-semibold text-brand-cream">Clear all</button>
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

        {/* Active columns — visible inside drawer and on desktop */}
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
          <div className="mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Columns</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {visibleColumns.length > 0 ? (
              visibleColumns.map((column) => (
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

      <div className="max-h-[75vh] overflow-x-auto overflow-y-auto rounded-lg border border-slate-200 bg-white [scrollbar-gutter:stable]">
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
                <button type="button" onClick={() => onSort("player")} className="inline-flex items-center gap-1">
                  <span>Player</span>
                  <span aria-hidden="true">{sortArrow("player")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-20 w-14 min-w-14 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">Team</th>
              <th className="sticky top-0 z-20 w-16 min-w-16 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">Own%</th>
              {visibleColumns.map((column) => (
                <th
                  key={column.key}
                  className="sticky top-0 z-20 w-[88px] min-w-[88px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream"
                >
                  <button
                    type="button"
                    onClick={() => onSort(column.key)}
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
            {filteredSorted.map((row, index) => {
                const rowHref = `/portal/players/${row.id}`;
                const rowShade = index % 2 === 0 ? "bg-white" : "bg-slate-50";
                const overallRank = index + 1;
                const posKey = positionLetter(row.position);
                const rosterTeam = leagueRoster?.teamByPlayerId[row.id];
                const availabilityLabel = rosterTeam ? "Taken" : "Available";
                const injuryIndicator = injuryStatusIndicator(row.chanceOfPlaying, row.availabilityStatus);
                const injuryTitle = row.availabilityNews?.trim() || injuryIndicator?.label;

                return (
                  <tr
                    key={row.id}
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
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${positionBadgeClass(row.position)}`}>{posKey}</span>
                    </td>
                    <td className={`sticky left-[76px] z-20 w-40 min-w-40 border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-brand-dark ${rowShade} group-hover:bg-brand-green/10`}>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span>{row.player}</span>
                          {leagueRoster ? (
                            <span className={rosterTeam ? "text-[10px] font-medium text-slate-500" : "text-[10px] font-medium text-brand-green"}>
                              {availabilityLabel}
                            </span>
                          ) : null}
                          {leagueRoster?.myTeamPlayerIds.includes(row.id) ? <span className="text-[10px] text-brand-green" title="My Team">★</span> : null}
                          {injuryIndicator ? (
                            <span title={injuryTitle} aria-label={injuryTitle} className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ${injuryIndicator.className}`} />
                          ) : null}
                        </span>
                    </td>
                    <td className="border-b border-r border-slate-200 px-2 py-1.5 font-medium text-slate-600">{row.team}</td>
                    <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-medium tabular-nums text-slate-600">{row.ownershipPct.toFixed(1)}%</td>
                    {visibleColumns.map((column) => {
                      const value = columnValue(row, selectedWindow, column.key);

                      return (
                        <td key={column.key} className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                          {formatValue(value, column)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            {filteredSorted.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + 5}
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
