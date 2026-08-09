"use client";

import type { DecoratedGameweek } from "@/lib/portal/playerMetrics";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type GameweekColumnKey =
  | "minutes_played"
  | "games_started"
  | "raw_fantrax_pts"
  | "ghost_pts"
  | "goals"
  | "assists"
  | "clean_sheet"
  | "saves"
  | "key_passes"
  | "shots_on_target"
  | "tackles_won"
  | "interceptions"
  | "clearances"
  | "aerials_won"
  | "accurate_crosses"
  | "blocked_shots"
  | "dribbles_succeeded"
  | "dispossessed"
  | "goals_against"
  | "goals_against_outfield"
  | "yellow_cards"
  | "red_cards"
  | "own_goals"
  | "subbed_on"
  | "subbed_off"
  | "penalty_saves"
  | "high_claims"
  | "smothers"
  | "penalties_drawn"
  | "corner_kicks"
  | "free_kick_shots";

type SortKey = "gameweek" | "opponent" | "fdr" | GameweekColumnKey;

type ColumnCategory = "Fantasy" | "Involvement" | "Attacking" | "Defensive" | "Goalkeeping";

type ColumnDefinition = {
  key: GameweekColumnKey;
  label: string;
  category: ColumnCategory;
  digits?: number;
};

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  // Fantasy
  { key: "raw_fantrax_pts", label: "Pts", category: "Fantasy", digits: 2 },
  { key: "ghost_pts", label: "Ghost Pts", category: "Fantasy", digits: 2 },
  // Involvement
  { key: "games_started", label: "Started", category: "Involvement", digits: 0 },
  { key: "minutes_played", label: "Mins", category: "Involvement", digits: 0 },
  // Attacking
  { key: "goals", label: "Goals", category: "Attacking", digits: 0 },
  { key: "assists", label: "Assists", category: "Attacking", digits: 0 },
  { key: "key_passes", label: "Key Passes", category: "Attacking", digits: 0 },
  { key: "shots_on_target", label: "Shots on Target", category: "Attacking", digits: 0 },
  { key: "corner_kicks", label: "CK", category: "Attacking", digits: 0 },
  { key: "free_kick_shots", label: "FKS", category: "Attacking", digits: 0 },
  { key: "dribbles_succeeded", label: "Dribbles", category: "Attacking", digits: 0 },
  { key: "accurate_crosses", label: "Crosses", category: "Attacking", digits: 0 },
  { key: "penalties_drawn", label: "Pens Drawn", category: "Attacking", digits: 0 },
  // Defensive
  { key: "clean_sheet", label: "CS", category: "Defensive", digits: 0 },
  { key: "tackles_won", label: "Tackles", category: "Defensive", digits: 0 },
  { key: "interceptions", label: "Interceptions", category: "Defensive", digits: 0 },
  { key: "clearances", label: "Clearances", category: "Defensive", digits: 0 },
  { key: "aerials_won", label: "Aerials", category: "Defensive", digits: 0 },
  { key: "blocked_shots", label: "Blocked Shots", category: "Defensive", digits: 0 },
  { key: "dispossessed", label: "Dispossessed", category: "Defensive", digits: 0 },
  { key: "goals_against", label: "GA", category: "Defensive", digits: 0 },
  { key: "goals_against_outfield", label: "GA (Outfield)", category: "Defensive", digits: 0 },
  { key: "yellow_cards", label: "Yellow Cards", category: "Defensive", digits: 0 },
  { key: "red_cards", label: "Red Cards", category: "Defensive", digits: 0 },
  { key: "own_goals", label: "Own Goals", category: "Defensive", digits: 0 },
  { key: "subbed_on", label: "Subbed On", category: "Involvement", digits: 0 },
  { key: "subbed_off", label: "Subbed Off", category: "Involvement", digits: 0 },
  // Goalkeeping
  { key: "saves", label: "Saves", category: "Goalkeeping", digits: 0 },
  { key: "penalty_saves", label: "Pen Saves", category: "Goalkeeping", digits: 0 },
  { key: "high_claims", label: "High Claims", category: "Goalkeeping", digits: 0 },
  { key: "smothers", label: "Smothers", category: "Goalkeeping", digits: 0 },
];

