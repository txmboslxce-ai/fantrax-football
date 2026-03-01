"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, type CSSProperties, useMemo, useState, useTransition } from "react";

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
type ColumnFilterKind = "stat" | "gp" | "mins";
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

type ActiveColumnFilter =
  | {
      gw: number;
      kind: "gp";
      statuses: string[];
    }
  | {
      gw: number;
      kind: "stat";
      min: number | null;
      max: number | null;
    }
  | {
      gw: number;
      kind: "mins";
      min: number | null;
      max: number | null;
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
  player: 220,
  team: 72,
  pos: 64,
  ros: 76,
  formPts: 106,
  formPPG: 106,
  stat: 78,
  gp: 88,
  mins: 64,
};

const STICKY_LEFT = {
  player: 0,
  team: CELL_WIDTHS.player,
  pos: CELL_WIDTHS.player + CELL_WIDTHS.team,
  ros: CELL_WIDTHS.player + CELL_WIDTHS.team + CELL_WIDTHS.pos,
  formPts: CELL_WIDTHS.player + CELL_WIDTHS.team + CELL_WIDTHS.pos + CELL_WIDTHS.ros,
  formPPG: CELL_WIDTHS.player + CELL_WIDTHS.team + CELL_WIDTHS.pos + CELL_WIDTHS.ros + CELL_WIDTHS.formPts,
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
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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

function gpStatusClasses(status: "Started" | "Sub" | "DNP") {
  if (status === "Started") {
    return "bg-[#bbf7d0] text-[#0f1f13]";
  }
  if (status === "Sub") {
    return "bg-[#fef08a] text-[#0f1f13]";
  }
  return "bg-[#fecaca] text-[#0f1f13]";
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
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [selectedStat, setSelectedStat] = useState<StatKey>("raw_fantrax_pts");
  const [searchPlayer, setSearchPlayer] = useState<string>("");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("All");
  const [teamFilter, setTeamFilter] = useState<string>("All");
  const [ownershipMin, setOwnershipMin] = useState<string>("0");
  const [ownershipMax, setOwnershipMax] = useState<string>("100");
  const [minFormPts, setMinFormPts] = useState<string>("0");
  const [sortState, setSortState] = useState<SortState>({ kind: "formPts", direction: "desc" });
  const [openColumnFilter, setOpenColumnFilter] = useState<OpenColumnFilter | null>(null);
  const [activeColumnFilter, setActiveColumnFilter] = useState<ActiveColumnFilter | null>(null);
  const [gpDraftStatuses, setGpDraftStatuses] = useState<GPStatus[]>([]);
  const [rangeDraftMin, setRangeDraftMin] = useState<string>("");
  const [rangeDraftMax, setRangeDraftMax] = useState<string>("");

  const currentStartGw = selectedGws.length > 0 ? Math.min(...selectedGws) : minGw;
  const latestStartGw = Math.max(minGw, maxGw - 4);

  function navigateWindow(nextStartGw: number) {
    const clamped = Math.min(latestStartGw, Math.max(minGw, nextStartGw));
    startTransition(() => {
      router.push(`${pathname}?startGw=${clamped}`);
    });
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

  const statLabelByValue = useMemo(() => {
    const labelMap = new Map<StatKey, string>();
    for (const section of statSections) {
      for (const option of section.options) {
        labelMap.set(option.value, option.label);
      }
    }
    return labelMap;
  }, []);

  function openFilterMenu(gw: number, kind: ColumnFilterKind) {
    setOpenColumnFilter((prev) => (prev?.gw === gw && prev.kind === kind ? null : { gw, kind }));

    if (activeColumnFilter?.gw === gw) {
      if (kind === "gp" && activeColumnFilter.kind === "gp") {
        setGpDraftStatuses(
          activeColumnFilter.statuses.filter(
            (status): status is GPStatus => status === "Started" || status === "Sub" || status === "DNP"
          )
        );
        return;
      }
      if (kind === "stat" && activeColumnFilter.kind === "stat") {
        setRangeDraftMin(activeColumnFilter.min === null ? "" : String(activeColumnFilter.min));
        setRangeDraftMax(activeColumnFilter.max === null ? "" : String(activeColumnFilter.max));
        return;
      }
      if (kind === "mins" && activeColumnFilter.kind === "mins") {
        setRangeDraftMin(activeColumnFilter.min === null ? "" : String(activeColumnFilter.min));
        setRangeDraftMax(activeColumnFilter.max === null ? "" : String(activeColumnFilter.max));
        return;
      }
    }

    if (kind === "gp") {
      setGpDraftStatuses([]);
    } else {
      setRangeDraftMin("");
      setRangeDraftMax("");
    }
  }

  function toggleGpDraftStatus(status: GPStatus) {
    setGpDraftStatuses((prev) =>
      prev.includes(status) ? prev.filter((item) => item !== status) : [...prev, status]
    );
  }

  function applyGpFilter(gw: number) {
    if (gpDraftStatuses.length === 0) {
      setActiveColumnFilter(null);
      setOpenColumnFilter(null);
      return;
    }
    setActiveColumnFilter({ gw, kind: "gp", statuses: gpDraftStatuses });
    setOpenColumnFilter(null);
  }

  function applyRangeFilter(gw: number, kind: "stat" | "mins") {
    const parsedMin = rangeDraftMin.trim() === "" ? null : Number.parseFloat(rangeDraftMin);
    const parsedMax = rangeDraftMax.trim() === "" ? null : Number.parseFloat(rangeDraftMax);

    const min = parsedMin !== null && Number.isFinite(parsedMin) ? parsedMin : null;
    const max = parsedMax !== null && Number.isFinite(parsedMax) ? parsedMax : null;

    if (min === null && max === null) {
      setActiveColumnFilter(null);
      setOpenColumnFilter(null);
      return;
    }

    setActiveColumnFilter({ gw, kind, min, max });
    setOpenColumnFilter(null);
  }

  function isColumnFilterActive(gw: number, kind: ColumnFilterKind): boolean {
    return activeColumnFilter?.gw === gw && activeColumnFilter.kind === kind;
  }

  function activeFilterChipLabel(): string {
    if (!activeColumnFilter) {
      return "";
    }

    if (activeColumnFilter.kind === "gp") {
      return `GW${activeColumnFilter.gw} GP: ${activeColumnFilter.statuses.join(", ")}`;
    }

    if (activeColumnFilter.kind === "stat") {
      const minLabel = activeColumnFilter.min === null ? "Any" : String(activeColumnFilter.min);
      const maxLabel = activeColumnFilter.max === null ? "Any" : String(activeColumnFilter.max);
      return `GW${activeColumnFilter.gw} ${statLabelByValue.get(selectedStat) ?? "Stat"}: ${minLabel} to ${maxLabel}`;
    }

    const minLabel = activeColumnFilter.min === null ? "Any" : String(activeColumnFilter.min);
    const maxLabel = activeColumnFilter.max === null ? "Any" : String(activeColumnFilter.max);
    return `GW${activeColumnFilter.gw} MINS: ${minLabel} to ${maxLabel}`;
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
    const minFormPtsValue = minFormPts.trim() === "" ? Number.NEGATIVE_INFINITY : Number.parseFloat(minFormPts);

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

      const form = formByPlayer.get(player.id);
      if (Number.isFinite(minFormPtsValue) && (form?.formPts ?? 0) < minFormPtsValue) {
        return false;
      }

      if (activeColumnFilter) {
        const gwRow = rowsByPlayerByGw.get(player.id)?.get(activeColumnFilter.gw);
        if (!gwRow) {
          return false;
        }

        if (activeColumnFilter.kind === "gp") {
          if (!activeColumnFilter.statuses.includes(gpStatus(gwRow))) {
            return false;
          }
        } else if (activeColumnFilter.kind === "stat") {
          if (!isStatApplicable(player.position, selectedStat)) {
            return false;
          }

          const statValue = Number(gwRow[selectedStat] ?? 0);
          if (activeColumnFilter.min !== null && statValue < activeColumnFilter.min) {
            return false;
          }
          if (activeColumnFilter.max !== null && statValue > activeColumnFilter.max) {
            return false;
          }
        } else {
          const minsValue = Number(gwRow.minutes_played ?? 0);
          if (activeColumnFilter.min !== null && minsValue < activeColumnFilter.min) {
            return false;
          }
          if (activeColumnFilter.max !== null && minsValue > activeColumnFilter.max) {
            return false;
          }
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
    activeColumnFilter,
    formByPlayer,
    minFormPts,
    ownershipMax,
    ownershipMin,
    players,
    positionFilter,
    rowsByPlayerByGw,
    searchPlayer,
    selectedStat,
    sortState,
    teamFilter,
  ]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-3 py-2">
        <div className="flex items-center gap-2 text-sm text-brand-cream">
          <button
            type="button"
            onClick={() => navigateWindow(currentStartGw - 1)}
            disabled={currentStartGw <= minGw || isPending}
            className="rounded border border-brand-cream/35 px-2 py-1 disabled:opacity-40"
          >
            ←
          </button>
          <p className="font-semibold">{`Showing GW${Math.min(...selectedGws)} — GW${Math.max(...selectedGws)}`}</p>
          <button
            type="button"
            onClick={() => navigateWindow(currentStartGw + 1)}
            disabled={currentStartGw >= latestStartGw || isPending}
            className="rounded border border-brand-cream/35 px-2 py-1 disabled:opacity-40"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => navigateWindow(latestStartGw)}
            disabled={currentStartGw === latestStartGw || isPending}
            className="ml-1 rounded border border-brand-green bg-brand-green/20 px-2 py-1 text-xs font-semibold disabled:opacity-40"
          >
            Latest 5
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-3 py-2">
        <div className="overflow-x-auto">
          <div className="flex min-w-max items-end gap-2 text-xs">
            <label className="shrink-0 space-y-1">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Search player</span>
              <input
                value={searchPlayer}
                onChange={(event) => setSearchPlayer(event.target.value)}
                placeholder="Player"
                className="w-40 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream placeholder:text-brand-creamDark focus:border-brand-green focus:outline-none"
              />
            </label>

            <label className="shrink-0 space-y-1">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Stat</span>
              <select
                value={selectedStat}
                onChange={(event) => setSelectedStat(event.target.value as StatKey)}
                className="w-36 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream focus:border-brand-green focus:outline-none"
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

            <div className="shrink-0 space-y-1">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Position</span>
              <div className="flex gap-1">
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

            <label className="shrink-0 space-y-1">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Team</span>
              <select
                value={teamFilter}
                onChange={(event) => setTeamFilter(event.target.value)}
                className="w-24 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream focus:border-brand-green focus:outline-none"
              >
                <option value="All">All</option>
                {teams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>

            <div className="shrink-0 space-y-1">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Ownership %</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={ownershipMin}
                  onChange={(event) => setOwnershipMin(event.target.value)}
                  placeholder="Min"
                  className="w-16 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={ownershipMax}
                  onChange={(event) => setOwnershipMax(event.target.value)}
                  placeholder="Max"
                  className="w-16 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream"
                />
              </div>
            </div>

            <label className="shrink-0 space-y-1">
              <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Min Form Pts</span>
              <input
                type="number"
                step="0.1"
                value={minFormPts}
                onChange={(event) => setMinFormPts(event.target.value)}
                className="w-20 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream"
              />
            </label>
          </div>
        </div>
      </div>

      {activeColumnFilter && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveColumnFilter(null)}
            className="inline-flex items-center gap-2 rounded-full border border-brand-green bg-brand-green/15 px-3 py-1 text-xs font-semibold text-brand-cream"
          >
            <span>{activeFilterChipLabel()}</span>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
        <table
          className="border-separate border-spacing-0 text-sm"
          style={{ minWidth: STICKY_LEFT.formPPG + CELL_WIDTHS.formPPG + selectedGws.length * (CELL_WIDTHS.stat + CELL_WIDTHS.gp + CELL_WIDTHS.mins) }}
        >
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 top-0 z-30 border-b border-r border-brand-cream/25 bg-[#0F1F13] px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-brand-creamDark"
                style={{ minWidth: CELL_WIDTHS.player, width: CELL_WIDTHS.player }}
              >
                <button type="button" onClick={() => toggleSort({ kind: "player" })} className="inline-flex items-center gap-1">
                  <span>Player</span>
                  <span aria-hidden="true">{sortArrowForHeader("player")}</span>
                </button>
              </th>
              <th
                rowSpan={2}
                className="sticky top-0 z-30 border-b border-r border-brand-cream/25 bg-[#0F1F13] px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-brand-creamDark"
                style={{ left: STICKY_LEFT.team, minWidth: CELL_WIDTHS.team, width: CELL_WIDTHS.team }}
              >
                <button type="button" onClick={() => toggleSort({ kind: "team" })} className="inline-flex items-center gap-1">
                  <span>Team</span>
                  <span aria-hidden="true">{sortArrowForHeader("team")}</span>
                </button>
              </th>
              <th
                rowSpan={2}
                className="sticky top-0 z-30 border-b border-r border-brand-cream/25 bg-[#0F1F13] px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-brand-creamDark"
                style={{ left: STICKY_LEFT.pos, minWidth: CELL_WIDTHS.pos, width: CELL_WIDTHS.pos }}
              >
                <button type="button" onClick={() => toggleSort({ kind: "position" })} className="inline-flex items-center gap-1">
                  <span>Pos</span>
                  <span aria-hidden="true">{sortArrowForHeader("position")}</span>
                </button>
              </th>
              <th
                rowSpan={2}
                className="sticky top-0 z-30 border-b border-r border-brand-cream/25 bg-[#0F1F13] px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-brand-creamDark"
                style={{ left: STICKY_LEFT.ros, minWidth: CELL_WIDTHS.ros, width: CELL_WIDTHS.ros }}
              >
                <button type="button" onClick={() => toggleSort({ kind: "ownershipPct" })} className="inline-flex items-center gap-1">
                  <span>Ros%</span>
                  <span aria-hidden="true">{sortArrowForHeader("ownershipPct")}</span>
                </button>
              </th>
              <th
                rowSpan={2}
                className="sticky top-0 z-30 border-b border-r border-brand-cream/25 bg-brand-greenDark px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-brand-cream"
                style={{ left: STICKY_LEFT.formPts, minWidth: CELL_WIDTHS.formPts, width: CELL_WIDTHS.formPts }}
              >
                <button type="button" onClick={() => toggleSort({ kind: "formPts" })} className="inline-flex items-center gap-1">
                  <span>Form Pts</span>
                  <span aria-hidden="true">{sortArrowForHeader("formPts")}</span>
                </button>
              </th>
              <th
                rowSpan={2}
                className="sticky top-0 z-30 border-b border-r-2 border-r-brand-green border-brand-cream/25 bg-brand-greenDark px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-brand-cream"
                style={{ left: STICKY_LEFT.formPPG, minWidth: CELL_WIDTHS.formPPG, width: CELL_WIDTHS.formPPG }}
              >
                <button type="button" onClick={() => toggleSort({ kind: "formPPG" })} className="inline-flex items-center gap-1">
                  <span>Form PPG</span>
                  <span aria-hidden="true">{sortArrowForHeader("formPPG")}</span>
                </button>
              </th>

              {selectedGws.map((gw) => (
                <th
                  key={`gw-header-${gw}`}
                  colSpan={3}
                  className="sticky top-0 z-20 border-b border-r border-brand-cream/25 bg-brand-dark px-2 py-1.5 text-center text-sm font-bold text-brand-cream"
                >
                  {`GW${gw}`}
                </th>
              ))}
            </tr>
            <tr>
              {selectedGws.map((gw) => (
                <Fragment key={`gw-subheader-${gw}`}>
                  <th
                    className="relative sticky top-[31px] z-20 border-b border-r border-brand-cream/20 bg-brand-dark px-2 py-1.5 text-center text-xs font-semibold text-brand-cream/90"
                    style={{ minWidth: CELL_WIDTHS.stat, width: CELL_WIDTHS.stat }}
                  >
                    <div className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => toggleSort({ kind: "gwStat", gw })} className="inline-flex items-center gap-1">
                        <span>Stat</span>
                        <span aria-hidden="true">{sortArrowForHeader("gwStat", gw)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openFilterMenu(gw, "stat")}
                        className={isColumnFilterActive(gw, "stat") ? "text-brand-green" : "text-brand-cream/90"}
                        aria-label={`Filter GW${gw} stat`}
                      >
                        <span aria-hidden="true">▼</span>
                      </button>
                    </div>
                    {openColumnFilter?.gw === gw && openColumnFilter.kind === "stat" && (
                      <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-md border border-brand-cream/30 bg-brand-dark p-2 text-left shadow-lg">
                        <div className="space-y-2">
                          <input
                            type="number"
                            step="0.1"
                            value={rangeDraftMin}
                            onChange={(event) => setRangeDraftMin(event.target.value)}
                            placeholder="Min value"
                            className="w-full rounded border border-brand-cream/30 bg-brand-dark px-2 py-1 text-xs text-brand-cream"
                          />
                          <input
                            type="number"
                            step="0.1"
                            value={rangeDraftMax}
                            onChange={(event) => setRangeDraftMax(event.target.value)}
                            placeholder="Max value"
                            className="w-full rounded border border-brand-cream/30 bg-brand-dark px-2 py-1 text-xs text-brand-cream"
                          />
                          <button
                            type="button"
                            onClick={() => applyRangeFilter(gw, "stat")}
                            className="w-full rounded bg-brand-green px-2 py-1 text-xs font-semibold text-brand-cream"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    )}
                  </th>
                  <th
                    className="relative sticky top-[31px] z-20 border-b border-r border-brand-cream/20 bg-brand-dark px-2 py-1.5 text-center text-xs font-semibold text-brand-cream/90"
                    style={{ minWidth: CELL_WIDTHS.gp, width: CELL_WIDTHS.gp }}
                  >
                    <button
                      type="button"
                      onClick={() => openFilterMenu(gw, "gp")}
                      className={`inline-flex items-center gap-1 ${isColumnFilterActive(gw, "gp") ? "text-brand-green" : "text-brand-cream/90"}`}
                    >
                      <span>GP</span>
                      <span aria-hidden="true">▼</span>
                    </button>
                    {openColumnFilter?.gw === gw && openColumnFilter.kind === "gp" && (
                      <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-md border border-brand-cream/30 bg-brand-dark p-2 text-left shadow-lg">
                        <div className="space-y-2">
                          {(["Started", "Sub", "DNP"] as GPStatus[]).map((status) => (
                            <label key={status} className="flex items-center gap-2 text-xs text-brand-cream">
                              <input
                                type="checkbox"
                                checked={gpDraftStatuses.includes(status)}
                                onChange={() => toggleGpDraftStatus(status)}
                                className="h-3.5 w-3.5 rounded border-brand-cream/40 bg-brand-dark"
                              />
                              <span>{status}</span>
                            </label>
                          ))}
                          <button
                            type="button"
                            onClick={() => applyGpFilter(gw)}
                            className="w-full rounded bg-brand-green px-2 py-1 text-xs font-semibold text-brand-cream"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    )}
                  </th>
                  <th
                    className="relative sticky top-[31px] z-20 border-b border-r border-brand-cream/20 bg-brand-dark px-2 py-1.5 text-center text-xs font-semibold text-brand-cream/90"
                    style={{ minWidth: CELL_WIDTHS.mins, width: CELL_WIDTHS.mins }}
                  >
                    <button
                      type="button"
                      onClick={() => openFilterMenu(gw, "mins")}
                      className={`inline-flex items-center gap-1 ${isColumnFilterActive(gw, "mins") ? "text-brand-green" : "text-brand-cream/90"}`}
                    >
                      <span>Mins</span>
                      <span aria-hidden="true">▼</span>
                    </button>
                    {openColumnFilter?.gw === gw && openColumnFilter.kind === "mins" && (
                      <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border border-brand-cream/30 bg-brand-dark p-2 text-left shadow-lg">
                        <div className="space-y-2">
                          <input
                            type="number"
                            step="1"
                            value={rangeDraftMin}
                            onChange={(event) => setRangeDraftMin(event.target.value)}
                            placeholder="Min mins"
                            className="w-full rounded border border-brand-cream/30 bg-brand-dark px-2 py-1 text-xs text-brand-cream"
                          />
                          <input
                            type="number"
                            step="1"
                            value={rangeDraftMax}
                            onChange={(event) => setRangeDraftMax(event.target.value)}
                            placeholder="Max mins"
                            className="w-full rounded border border-brand-cream/30 bg-brand-dark px-2 py-1 text-xs text-brand-cream"
                          />
                          <button
                            type="button"
                            onClick={() => applyRangeFilter(gw, "mins")}
                            className="w-full rounded bg-brand-green px-2 py-1 text-xs font-semibold text-brand-cream"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    )}
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredPlayers.map((player, index) => {
              const rowShade = index % 2 === 0 ? "bg-[#142318]" : "bg-[#0F1F13]";
              const playerRowsByGw = rowsByPlayerByGw.get(player.id);
              const form = formByPlayer.get(player.id) ?? { formPts: 0, formPPG: 0, gamesPlayed: 0 };

              return (
                <tr key={player.id} className={rowShade}>
                  <td
                    className="sticky left-0 z-20 border-b border-r border-brand-cream/10 bg-[#0F1F13] px-2 py-1.5 font-semibold text-brand-cream"
                    style={{ minWidth: CELL_WIDTHS.player, width: CELL_WIDTHS.player }}
                  >
                    <Link href={`/portal/players/${player.id}`} className="hover:text-brand-greenLight">
                      {player.name}
                    </Link>
                  </td>
                  <td
                    className="sticky z-20 border-b border-r border-brand-cream/10 bg-[#0F1F13] px-2 py-1.5 text-brand-cream"
                    style={{ left: STICKY_LEFT.team, minWidth: CELL_WIDTHS.team, width: CELL_WIDTHS.team }}
                  >
                    {player.team}
                  </td>
                  <td
                    className="sticky z-20 border-b border-r border-brand-cream/10 bg-[#0F1F13] px-2 py-1.5"
                    style={{ left: STICKY_LEFT.pos, minWidth: CELL_WIDTHS.pos, width: CELL_WIDTHS.pos }}
                  >
                    <span className="inline-flex rounded-full border border-brand-cream/30 px-1.5 py-0.5 text-[11px] font-semibold text-brand-cream">
                      {player.position === "DEF" ? "D" : player.position === "MID" ? "M" : player.position === "FWD" ? "F" : "G"}
                    </span>
                  </td>
                  <td
                    className="sticky z-20 border-b border-r border-brand-cream/10 bg-[#0F1F13] px-2 py-1.5 text-brand-cream"
                    style={{ left: STICKY_LEFT.ros, minWidth: CELL_WIDTHS.ros, width: CELL_WIDTHS.ros }}
                  >
                    {player.ownershipPct.toFixed(1)}%
                  </td>
                  <td
                    className="sticky z-20 border-b border-r border-brand-cream/10 bg-brand-greenDark px-2 py-1.5 font-semibold text-brand-cream"
                    style={{ left: STICKY_LEFT.formPts, minWidth: CELL_WIDTHS.formPts, width: CELL_WIDTHS.formPts }}
                  >
                    {form.formPts.toFixed(1)}
                  </td>
                  <td
                    className="sticky z-20 border-b border-r-2 border-r-brand-green border-brand-cream/10 bg-brand-greenDark px-2 py-1.5 font-semibold text-brand-cream"
                    style={{ left: STICKY_LEFT.formPPG, minWidth: CELL_WIDTHS.formPPG, width: CELL_WIDTHS.formPPG }}
                  >
                    {form.formPPG.toFixed(2)}
                  </td>

                  {selectedGws.map((gw) => {
                    const row = playerRowsByGw?.get(gw);
                    const noRow = !row;
                    const applicable = isStatApplicable(player.position, selectedStat);

                    let statCellContent = "-";
                    let statCellClass = "border-b border-r border-brand-cream/10 bg-[#1f2a22] text-brand-creamDark";
                    let statCellStyle: CSSProperties | undefined;

                    if (!noRow && applicable) {
                      const value = Number(row[selectedStat] ?? 0);
                      statCellContent = toDisplayValue(value);

                      if (selectedStat === "raw_fantrax_pts") {
                        statCellStyle = { backgroundColor: pointsGradientBackground(value) };
                        statCellClass = "border-b border-r border-brand-cream/10 text-[#0f1f13]";
                      } else {
                        statCellClass = "border-b border-r border-brand-cream/10 bg-[#E8E4D9] text-[#0f1f13]";
                      }
                    }

                    const gpCellContent = noRow ? "-" : gpStatus(row);
                    const gpCellClass = noRow
                      ? "border-b border-r border-brand-cream/10 bg-[#1f2a22] text-brand-creamDark"
                      : `border-b border-r border-brand-cream/10 ${gpStatusClasses(gpStatus(row))}`;

                    const minsCellContent = noRow ? "-" : String(row.minutes_played ?? 0);
                    const minsCellClass = noRow
                      ? "border-b border-r border-brand-cream/10 bg-[#1f2a22] text-brand-creamDark"
                      : "border-b border-r border-brand-cream/10 bg-[#E8E4D9] text-[#0f1f13]";

                    return (
                      <Fragment key={`${player.id}-${gw}`}>
                        <td className={`${statCellClass} px-2 py-1.5 text-center text-xs`} style={statCellStyle}>
                          {statCellContent}
                        </td>
                        <td className={`${gpCellClass} px-2 py-1.5 text-center text-xs font-semibold`}>{gpCellContent}</td>
                        <td className={`${minsCellClass} px-2 py-1.5 text-center text-xs`}>{minsCellContent}</td>
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
