"use client";

import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";
import RosterPill from "@/app/components/ui/RosterPill";
import type { LeagueRosterData } from "@/lib/portal/leagueRoster";
import { useDeferredValue, useMemo, useState } from "react";
import type { AdvicePlayerRow, AdviceStatKey } from "./getAdviceData";

type Props = {
  players: AdvicePlayerRow[];
  leagueRoster: LeagueRosterData | null;
};

type PositionFilter = "All" | "GK" | "DEF" | "MID" | "FWD";
type VenueFilter = "All" | "Home" | "Away";
type AvailabilityFilter = "All" | "Available" | "Taken";
type SortKey = "playerName" | "playerStat" | "oppStat" | "fixture";
type SortDir = "asc" | "desc";

// ── colour helpers (same as TeamsTableClient / PlayersTableClient) ──────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function mixColor(a: [number, number, number], b: [number, number, number], ratio: number): string {
  const t = clamp(ratio, 0, 1);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

function gradientBg(value: number, min: number, max: number): string {
  const red: [number, number, number] = [239, 68, 68];
  const yellow: [number, number, number] = [234, 179, 8];
  const green: [number, number, number] = [42, 122, 59];
  const ratio = max > min ? (value - min) / (max - min) : 0.5;
  if (ratio <= 0.5) return mixColor(red, yellow, ratio * 2);
  return mixColor(yellow, green, (ratio - 0.5) * 2);
}

// ── stat metadata ────────────────────────────────────────────────────────────

type StatEntry =
  | { type: "heading"; label: string; key: string }
  | { type: "option"; label: string; value: AdviceStatKey; key: string };

type StatMeta = { label: string; digits: number; step: number };

const STAT_META: Record<AdviceStatKey, StatMeta> = {
  pts_per_start: { label: "Pts/Start", digits: 2, step: 0.5 },
  ghost_pts_per_start: { label: "Ghost Pts/Start", digits: 2, step: 0.5 },
  pts_per_game: { label: "Pts/Game", digits: 2, step: 0.5 },
  goals: { label: "Goals", digits: 2, step: 0.05 },
  assists: { label: "Assists", digits: 2, step: 0.05 },
  key_passes: { label: "Key Passes", digits: 2, step: 0.1 },
  shots_on_target: { label: "Shots on Target", digits: 2, step: 0.1 },
  tackles_won: { label: "Tackles Won", digits: 2, step: 0.1 },
  interceptions: { label: "Interceptions", digits: 2, step: 0.1 },
  clearances: { label: "Clearances", digits: 2, step: 0.1 },
  accurate_crosses: { label: "Accurate Crosses", digits: 2, step: 0.05 },
  aerials_won: { label: "Aerials Won", digits: 2, step: 0.1 },
  saves: { label: "Saves", digits: 2, step: 0.1 },
  clean_sheets: { label: "Clean Sheets", digits: 2, step: 0.05 },
};

const statEntries: StatEntry[] = [
  { type: "heading", label: "── Fantasy Points ──", key: "h-fantasy" },
  { type: "option", label: "  Points per Start", value: "pts_per_start", key: "pts_per_start" },
  { type: "option", label: "  Ghost Points per Start", value: "ghost_pts_per_start", key: "ghost_pts_per_start" },
  { type: "option", label: "  Points per Game", value: "pts_per_game", key: "pts_per_game" },
  { type: "heading", label: "── Raw Stats ──", key: "h-raw" },
  { type: "option", label: "  Goals", value: "goals", key: "goals" },
  { type: "option", label: "  Assists", value: "assists", key: "assists" },
  { type: "option", label: "  Key Passes", value: "key_passes", key: "key_passes" },
  { type: "option", label: "  Shots on Target", value: "shots_on_target", key: "shots_on_target" },
  { type: "option", label: "  Tackles Won", value: "tackles_won", key: "tackles_won" },
  { type: "option", label: "  Interceptions", value: "interceptions", key: "interceptions" },
  { type: "option", label: "  Clearances", value: "clearances", key: "clearances" },
  { type: "option", label: "  Accurate Crosses", value: "accurate_crosses", key: "accurate_crosses" },
  { type: "option", label: "  Aerials Won", value: "aerials_won", key: "aerials_won" },
  { type: "option", label: "  Saves", value: "saves", key: "saves" },
  { type: "option", label: "  Clean Sheets", value: "clean_sheets", key: "clean_sheets" },
];

