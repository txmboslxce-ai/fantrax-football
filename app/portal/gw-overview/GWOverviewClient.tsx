"use client";

import Link from "next/link";
import { Fragment, type CSSProperties, useMemo, useState } from "react";

export type GWOverviewTeam = string;

export type GWOverviewPlayer = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  ownershipPct: number;
};

export type GWOverviewGameweekRow = {
  id: string;
  player_id: string;
  season: string;
  gameweek: number;
  games_played: number;
  games_started: number;
  minutes_played: number;
  raw_fantrax_pts: number;
  ghost_pts: number;
  goals: number;
  assists: number;
  key_passes: number;
  shots_on_target: number;
  penalties_drawn: number;
  penalties_missed: number;
  clean_sheet: number;
  tackles_won: number;
  interceptions: number;
  clearances: number;
  aerials_won: number;
  blocked_shots: number;
  dribbles_succeeded: number;
  goals_against_outfield: number;
  saves: number;
  goals_against: number;
  penalty_saves: number;
  high_claims: number;
  smothers: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
};

type PositionFilter = "All" | "GK" | "DEF" | "MID" | "FWD";
type GPStatus = "Started" | "Sub" | "DNP";
type ColumnFilterKind = "stat";
type SortDirection = "asc" | "desc";

type SortState =
  | { kind: "formPts"; direction: SortDirection }
  | { kind: "formPPG"; direction: SortDirection }
  | { kind: "player"; direction: SortDirection }
  | { kind: "team"; direction: SortDirection }
  | { kind: "position"; direction: SortDirection }
  | { kind: "ownershipPct"; direction: SortDirection }
  | { kind: "gwStat"; direction: SortDirection; gw: number };

type SortTarget =
  | { kind: "formPts" }
  | { kind: "formPPG" }
  | { kind: "player" }
  | { kind: "team" }
  | { kind: "position" }
  | { kind: "ownershipPct" }
  | { kind: "gwStat"; gw: number };

type OpenColumnFilter = {
  gw: number;
  kind: ColumnFilterKind;
};

type StatOption = {
  label: string;
  value: StatKey;
};

type StatSelectEntry =
  | {
      type: "heading";
      label: string;
      key: string;
    }
  | {
      type: "option";
      label: string;
      value: StatKey;
      key: string;
    };

type StatSection = {
  heading: string;
  options: StatOption[];
};

type GWOverviewClientProps = {
  players: GWOverviewPlayer[];
  gameweeks: GWOverviewGameweekRow[];
  selectedGws: number[];
  teams: GWOverviewTeam[];
  minGw: number;
  maxGw: number;
};

type StatKey =
  | "raw_fantrax_pts"
  | "ghost_pts"
  | "goals"
  | "assists"
  | "key_passes"
  | "shots_on_target"
  | "penalties_drawn"
  | "penalties_missed"
  | "clean_sheet"
  | "tackles_won"
  | "interceptions"
  | "clearances"
  | "aerials_won"
  | "blocked_shots"
  | "dribbles_succeeded"
  | "goals_against_outfield"
  | "saves"
  | "goals_against"
  | "penalty_saves"
  | "high_claims"
  | "smothers"
  | "yellow_cards"
  | "red_cards"
  | "own_goals";

const positionFilters: PositionFilter[] = ["All", "GK", "DEF", "MID", "FWD"];
const gpStatusFilters: GPStatus[] = ["Started", "Sub", "DNP"];

const statSections: StatSection[] = [
  {
    heading: "Scoring",
    options: [
      { label: "Points", value: "raw_fantrax_pts" },
      { label: "Ghost Points", value: "ghost_pts" },
    ],
  },
  {
    heading: "Attack",
    options: [
      { label: "Goals", value: "goals" },
      { label: "Assists", value: "assists" },
      { label: "Key Passes", value: "key_passes" },
      { label: "Shots on Target", value: "shots_on_target" },
      { label: "Penalties Drawn", value: "penalties_drawn" },
      { label: "Penalties Missed", value: "penalties_missed" },
    ],
  },
  {
    heading: "Defensive",
    options: [
      { label: "Clean Sheet", value: "clean_sheet" },
      { label: "Tackles Won", value: "tackles_won" },
      { label: "Interceptions", value: "interceptions" },
      { label: "Clearances", value: "clearances" },
      { label: "Aerials Won", value: "aerials_won" },
      { label: "Blocked Shots", value: "blocked_shots" },
      { label: "Dribbles Succeeded", value: "dribbles_succeeded" },
      { label: "Goals Against Outfield", value: "goals_against_outfield" },
    ],
  },
  {
    heading: "Goalkeeper",
    options: [
      { label: "Saves", value: "saves" },
      { label: "Goals Against", value: "goals_against" },
      { label: "Penalty Saves", value: "penalty_saves" },
      { label: "High Claims", value: "high_claims" },
      { label: "Smothers", value: "smothers" },
    ],
  },
  {
    heading: "Disciplinary",
    options: [
      { label: "Yellow Cards", value: "yellow_cards" },
      { label: "Red Cards", value: "red_cards" },
      { label: "Own Goals", value: "own_goals" },
    ],
  },
];