const COLUMN_CATEGORIES: ColumnCategory[] = ["Fantasy", "Involvement", "Attacking", "Defensive", "Goalkeeping"];

const DEFAULT_SELECTED_COLUMNS: GameweekColumnKey[] = [
  "minutes_played",
  "games_started",
  "raw_fantrax_pts",
  "ghost_pts",
  "goals",
  "assists",
];

const MAX_SELECTED_COLUMNS = 6;

function fdrColor(rank: number | undefined): string {
  if (rank == null) return "bg-slate-100 text-slate-500";
  if (rank <= 4) return "bg-red-100 text-red-800";
  if (rank <= 8) return "bg-orange-100 text-orange-800";
  if (rank <= 12) return "bg-yellow-100 text-yellow-800";
  if (rank <= 16) return "bg-lime-100 text-lime-800";
  return "bg-green-100 text-green-800";
}

function formatCellValue(value: number, digits: number): string {
  return value.toFixed(digits);
}

type Props = {
  rows: DecoratedGameweek[];
  teamNames: Record<string, string>;
  fdrRankByTeam: Record<string, number>;
  season: string;
  availableSeasons: string[];
};

export default function PlayerGameweekTableClient({ rows, teamNames, fdrRankByTeam, season, availableSeasons }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedColumns, setSelectedColumns] = useState<GameweekColumnKey[]>(DEFAULT_SELECTED_COLUMNS);
  const [homeAwayFilter, setHomeAwayFilter] = useState<"All" | "Home" | "Away">("All");
  const [appearanceFilter, setAppearanceFilter] = useState<Set<"Started" | "Sub" | "DNP">>(
    new Set(["Started", "Sub", "DNP"])
  );
  const [fdrMin, setFdrMin] = useState("1");
  const [fdrMax, setFdrMax] = useState("20");
  const [sortKey, setSortKey] = useState<SortKey>("gameweek");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<ColumnCategory, boolean>>({
    Fantasy: false,
    Involvement: false,
    Attacking: false,
    Defensive: false,
    Goalkeeping: false,
  });

  const hasReachedColumnLimit = selectedColumns.length >= MAX_SELECTED_COLUMNS;

  const visibleColumns = useMemo(
    () =>
      selectedColumns
        .map((key) => COLUMN_DEFINITIONS.find((col) => col.key === key))
        .filter((col): col is ColumnDefinition => Boolean(col)),
    [selectedColumns]
  );

  const columnsByCategory = useMemo(
    () =>
      COLUMN_CATEGORIES.reduce<Record<ColumnCategory, ColumnDefinition[]>>((acc, cat) => {
        acc[cat] = COLUMN_DEFINITIONS.filter((col) => col.category === cat);
        return acc;
      }, {} as Record<ColumnCategory, ColumnDefinition[]>),
    []
  );

  const parsedFdrMin = Math.max(1, Math.min(20, Number(fdrMin) || 1));
  const parsedFdrMax = Math.max(1, Math.min(20, Number(fdrMax) || 20));
  const fdrLow = Math.min(parsedFdrMin, parsedFdrMax);
  const fdrHigh = Math.max(parsedFdrMin, parsedFdrMax);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (homeAwayFilter === "Home" && row.isHome !== true) return false;
      if (homeAwayFilter === "Away" && row.isHome !== false) return false;
      const opponent = row.opponents.length > 0 ? row.opponents[0] : row.opponent;
      const fdr = opponent ? (fdrRankByTeam[opponent] ?? 10) : 10;
      if (fdr < fdrLow || fdr > fdrHigh) return false;
      const isStarted = row.games_started >= 1;
      const isSub = row.games_played > 0 && row.games_started === 0;
      const isDnp = row.games_played === 0;
      if (isStarted && !appearanceFilter.has("Started")) return false;
      if (isSub && !appearanceFilter.has("Sub")) return false;
      if (isDnp && !appearanceFilter.has("DNP")) return false;
      return true;
    });
  }, [rows, homeAwayFilter, fdrLow, fdrHigh, fdrRankByTeam, appearanceFilter]);

  const tally = useMemo(() => {
    const n = filteredRows.length;
    if (n === 0) return null;
    const avgs: Record<GameweekColumnKey, number> = {} as Record<GameweekColumnKey, number>;
    for (const col of visibleColumns) {
      const sum = filteredRows.reduce((acc, row) => {
        const raw = (row as Record<string, unknown>)[col.key];
        return acc + (typeof raw === "number" ? raw : Number(raw ?? 0));
      }, 0);
      avgs[col.key] = sum / n;
    }
    return { avgs, n };
  }, [filteredRows, visibleColumns]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let comparison = 0;
      if (sortKey === "gameweek") {
        comparison = a.gameweek - b.gameweek;
      } else if (sortKey === "opponent") {
        const aOpp = a.opponent ?? "";
        const bOpp = b.opponent ?? "";
        comparison = aOpp.localeCompare(bOpp);
      } else if (sortKey === "fdr") {
        const aOpp = a.opponents.length > 0 ? a.opponents[0] : a.opponent;
        const bOpp = b.opponents.length > 0 ? b.opponents[0] : b.opponent;
        const aFdr = aOpp ? (fdrRankByTeam[aOpp] ?? 10) : 10;
        const bFdr = bOpp ? (fdrRankByTeam[bOpp] ?? 10) : 10;
        comparison = aFdr - bFdr;
      } else {
        const aVal = (a as Record<string, unknown>)[sortKey] as number;
        const bVal = (b as Record<string, unknown>)[sortKey] as number;
        comparison = (aVal ?? 0) - (bVal ?? 0);
      }
      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [filteredRows, sortKey, sortDir, fdrRankByTeam]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "opponent" ? "asc" : "desc");
    }
  }

  function toggleColumn(key: GameweekColumnKey) {
    setSelectedColumns((current) => {
      if (current.includes(key)) return current.filter((k) => k !== key);
      if (current.length >= MAX_SELECTED_COLUMNS) return current;
      const next = [...current, key];
      return COLUMN_DEFINITIONS.map((col) => col.key).filter((k) => next.includes(k));
    });
  }

  function toggleAppearance(type: "Started" | "Sub" | "DNP") {
    setAppearanceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  function toggleCategory(cat: ColumnCategory) {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  function selectSeason(nextSeason: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("season", nextSeason);
    router.push(`${pathname}?${params.toString()}`);
  }

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕");

  function renderOpponent(row: DecoratedGameweek): string {
    if (row.opponents.length > 1) {
      return row.opponents.map((o, i) => `${teamNames[o] ?? o} (${row.isHomeAll[i] ? "H" : "A"})`).join(" / ");
    }
    return row.opponent ? (teamNames[row.opponent] ?? row.opponent) : "-";
  }

  function renderHomeAway(row: DecoratedGameweek): string {
    if (row.isHomeAll.length === 2) {
      return row.isHomeAll.map((h) => (h ? "H" : "A")).join(" / ");
    }
    if (row.isHome == null) return "-";
    return row.isHome ? "H" : "A";
  }

  function renderFdr(row: DecoratedGameweek): number | undefined {
    const opponent = row.opponents.length > 0 ? row.opponents[0] : row.opponent;
    if (!opponent) return undefined;
    return fdrRankByTeam[opponent] ?? 10;
  }

  return (
    <div className="space-y-3">
      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <label className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Season</span>
          <select
            value={season}
            onChange={(event) => selectSeason(event.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark focus:border-brand-green focus:outline-none"
          >
            {availableSeasons.map((availableSeason) => (
              <option key={availableSeason} value={availableSeason}>
                {availableSeason}
              </option>
            ))}
          </select>
        </label>

        {/* H/A filter */}
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">H/A</span>
          {(["All", "Home", "Away"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setHomeAwayFilter(opt)}
              className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                homeAwayFilter === opt
                  ? "bg-brand-green text-brand-cream"
                  : "text-brand-dark hover:bg-slate-100"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        {/* Appearance filter */}
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Show</span>
          {(["Started", "Sub", "DNP"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => toggleAppearance(opt)}
              className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                appearanceFilter.has(opt)
                  ? "bg-brand-green text-brand-cream"
                  : "text-brand-dark hover:bg-slate-100"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        {/* FDR range filter */}
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">FDR</span>
          <input
            type="number"
            min={1}
            max={20}
            value={fdrMin}
            onChange={(e) => setFdrMin(e.target.value)}
            className="w-10 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-center text-xs text-brand-dark focus:border-brand-green focus:outline-none"
            aria-label="FDR minimum"
          />
          <span className="text-xs text-slate-500">–</span>
          <input
            type="number"
            min={1}
            max={20}
            value={fdrMax}
            onChange={(e) => setFdrMax(e.target.value)}
            className="w-10 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-center text-xs text-brand-dark focus:border-brand-green focus:outline-none"
            aria-label="FDR maximum"
          />
        </div>

        {/* Column selector toggle */}
        <button
          type="button"
          onClick={() => setIsColumnPanelOpen((prev) => !prev)}
          className={`rounded border px-2 py-1 text-xs font-semibold ${
            isColumnPanelOpen
              ? "border-brand-green bg-brand-green text-brand-cream"
              : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
          }`}
        >
          {isColumnPanelOpen ? "Hide columns" : "Add / Remove columns"}
        </button>
      </div>

      {/* Column selector panel */}
      {isColumnPanelOpen ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-brand-dark">Columns</h2>
            <p className="mt-1 text-sm text-slate-600">Expand a category to add or remove columns.</p>
            {hasReachedColumnLimit ? (
              <p className="mt-2 text-xs font-semibold text-amber-700">Maximum {MAX_SELECTED_COLUMNS} columns selected</p>
            ) : null}
          </div>

          <div className="space-y-3">
            {COLUMN_CATEGORIES.map((cat) => {
              const expanded = expandedCategories[cat];
              const catCols = columnsByCategory[cat];
              return (
                <section key={cat} className="rounded-xl border border-slate-200 bg-slate-50/70">
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div>
                      <div className="text-sm font-bold text-brand-dark">{cat}</div>
                      <div className="text-xs text-slate-500">{catCols.length} columns</div>
                    </div>
                    <span className="text-lg text-brand-dark">{expanded ? "−" : "+"}</span>
                  </button>

                  {expanded ? (
                    <div className="grid gap-3 border-t border-slate-200 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
                      {catCols.map((col) => {
                        const checked = selectedColumns.includes(col.key);
                        const disabled = !checked && hasReachedColumnLimit;
                        return (
                          <label
                            key={col.key}
                            className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-sm ${
                              disabled
                                ? "border-slate-100 bg-slate-100/60 text-slate-400"
                                : "border-slate-200 bg-white text-brand-dark"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleColumn(col.key)}
                              className="mt-0.5 h-5 w-5 rounded border-slate-300 bg-white text-brand-green focus:ring-brand-green"
                            />
                            <span className="leading-snug">{col.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>

          {/* Active columns pills */}
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Active Columns</span>
              <button
                type="button"
                onClick={() => setSelectedColumns([])}
                disabled={selectedColumns.length === 0}
                className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                  selectedColumns.length === 0
                    ? "cursor-not-allowed border-slate-200 text-slate-400"
                    : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                }`}
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {visibleColumns.length > 0 ? (
                visibleColumns.map((col) => (
                  <span
                    key={col.key}
                    className="inline-flex items-center gap-2 rounded-full border border-brand-green/40 bg-brand-green/10 px-3 py-1 text-xs font-semibold text-brand-dark"
                  >
                    <span>{col.label}</span>
                    <button
                      type="button"
                      onClick={() => toggleColumn(col.key)}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] text-slate-600 hover:bg-brand-green/20 hover:text-brand-dark"
                      aria-label={`Remove ${col.label}`}
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
      ) : null}

      {/* Table */}
      <div className="relative max-h-[75vh] overflow-x-auto overflow-y-auto rounded-lg border border-slate-200 bg-white [scrollbar-gutter:stable]">
        <table className="w-max border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 w-12 min-w-12 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("gameweek")} className="inline-flex items-center gap-1">
                  GW <span aria-hidden="true">{sortArrow("gameweek")}</span>
                </button>
              </th>
              <th className="sticky left-12 top-0 z-30 w-56 min-w-56 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("opponent")} className="inline-flex items-center gap-1">
                  Opponent <span aria-hidden="true">{sortArrow("opponent")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-20 w-12 min-w-12 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                H/A
              </th>
              <th className="sticky top-0 z-20 w-12 min-w-12 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("fdr")} className="inline-flex items-center gap-1">
                  FDR <span aria-hidden="true">{sortArrow("fdr")}</span>
                </button>
              </th>
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className="sticky top-0 z-20 w-28 min-w-28 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream"
                >
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="inline-flex w-full items-center justify-end gap-1"
                  >
                    {col.label} <span aria-hidden="true">{sortArrow(col.key)}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, index) => {
              const fdr = renderFdr(row);
              const rowShade = index % 2 === 0 ? "bg-white" : "bg-slate-50";
              return (
                <tr key={row.id} className={`group ${rowShade} text-brand-dark transition-colors hover:bg-brand-green/10`}>
                  <td className={`sticky left-0 z-20 w-12 min-w-12 border-b border-r border-slate-200 px-2 py-1.5 font-semibold tabular-nums text-slate-500 ${rowShade} group-hover:bg-brand-green/10`}>
                    {row.gameweek}
                  </td>
                  <td className={`sticky left-12 z-20 w-56 min-w-56 border-b border-r border-slate-200 px-2 py-1.5 font-medium text-brand-dark ${rowShade} group-hover:bg-brand-green/10`}>
                    {renderOpponent(row)}
                  </td>
                  <td className="w-12 min-w-12 border-b border-r border-slate-200 px-2 py-1.5 font-medium text-slate-600">{renderHomeAway(row)}</td>
                  <td className="w-12 min-w-12 border-b border-r border-slate-200 px-2 py-1.5">
                    {fdr != null ? (
                      <span
                        className={`inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-bold ${fdrColor(fdr)}`}
                      >
                        {fdr}
                      </span>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>
                  {visibleColumns.map((col) => {
                    const raw = (row as Record<string, unknown>)[col.key];
                    const value = typeof raw === "number" ? raw : Number(raw ?? 0);
                    return (
                      <td key={col.key} className="w-28 min-w-28 border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                        {formatCellValue(value, col.digits ?? 2)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={4 + visibleColumns.length}
                  className="border-b border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500"
                >
                  No gameweeks match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
          {tally ? (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-brand-green/10 font-semibold text-brand-dark">
                <td className="px-2 py-2 text-xs uppercase tracking-wide text-slate-600">
                  Avg ({tally.n})
                </td>
                <td className="px-2 py-2" />
                <td className="px-2 py-2" />
                <td className="px-2 py-2" />
                {visibleColumns.map((col) => (
                  <td key={col.key} className="px-2 py-2 text-right tabular-nums">
                    {tally.avgs[col.key].toFixed(col.digits ?? 2)}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