const positionFilters: PositionFilter[] = ["All", "GK", "DEF", "MID", "FWD"];

function posBadgeClass(pos: AdvicePlayerRow["position"]): string {
  switch (pos) {
    case "GK":
      return "bg-yellow-700/50 text-yellow-200";
    case "DEF":
      return "bg-blue-800/50 text-blue-200";
    case "MID":
      return "bg-green-800/50 text-green-200";
    case "FWD":
      return "bg-red-800/50 text-red-200";
  }
}

export default function AdviceClient({ players, leagueRoster }: Props) {
  const [selectedStat, setSelectedStat] = useState<AdviceStatKey>("pts_per_start");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [venueFilter, setVenueFilter] = useState<VenueFilter>("All");
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("All");
  const [playerStatMin, setPlayerStatMin] = useState(0);
  const [oppStatMin, setOppStatMin] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("playerStat");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const meta = STAT_META[selectedStat];

  const teams = useMemo(
    () => [...new Set(players.map((p) => p.team))].sort((a, b) => a.localeCompare(b)),
    [players],
  );

  // Compute slider maxes from unfiltered data (stable range)
  const playerStatMax = useMemo(
    () => Math.max(0, ...players.map((p) => p.playerStats[selectedStat])),
    [players, selectedStat],
  );
  const oppStatMax = useMemo(
    () => Math.max(0, ...players.map((p) => p.oppStats[selectedStat])),
    [players, selectedStat],
  );

  const filteredAndSorted = useMemo(() => {
    const norm = deferredSearch.trim().toLowerCase();

    const filtered = players.filter((row) => {
      if (positionFilter !== "All" && row.position !== positionFilter) return false;
      if (teamFilter !== "All" && row.team !== teamFilter) return false;
      if (venueFilter === "Home" && row.nextFixtureIsHome !== true) return false;
      if (venueFilter === "Away" && row.nextFixtureIsHome !== false) return false;
      if (norm && !row.playerName.toLowerCase().includes(norm)) return false;
      if (leagueRoster && availabilityFilter !== "All") {
        const taken = Boolean(leagueRoster.teamByPlayerId[row.playerId]);
        if (availabilityFilter === "Available" && taken) return false;
        if (availabilityFilter === "Taken" && !taken) return false;
      }
      if (row.playerStats[selectedStat] < playerStatMin) return false;
      if (row.oppStats[selectedStat] < oppStatMin) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "playerName":
          diff = a.playerName.localeCompare(b.playerName);
          break;
        case "playerStat":
          diff = a.playerStats[selectedStat] - b.playerStats[selectedStat];
          break;
        case "oppStat":
          diff = a.oppStats[selectedStat] - b.oppStats[selectedStat];
          break;
        case "fixture":
          diff = (a.nextFixtureOpponent ?? "").localeCompare(b.nextFixtureOpponent ?? "");
          break;
      }
      return sortDir === "asc" ? diff : -diff;
    });
  }, [
    players,
    deferredSearch,
    positionFilter,
    teamFilter,
    venueFilter,
    availabilityFilter,
    leagueRoster,
    selectedStat,
    playerStatMin,
    oppStatMin,
    sortKey,
    sortDir,
  ]);

  // Ranges for colour coding — always derived from the full unfiltered dataset
  // so colours remain consistent when filters change (you can compare against
  // the whole league, not just the filtered subset).
  const oppStatRange = useMemo(() => {
    const vals = players.map((r) => r.oppStats[selectedStat]);
    return {
      min: vals.length > 0 ? Math.min(...vals) : 0,
      max: vals.length > 0 ? Math.max(...vals) : 0,
    };
  }, [players, selectedStat]);

  const playerStatRange = useMemo(() => {
    const vals = players.map((r) => r.playerStats[selectedStat]);
    return {
      min: vals.length > 0 ? Math.min(...vals) : 0,
      max: vals.length > 0 ? Math.max(...vals) : 0,
    };
  }, [players, selectedStat]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "playerName" || key === "fixture" ? "asc" : "desc");
    }
  }

  function arrow(key: SortKey) {
    return sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕";
  }

  const oppColHeader = useMemo(() => {
    const label = meta.label;
    return positionFilter !== "All" ? `Opp ${label} vs ${positionFilter}` : `Opp ${label}`;
  }, [meta.label, positionFilter]);

  const hasActiveFilters =
    positionFilter !== "All" ||
    teamFilter !== "All" ||
    venueFilter !== "All" ||
    availabilityFilter !== "All" ||
    search !== "" ||
    playerStatMin > 0 ||
    oppStatMin > 0;

  // ── filter panel (shared between drawer and desktop) ─────────────────────

  function FilterPanel() {
    return (
      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-3 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs md:flex md:flex-nowrap md:items-end md:gap-2">

          {/* Stat selector */}
          <label className="col-span-2 space-y-1 md:col-span-1 md:shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Stat</span>
            <select
              value={selectedStat}
              onChange={(e) => {
                setSelectedStat(e.target.value as AdviceStatKey);
                setPlayerStatMin(0);
                setOppStatMin(0);
              }}
              className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream focus:border-brand-green focus:outline-none md:w-44"
            >
              {statEntries.map((entry) =>
                entry.type === "heading" ? (
                  <option key={entry.key} disabled style={{ color: "#9ca3af", fontStyle: "italic" }}>
                    {entry.label}
                  </option>
                ) : (
                  <option key={entry.key} value={entry.value}>
                    {entry.label}
                  </option>
                ),
              )}
            </select>
          </label>

          {/* Search */}
          <label className="space-y-1 md:shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Player"
              className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream placeholder:text-brand-creamDark focus:border-brand-green focus:outline-none md:w-36"
            />
          </label>

          {/* Position */}
          <div className="col-span-2 space-y-1 md:col-span-1 md:shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Position</span>
            <div className="flex flex-nowrap gap-1">
              {positionFilters.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setPositionFilter(f)}
                  className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                    positionFilter === f
                      ? "border-brand-green bg-brand-green text-brand-cream"
                      : "border-brand-cream/35 bg-brand-dark text-brand-cream"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Team */}
          <label className="space-y-1 md:shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Team</span>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream focus:border-brand-green focus:outline-none md:w-24"
            >
              <option value="All">All</option>
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          {/* Venue */}
          <div className="space-y-1 md:shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Fixture</span>
            <div className="flex flex-nowrap gap-1">
              {(["All", "Home", "Away"] as VenueFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setVenueFilter(f)}
                  className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                    venueFilter === f
                      ? "border-brand-green bg-brand-green text-brand-cream"
                      : "border-brand-cream/35 bg-brand-dark text-brand-cream"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Availability */}
          {leagueRoster ? (
            <div className="space-y-1 md:shrink-0">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Availability</span>
              <div className="flex flex-nowrap gap-1">
                {(["All", "Available", "Taken"] as AvailabilityFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setAvailabilityFilter(f)}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                      availabilityFilter === f
                        ? "border-brand-green bg-brand-green text-brand-cream"
                        : "border-brand-cream/35 bg-brand-dark text-brand-cream"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-1 gap-3 border-t border-brand-cream/10 pt-3 md:grid-cols-2">
          <SliderFilter
            label={`Min player ${meta.label}`}
            value={playerStatMin}
            max={playerStatMax}
            step={meta.step}
            onChange={setPlayerStatMin}
          />
          <SliderFilter
            label={`Min opp ${meta.label} conceded`}
            value={oppStatMin}
            max={oppStatMax}
            step={meta.step}
            onChange={setOppStatMin}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Desktop filters */}
      <div className={mobileFiltersOpen
        ? "fixed inset-0 z-50 space-y-3 overflow-y-auto bg-brand-dark p-4 pb-24 md:static md:inset-auto md:z-auto md:overflow-visible md:bg-transparent md:p-0"
        : "hidden md:block md:space-y-3"}
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
        <FilterPanel />
      </div>

      {/* Mobile filter button */}
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

      {/* Table */}
      <div className="h-[calc(100dvh-160px)] overflow-auto rounded-xl border border-brand-cream/20 [scrollbar-gutter:stable]">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="text-brand-creamDark">
            <tr>
              <th className="sticky left-0 top-0 z-30 w-[48px] min-w-[48px] border-b border-r border-brand-cream/25 bg-[#1A4D2E] px-1.5 py-1.5 text-center text-xs font-semibold uppercase tracking-wide">
                #
              </th>
              <th className="sticky left-[48px] top-0 z-30 w-[120px] min-w-[120px] max-w-[120px] border-b border-r border-brand-cream/25 bg-[#1A4D2E] px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide md:w-[220px] md:min-w-[220px] md:max-w-[220px]">
                <button type="button" onClick={() => handleSort("playerName")} className="inline-flex items-center gap-1">
                  <span>Player</span>
                  <span aria-hidden="true">{arrow("playerName")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-brand-cream">
                Pos
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("playerStat")} className="inline-flex items-center justify-center gap-1">
                  <span>{meta.label}</span>
                  <span aria-hidden="true">{arrow("playerStat")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("fixture")} className="inline-flex items-center justify-center gap-1">
                  <span>Fixture</span>
                  <span aria-hidden="true">{arrow("fixture")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("oppStat")} className="inline-flex items-center justify-center gap-1">
                  <span className="max-w-[120px] text-left leading-tight">{oppColHeader}</span>
                  <span aria-hidden="true">{arrow("oppStat")}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((row, index) => {
              const rowShade = index % 2 === 0 ? "bg-brand-dark/60" : "bg-brand-dark/90";
              const playerVal = row.playerStats[selectedStat];
              const oppVal = row.oppStats[selectedStat];
              const hasFixture = row.nextFixtureOpponent !== null;

              return (
                <tr key={row.playerId} className={`${rowShade} text-brand-cream`}>
                  {/* Rank */}
                  <td className={`sticky left-0 z-20 w-[48px] min-w-[48px] border-b border-r border-brand-cream/10 px-1.5 py-1.5 text-center text-sm font-bold ${rowShade}`}>
                    {index + 1}
                  </td>

                  {/* Player */}
                  <td className={`sticky left-[48px] z-20 w-[120px] min-w-[120px] max-w-[120px] overflow-hidden border-b border-r border-brand-cream/10 px-2 py-1.5 font-semibold md:w-[220px] md:min-w-[220px] md:max-w-[220px] ${rowShade}`}>
                    <div className="truncate text-sm leading-tight md:overflow-visible md:whitespace-normal">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <span>{row.playerName}</span>
                        <AvailabilityIcon
                          chanceOfPlaying={row.chanceOfPlaying}
                          status={row.availabilityStatus}
                          news={row.availabilityNews}
                        />
                        <RosterPill playerId={row.playerId} leagueRoster={leagueRoster} />
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-brand-creamDark/70 md:overflow-visible md:whitespace-normal">
                      {row.team} / {row.gamesStarted} starts
                    </div>
                  </td>

                  {/* Position */}
                  <td className={`border-b border-r border-brand-cream/10 px-2 py-1.5 text-center ${rowShade}`}>
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${posBadgeClass(row.position)}`}>
                      {row.position}
                    </span>
                  </td>

                  {/* Player stat */}
                  <td className={`border-b border-r border-brand-cream/10 px-2 py-1.5 text-center ${rowShade}`}>
                    <span
                      className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold text-white"
                      style={{ backgroundColor: gradientBg(playerVal, playerStatRange.min, playerStatRange.max) }}
                    >
                      {playerVal.toFixed(meta.digits)}
                    </span>
                  </td>

                  {/* Fixture */}
                  <td className={`border-b border-r border-brand-cream/10 px-2 py-1.5 text-center ${rowShade}`}>
                    {hasFixture ? (
                      <span
                        className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold text-white"
                        style={{ backgroundColor: gradientBg(oppVal, oppStatRange.min, oppStatRange.max) }}
                      >
                        {row.nextFixtureOpponent} {row.nextFixtureIsHome ? "H" : "A"}
                      </span>
                    ) : (
                      <span className="text-xs text-brand-creamDark/50">—</span>
                    )}
                  </td>

                  {/* Opp stat */}
                  <td className={`border-b border-r border-brand-cream/10 px-2 py-1.5 text-center ${rowShade}`}>
                    {hasFixture ? (
                      <span
                        className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold text-white"
                        style={{ backgroundColor: gradientBg(oppVal, oppStatRange.min, oppStatRange.max) }}
                      >
                        {oppVal.toFixed(meta.digits)}
                      </span>
                    ) : (
                      <span className="text-xs text-brand-creamDark/50">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="border-b border-brand-cream/10 bg-brand-dark/90 px-4 py-6 text-center text-brand-creamDark">
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

// ── slider sub-component ─────────────────────────────────────────────────────

function SliderFilter({
  label,
  value,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const displayMax = max > 0 ? max : 1;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-creamDark">{label}</span>
        <span className="text-xs font-bold text-brand-cream">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={displayMax}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-brand-cream/20 accent-brand-green"
      />
      <div className="flex justify-between text-[10px] text-brand-creamDark/60">
        <span>0</span>
        <span>{displayMax.toFixed(2)}</span>
      </div>
    </div>
  );
}