const statSelectEntries: StatSelectEntry[] = statSections.flatMap((section) => [
  {
    type: "heading" as const,
    label: `── ${section.heading} ──`,
    key: `heading-${section.heading}`,
  },
  ...section.options.map((option) => ({
    type: "option" as const,
    label: `  ${option.label}`,
    value: option.value,
    key: `option-${option.value}`,
  })),
]);

const goalkeeperOnlyStats = new Set<StatKey>(["saves", "goals_against", "penalty_saves", "high_claims", "smothers"]);
const outfieldOnlyStats = new Set<StatKey>(["goals_against_outfield"]);

const CELL_WIDTHS = {
  playerMobile: 120,
  formMobile: 72,
  statMobile: 72,
  player: 220,
  formPts: 106,
  formPPG: 106,
  stat: 118,
};

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

function pointsGradientBackground(value: number): string {
  const min = 4;
  const mid = 8;
  const max = 20;
  const red: [number, number, number] = [239, 68, 68];
  const yellow: [number, number, number] = [234, 179, 8];
  const green: [number, number, number] = [42, 122, 59];

  if (value <= min) {
    return "#ef4444";
  }
  if (value >= max) {
    return "#2A7A3B";
  }
  if (value <= mid) {
    return mixColor(red, yellow, (value - min) / (mid - min));
  }

  return mixColor(yellow, green, (value - mid) / (max - mid));
}

function toDisplayValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function isStatApplicable(position: GWOverviewPlayer["position"], stat: StatKey): boolean {
  if (goalkeeperOnlyStats.has(stat)) {
    return position === "GK";
  }
  if (outfieldOnlyStats.has(stat)) {
    return position !== "GK";
  }
  return true;
}

function gpStatus(row: GWOverviewGameweekRow): "Started" | "Sub" | "DNP" {
  if (row.games_played === 0) {
    return "DNP";
  }
  if (row.games_started >= 1) {
    return "Started";
  }
  return "Sub";
}

function gpStatusTextClasses(status: "Started" | "Sub" | "DNP") {
  if (status === "Started") {
    return "text-white";
  }
  if (status === "Sub") {
    return "text-orange-400";
  }
  return "text-red-500";
}

function positionLetter(position: GWOverviewPlayer["position"]): "G" | "D" | "M" | "F" {
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

function compareText(a: string, b: string, direction: SortDirection): number {
  const base = a.localeCompare(b);
  return direction === "asc" ? base : -base;
}

function compareNumber(a: number, b: number, direction: SortDirection): number {
  return direction === "asc" ? a - b : b - a;
}

function compareNullableNumber(a: number | null, b: number | null, direction: SortDirection): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return compareNumber(a, b, direction);
}

export default function GWOverviewClient({ players, gameweeks, selectedGws, teams, minGw, maxGw }: GWOverviewClientProps) {
  const [selectedStat, setSelectedStat] = useState<StatKey>("raw_fantrax_pts");
  const [searchPlayer, setSearchPlayer] = useState<string>("");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("All");
  const [teamFilter, setTeamFilter] = useState<string>("All");
  const [ownershipMin, setOwnershipMin] = useState<string>("0");
  const [ownershipMax, setOwnershipMax] = useState<string>("100");
  const [gpStatusDraft, setGpStatusDraft] = useState<GPStatus[]>(["Started", "Sub", "DNP"]);
  const [gwStatusFilters, setGwStatusFilters] = useState<Record<number, GPStatus[]>>({});
  const [sortState, setSortState] = useState<SortState>(() => ({ kind: "gwStat", direction: "desc", gw: Math.max(...selectedGws) }));
  const [openColumnFilter, setOpenColumnFilter] = useState<OpenColumnFilter | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const currentStartGw = selectedGws.length > 0 ? Math.min(...selectedGws) : minGw;
  const latestStartGw = Math.max(minGw, maxGw - 4);

  function navigateWindow(nextStartGw: number) {
    const clamped = Math.min(latestStartGw, Math.max(minGw, nextStartGw));
    window.location.href = `/portal/gw-overview?startGw=${clamped}`;
  }

  const rowsByPlayerByGw = useMemo(() => {
    const map = new Map<string, Map<number, GWOverviewGameweekRow>>();

    for (const row of gameweeks) {
      if (!map.has(row.player_id)) {
        map.set(row.player_id, new Map<number, GWOverviewGameweekRow>());
      }
      map.get(row.player_id)?.set(row.gameweek, row);
    }

    return map;
  }, [gameweeks]);

  const formByPlayer = useMemo(() => {
    const map = new Map<string, { formPts: number; gamesPlayed: number; formPPG: number }>();

    for (const player of players) {
      const perGw = rowsByPlayerByGw.get(player.id);
      let formPts = 0;
      let gamesPlayed = 0;

      for (const gw of selectedGws) {
        const row = perGw?.get(gw);
        if (!row || row.games_played <= 0) {
          continue;
        }
        formPts += Number(row.raw_fantrax_pts ?? 0);
        gamesPlayed += Number(row.games_played ?? 0);
      }

      map.set(player.id, {
        formPts,
        gamesPlayed,
        formPPG: gamesPlayed > 0 ? formPts / gamesPlayed : 0,
      });
    }

    return map;
  }, [players, rowsByPlayerByGw, selectedGws]);

  function openFilterMenu(gw: number, kind: ColumnFilterKind) {
    if (openColumnFilter?.gw === gw && openColumnFilter.kind === kind) {
      setOpenColumnFilter(null);
      return;
    }

    setGpStatusDraft(gwStatusFilters[gw] ?? [...gpStatusFilters]);
    setOpenColumnFilter({ gw, kind });
  }

  function toggleGpStatusDraft(status: GPStatus) {
    setGpStatusDraft((prev) =>
      prev.includes(status) ? prev.filter((item) => item !== status) : [...prev, status]
    );
  }

  function applyGwStatusFilter(gw: number) {
    setGwStatusFilters((prev) => ({ ...prev, [gw]: gpStatusDraft }));
    setOpenColumnFilter(null);
  }

  function isColumnFilterActive(gw: number): boolean {
    const statuses = gwStatusFilters[gw] ?? gpStatusFilters;
    return statuses.length !== gpStatusFilters.length;
  }

  function toggleSort(next: SortTarget) {
    setSortState((prev) => {
      if (prev.kind === next.kind && (prev.kind !== "gwStat" || (next.kind === "gwStat" && prev.gw === next.gw))) {
        return { ...prev, direction: prev.direction === "desc" ? "asc" : "desc" } as SortState;
      }
      return { ...next, direction: "desc" } as SortState;
    });
  }

  function sortArrowForHeader(kind: SortState["kind"], gw?: number): string {
    if (sortState.kind !== kind) {
      return "";
    }
    if (kind === "gwStat" && sortState.kind === "gwStat" && sortState.gw !== gw) {
      return "";
    }
    return sortState.direction === "desc" ? "↓" : "↑";
  }

  const filteredPlayers = useMemo(() => {
    const normalizedSearch = searchPlayer.trim().toLowerCase();
    const minOwnership = ownershipMin.trim() === "" ? Number.NEGATIVE_INFINITY : Number.parseFloat(ownershipMin);
    const maxOwnership = ownershipMax.trim() === "" ? Number.POSITIVE_INFINITY : Number.parseFloat(ownershipMax);

    const filtered = players.filter((player) => {
      if (normalizedSearch && !player.name.toLowerCase().includes(normalizedSearch)) {
        return false;
      }

      if (positionFilter !== "All" && player.position !== positionFilter) {
        return false;
      }

      if (teamFilter !== "All" && player.team !== teamFilter) {
        return false;
      }

      if (Number.isFinite(minOwnership) && player.ownershipPct < minOwnership) {
        return false;
      }

      if (Number.isFinite(maxOwnership) && player.ownershipPct > maxOwnership) {
        return false;
      }

      for (const gw of selectedGws) {
        const allowedStatuses = gwStatusFilters[gw] ?? gpStatusFilters;
        if (allowedStatuses.length === gpStatusFilters.length) {
          continue;
        }

        const gwRow = rowsByPlayerByGw.get(player.id)?.get(gw);
        const status = gwRow ? gpStatus(gwRow) : "DNP";
        if (!allowedStatuses.includes(status)) {
          return false;
        }
      }

      return true;
    });

    return filtered.sort((a, b) => {
      let comparison = 0;

      if (sortState.kind === "formPts") {
        comparison = compareNumber(formByPlayer.get(a.id)?.formPts ?? 0, formByPlayer.get(b.id)?.formPts ?? 0, sortState.direction);
      } else if (sortState.kind === "formPPG") {
        comparison = compareNumber(formByPlayer.get(a.id)?.formPPG ?? 0, formByPlayer.get(b.id)?.formPPG ?? 0, sortState.direction);
      } else if (sortState.kind === "player") {
        comparison = compareText(a.name, b.name, sortState.direction);
      } else if (sortState.kind === "team") {
        comparison = compareText(a.team, b.team, sortState.direction);
      } else if (sortState.kind === "position") {
        comparison = compareText(a.position, b.position, sortState.direction);
      } else if (sortState.kind === "ownershipPct") {
        comparison = compareNumber(a.ownershipPct, b.ownershipPct, sortState.direction);
      } else {
        const aRow = rowsByPlayerByGw.get(a.id)?.get(sortState.gw);
        const bRow = rowsByPlayerByGw.get(b.id)?.get(sortState.gw);

        const aValue = aRow && isStatApplicable(a.position, selectedStat) ? Number(aRow[selectedStat] ?? 0) : null;
        const bValue = bRow && isStatApplicable(b.position, selectedStat) ? Number(bRow[selectedStat] ?? 0) : null;

        comparison = compareNullableNumber(aValue, bValue, sortState.direction);
      }

      if (comparison !== 0) {
        return comparison;
      }

      return compareText(a.name, b.name, "asc");
    });
  }, [
    formByPlayer,
    gwStatusFilters,
    ownershipMax,
    ownershipMin,
    players,
    positionFilter,
    rowsByPlayerByGw,
    searchPlayer,
    selectedStat,
    selectedGws,
    sortState,
    teamFilter,
  ]);

  return (
    <div className="space-y-3 overflow-x-hidden">
      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-3 py-2">
        <div className="flex items-center gap-2 text-sm text-brand-cream">
          <button
            type="button"
            onClick={() => navigateWindow(currentStartGw - 1)}
            disabled={currentStartGw <= minGw}
            className="rounded border border-brand-cream/35 px-2 py-1 disabled:opacity-40"
          >
            ←
          </button>
          <p className="font-semibold">{`Showing GW${Math.min(...selectedGws)} — GW${Math.max(...selectedGws)}`}</p>
          <button
            type="button"
            onClick={() => navigateWindow(currentStartGw + 1)}
            disabled={currentStartGw >= latestStartGw}
            className="rounded border border-brand-cream/35 px-2 py-1 disabled:opacity-40"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => navigateWindow(latestStartGw)}
            disabled={currentStartGw === latestStartGw}
            className="ml-1 rounded border border-brand-green bg-brand-green/20 px-2 py-1 text-xs font-semibold disabled:opacity-40"
          >
            Latest 5
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-3 py-2">
        <div className="grid grid-cols-2 gap-2 text-xs md:flex md:flex-nowrap md:items-end md:gap-2">
            <label className="space-y-1 md:shrink-0">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Search player</span>
              <input
                value={searchPlayer}
                onChange={(event) => setSearchPlayer(event.target.value)}
                placeholder="Player"
                className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream placeholder:text-brand-creamDark focus:border-brand-green focus:outline-none md:w-40"
              />
            </label>

            <label className="space-y-1 md:shrink-0">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Stat</span>
              <select
                value={selectedStat}
                onChange={(event) => setSelectedStat(event.target.value as StatKey)}
                className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream focus:border-brand-green focus:outline-none md:w-36"
              >
                {statSelectEntries.map((entry) =>
                  entry.type === "heading" ? (
                    <option key={entry.key} disabled style={{ color: "#9ca3af", fontStyle: "italic" }}>
                      {entry.label}
                    </option>
                  ) : (
                    <option key={entry.key} value={entry.value}>
                      {entry.label}
                    </option>
                  )
                )}
              </select>
            </label>

            <div className="col-span-2 space-y-1 md:col-span-1 md:shrink-0">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Position</span>
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
                          : "border-brand-cream/35 bg-brand-dark text-brand-cream"
                      }`}
                    >
                      {filter}
                    </button>
                  );
                })}
              </div>
            </div>

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
      </div>

      <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
        <table
          className="border-separate border-spacing-0 text-sm"
          style={{
            minWidth:
              CELL_WIDTHS.playerMobile +
              CELL_WIDTHS.formMobile +
              CELL_WIDTHS.formMobile +
              selectedGws.length * CELL_WIDTHS.statMobile,
          }}
        >
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 top-0 z-30 w-[120px] min-w-[120px] max-w-[120px] overflow-hidden border-b border-r border-brand-cream/25 bg-[#0F1F13] px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-brand-creamDark md:w-[220px] md:min-w-[220px] md:max-w-[220px]"
              >
                <button type="button" onClick={() => toggleSort({ kind: "player" })} className="inline-flex items-center gap-1">
                  <span>Name</span>
                  <span aria-hidden="true">{sortArrowForHeader("player")}</span>
                </button>
              </th>
              <th
                rowSpan={2}
                className="sticky top-0 z-20 w-[72px] min-w-[72px] border-b border-r border-brand-cream/30 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-brand-cream md:w-[106px] md:min-w-[106px]"
              >
                <button
                  type="button"
                  onClick={() => toggleSort({ kind: "formPts" })}
                  className="inline-flex w-full items-center justify-center gap-1"
                >
                  <span>Form Pts</span>
                  <span aria-hidden="true">{sortArrowForHeader("formPts")}</span>
                </button>
              </th>
              <th
                rowSpan={2}
                className="sticky top-0 z-20 w-[72px] min-w-[72px] border-b border-r border-brand-cream/30 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-brand-cream md:w-[106px] md:min-w-[106px]"
              >
                <button
                  type="button"
                  onClick={() => toggleSort({ kind: "formPPG" })}
                  className="inline-flex w-full items-center justify-center gap-1"
                >
                  <span>Form PPG</span>
                  <span aria-hidden="true">{sortArrowForHeader("formPPG")}</span>
                </button>
              </th>

              {selectedGws.map((gw, gwIndex) => (
                <th
                  key={`gw-header-${gw}`}
                  className={`relative sticky top-0 z-20 w-[72px] min-w-[72px] border-b border-r border-brand-cream/30 bg-brand-dark px-2 py-1.5 text-center text-xs font-bold text-brand-cream md:w-[118px] md:min-w-[118px] ${
                    gwIndex >= 0 ? "border-l-4 border-l-brand-cream/60" : ""
                  }`}
                >
                  <div className="inline-flex items-center gap-1">
                    <button type="button" onClick={() => toggleSort({ kind: "gwStat", gw })} className="inline-flex items-center gap-1">
                      <span>{`GW${gw}`}</span>
                      <span aria-hidden="true">{sortArrowForHeader("gwStat", gw)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openFilterMenu(gw, "stat")}
                      className={isColumnFilterActive(gw) ? "text-brand-green" : "text-brand-cream/90"}
                      aria-label={`Filter GW${gw} stat`}
                    >
                      <span aria-hidden="true">▼</span>
                    </button>
                  </div>
                  {openColumnFilter?.gw === gw && openColumnFilter.kind === "stat" && (
                    <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-md border border-brand-cream/30 bg-brand-dark p-2 text-left shadow-lg">
                      <div className="space-y-2">
                        {gpStatusFilters.map((status) => (
                          <label key={`${gw}-${status}`} className="flex items-center gap-2 text-xs text-brand-cream">
                            <input
                              type="checkbox"
                              checked={gpStatusDraft.includes(status)}
                              onChange={() => toggleGpStatusDraft(status)}
                              className="h-3.5 w-3.5 rounded border-brand-cream/40 bg-brand-dark"
                            />
                            <span>{status}</span>
                          </label>
                        ))}
                        <button
                          type="button"
                          onClick={() => applyGwStatusFilter(gw)}
                          className="w-full rounded bg-brand-green px-2 py-1 text-xs font-semibold text-brand-cream"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredPlayers.map((player, index) => {
              const rowShade = index % 2 === 0 ? "bg-[#15221a]" : "bg-[#0f1a14]";
              const playerRowsByGw = rowsByPlayerByGw.get(player.id);
              const form = formByPlayer.get(player.id) ?? { formPts: 0, formPPG: 0, gamesPlayed: 0 };
              const isSelectedRow = selectedPlayerId === player.id;
              const selectedRowClass = isSelectedRow
                ? "shadow-[inset_0_0_0_2px_rgba(232,228,217,0.78),inset_0_0_0_9999px_rgba(7,16,10,0.14)]"
                : "";
              const selectedLeadCellClass = isSelectedRow ? "border-l-2 border-l-[#E8E4D9]" : "";

              return (
                <tr
                  key={player.id}
                  className={`${rowShade} cursor-pointer`}
                  onClick={() => setSelectedPlayerId((prev) => (prev === player.id ? null : player.id))}
                >
                  <td
                    className={`sticky left-0 z-20 w-[120px] min-w-[120px] max-w-[120px] overflow-hidden border-b border-r border-brand-cream/30 bg-brand-dark px-2 py-1.5 font-semibold text-brand-cream md:w-[220px] md:min-w-[220px] md:max-w-[220px] ${rowShade} ${selectedRowClass} ${selectedLeadCellClass}`}
                  >
                    <Link
                      href={`/portal/players/${player.id}`}
                      className="block truncate text-sm leading-tight hover:text-brand-greenLight md:overflow-visible md:whitespace-normal"
                    >
                      {player.name}
                    </Link>
                    <div className="mt-0.5 truncate text-xs text-brand-creamDark/60 md:overflow-visible md:whitespace-normal">
                      {player.team} / {positionLetter(player.position)} / {player.ownershipPct.toFixed(1)}%
                    </div>
                  </td>
                  <td
                    className={`w-[72px] min-w-[72px] border-b border-r border-brand-cream/30 px-2 py-1.5 text-center font-bold text-brand-cream md:w-[106px] md:min-w-[106px] ${rowShade} ${selectedRowClass}`}
                  >
                    {form.formPts.toFixed(2)}
                  </td>
                  <td
                    className={`w-[72px] min-w-[72px] border-b border-r border-brand-cream/30 px-2 py-1.5 text-center font-bold text-brand-cream md:w-[106px] md:min-w-[106px] ${rowShade} ${selectedRowClass}`}
                  >
                    {form.formPPG.toFixed(2)}
                  </td>

                  {selectedGws.map((gw, gwIndex) => {
                    const row = playerRowsByGw?.get(gw);
                    const noRow = !row;
                    const applicable = isStatApplicable(player.position, selectedStat);

                    let statCellContent = "-";
                    let statCellClass = `border-b border-r border-brand-cream/30 ${rowShade} text-brand-cream/85`;
                    let statBadgeStyle: CSSProperties | undefined;
                    let showStatBadge = false;

                    if (!noRow && applicable) {
                      const value = Number(row[selectedStat] ?? 0);
                      statCellContent = toDisplayValue(value);

                      if (selectedStat === "raw_fantrax_pts") {
                        showStatBadge = true;
                        statBadgeStyle = { backgroundColor: pointsGradientBackground(value) };
                        statCellClass = `border-b border-r border-brand-cream/30 ${rowShade} text-brand-cream`;
                      } else {
                        statCellClass = `border-b border-r border-brand-cream/30 ${rowShade} text-brand-cream`;
                      }
                    }

                    const gpValue = noRow ? null : gpStatus(row);
                    const minsCellContent = noRow ? null : String(row.minutes_played ?? 0);

                    return (
                      <Fragment key={`${player.id}-${gw}`}>
                        <td
                          className={`w-[72px] min-w-[72px] md:w-[118px] md:min-w-[118px] ${statCellClass} ${selectedRowClass} px-2 py-1.5 text-center text-xs ${
                            gwIndex >= 0 ? "border-l-4 border-l-brand-cream/60" : ""
                          }`}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <div>
                              {showStatBadge ? (
                                <span
                                  className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold text-white"
                                  style={statBadgeStyle}
                                >
                                  {statCellContent}
                                </span>
                              ) : (
                                <span>{statCellContent}</span>
                              )}
                            </div>
                            {gpValue ? (
                              <div className="inline-flex items-center gap-1">
                                <span className={`text-xs font-semibold ${gpStatusTextClasses(gpValue)}`}>
                                  {gpValue}
                                </span>
                                {gpValue !== "DNP" && minsCellContent && (
                                  <span className="text-xs text-brand-creamDark/60">{`· ${minsCellContent}`}</span>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
