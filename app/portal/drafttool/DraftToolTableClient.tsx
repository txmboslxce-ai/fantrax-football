"use client";

import type { PlayerWindowStats } from "@/lib/portal/playerMetrics";
import { injuryStatusIndicator } from "@/lib/portal/injuryStatus";
import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { type ReactNode, useDeferredValue, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DraftToolPlayer = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  setPieces: {
    penaltiesOrder: number | null;
    cornersOrder: number | null;
    directFreekicksOrder: number | null;
  };
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
  stats: PlayerWindowStats;
  corners: number;
  freeKickShots: number;
  adp: number | null;
  rank: number;
  picked: boolean;
  watchlisted: boolean;
  customRank: number | null;
};

type RoleFilter = "penalties" | "corners" | "directFreekicks";
type SortKey =
  | "name"
  | "adp"
  | "rank"
  | "adpVsRank"
  | "seasonPts"
  | "fantasyPtsPerGame"
  | "fantasyPtsPerStart"
  | "ghostPtsPerStart"
  | "ghostPtsPct"
  | "gamesStarted"
  | "tenthPercentile"
  | "ninetiethPercentile"
  | "corners"
  | "freeKickShots";

const POSITION_FILTERS: Array<"All" | DraftToolPlayer["position"]> = ["All", "GK", "DEF", "MID", "FWD"];
const ROLE_FILTERS: Array<{ key: RoleFilter; label: string }> = [
  { key: "penalties", label: "Penalties" },
  { key: "corners", label: "Corners" },
  { key: "directFreekicks", label: "Direct FK" },
];

const WATCHLIST_COLUMN_WIDTH = "w-10 min-w-10";
const PICKED_COLUMN_WIDTH = "w-14 min-w-14";
const PLAYER_COLUMN_WIDTH = "w-48 min-w-48";
const POSITION_COLUMN_WIDTH = "w-10 min-w-10";
const TEAM_COLUMN_WIDTH = "w-14 min-w-14";
const NUMERIC_COLUMN_WIDTH = "w-20 min-w-20";
const SET_PIECES_COLUMN_WIDTH = "w-24 min-w-24";

function positionLetter(position: DraftToolPlayer["position"]): "G" | "D" | "M" | "F" {
  if (position === "GK") return "G";
  if (position === "DEF") return "D";
  if (position === "MID") return "M";
  return "F";
}

function positionBadgeClass(position: DraftToolPlayer["position"]): string {
  if (position === "GK") return "bg-amber-100 text-amber-900";
  if (position === "DEF") return "bg-emerald-200 text-emerald-950";
  if (position === "MID") return "bg-violet-200 text-violet-950";
  return "bg-orange-200 text-orange-950";
}

function formatNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}

function adpVsRank(player: DraftToolPlayer): number | null {
  return player.adp == null ? null : player.adp - player.rank;
}

function formatAdpDelta(player: DraftToolPlayer): string {
  const delta = adpVsRank(player);
  if (delta == null) return "—";
  return `${delta > 0 ? "+" : ""}${formatNumber(delta, 1)}`;
}

function fantasyPtsPerGame(player: DraftToolPlayer): number {
  return player.stats.games_played > 0 ? player.stats.season_pts / player.stats.games_played : 0;
}

function setPieceLabel(setPieces: DraftToolPlayer["setPieces"]): string | null {
  const labels = [
    setPieces.penaltiesOrder != null ? `P${setPieces.penaltiesOrder}` : null,
    setPieces.cornersOrder != null ? `C${setPieces.cornersOrder}` : null,
    setPieces.directFreekicksOrder != null ? `FK${setPieces.directFreekicksOrder}` : null,
  ].filter((label): label is string => label != null);

  return labels.length > 0 ? labels.join(" · ") : null;
}

function matchesAnySelectedRole(player: DraftToolPlayer, selectedRoles: Set<RoleFilter>): boolean {
  if (selectedRoles.size === 0) return true;

  return (
    (selectedRoles.has("penalties") && player.setPieces.penaltiesOrder != null) ||
    (selectedRoles.has("corners") && player.setPieces.cornersOrder != null) ||
    (selectedRoles.has("directFreekicks") && player.setPieces.directFreekicksOrder != null)
  );
}

function sortValue(player: DraftToolPlayer, key: SortKey): string | number | null {
  switch (key) {
    case "name": return player.name;
    case "adp": return player.adp;
    case "rank": return player.rank;
    case "adpVsRank": return adpVsRank(player);
    case "seasonPts": return player.stats.season_pts;
    case "fantasyPtsPerGame": return fantasyPtsPerGame(player);
    case "fantasyPtsPerStart": return player.stats.fantasy_pts_per_start;
    case "ghostPtsPerStart": return player.stats.ghost_pts_per_start;
    case "ghostPtsPct": return player.stats.ghost_pts_pct;
    case "gamesStarted": return player.stats.games_started;
    case "tenthPercentile": return player.stats.tenth_percentile_per_start;
    case "ninetiethPercentile": return player.stats.ninetieth_percentile_per_start;
    case "corners": return player.corners;
    case "freeKickShots": return player.freeKickShots;
  }
}

function myRankValue(player: DraftToolPlayer): number | null {
  return player.customRank ?? player.adp;
}

function HeaderTooltip({ children, description }: { children: ReactNode; description?: string }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  if (!description) return children;

  function showTooltip() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const tooltipWidth = 224;
    const viewportPadding = 12;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, viewportPadding + tooltipWidth / 2),
      window.innerWidth - viewportPadding - tooltipWidth / 2
    );

    setPosition({ left, top: rect.bottom + 8 });
  }

  return (
    <span
      ref={triggerRef}
      className="inline-flex w-full justify-center"
      onMouseEnter={showTooltip}
      onMouseLeave={() => setPosition(null)}
      onFocus={showTooltip}
      onBlur={() => setPosition(null)}
    >
      {children}
      {position ? createPortal(
        <span
          role="tooltip"
          style={{ left: position.left, top: position.top }}
          className="pointer-events-none fixed z-[100] w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-medium normal-case leading-snug tracking-normal text-slate-700 shadow-lg"
        >
          {description}
        </span>,
        document.body
      ) : null}
    </span>
  );
}

function SortableHeader({
  label,
  subLabel,
  tooltip,
  sortKey,
  onSort,
  sortArrow,
}: {
  label: string;
  subLabel?: string;
  tooltip?: string;
  sortKey: SortKey;
  onSort: (key: SortKey) => void;
  sortArrow: (key: SortKey) => string;
}) {
  return (
    <HeaderTooltip description={tooltip}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex w-full items-center justify-center gap-1 text-center leading-tight">
        <span>{label}{subLabel ? <><br />{subLabel}</> : null}</span>
        <span aria-hidden="true">{sortArrow(sortKey)}</span>
      </button>
    </HeaderTooltip>
  );
}

export default function DraftToolTableClient({ players }: { players: DraftToolPlayer[] }) {
  const [pickedPlayerIds, setPickedPlayerIds] = useState<Set<string>>(() => new Set(players.filter((player) => player.picked).map((player) => player.id)));
  const [watchlistedPlayerIds, setWatchlistedPlayerIds] = useState<Set<string>>(() => new Set(players.filter((player) => player.watchlisted).map((player) => player.id)));
  const boardStateRef = useRef({
    picked: new Set(players.filter((player) => player.picked).map((player) => player.id)),
    watchlisted: new Set(players.filter((player) => player.watchlisted).map((player) => player.id)),
  });
  const saveVersionRef = useRef(new Map<string, number>());
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [positionFilter, setPositionFilter] = useState<(typeof POSITION_FILTERS)[number]>("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [selectedRoles, setSelectedRoles] = useState<Set<RoleFilter>>(new Set());
  const [hideDrafted, setHideDrafted] = useState(false);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [isMyRankMode, setIsMyRankMode] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const teams = useMemo(
    () => [...new Set(players.map((player) => player.team))].sort((a, b) => a.localeCompare(b)),
    [players]
  );

  const filteredAndSortedPlayers = useMemo(() => {
    const searchTerm = deferredSearch.trim().toLowerCase();
    const filtered = players.filter((player) => {
      const matchesSearch = !searchTerm || player.name.toLowerCase().includes(searchTerm);
      const matchesPosition = positionFilter === "All" || player.position === positionFilter;
      const matchesTeam = teamFilter === "All" || player.team === teamFilter;
      const matchesDrafted = !hideDrafted || !pickedPlayerIds.has(player.id);
      const matchesWatchlist = !watchlistOnly || watchlistedPlayerIds.has(player.id);
      return matchesSearch && matchesPosition && matchesTeam && matchesAnySelectedRole(player, selectedRoles) && matchesDrafted && matchesWatchlist;
    });

    return [...filtered].sort((a, b) => {
      if (isMyRankMode) {
        const aValue = myRankValue(a);
        const bValue = myRankValue(b);
        if (aValue == null) return bValue == null ? a.name.localeCompare(b.name) : 1;
        if (bValue == null) return -1;
        return aValue - bValue || a.name.localeCompare(b.name);
      }

      const aValue = sortValue(a, sortKey);
      const bValue = sortValue(b, sortKey);
      if (aValue == null) return bValue == null ? a.name.localeCompare(b.name) : 1;
      if (bValue == null) return -1;
      if (typeof aValue === "string" && typeof bValue === "string") {
        return aValue.localeCompare(bValue) * (sortDir === "asc" ? 1 : -1);
      }
      return (Number(aValue) - Number(bValue)) * (sortDir === "asc" ? 1 : -1) || a.name.localeCompare(b.name);
    });
  }, [deferredSearch, hideDrafted, isMyRankMode, pickedPlayerIds, players, positionFilter, selectedRoles, sortDir, sortKey, teamFilter, watchlistOnly, watchlistedPlayerIds]);

  function applyBoardState(picked: Set<string>, watchlisted: Set<string>) {
    boardStateRef.current = { picked, watchlisted };
    setPickedPlayerIds(picked);
    setWatchlistedPlayerIds(watchlisted);
  }

  async function persistBoardState(
    playerId: string,
    previous: { picked: Set<string>; watchlisted: Set<string> },
    next: { picked: Set<string>; watchlisted: Set<string> }
  ) {
    const version = (saveVersionRef.current.get(playerId) ?? 0) + 1;
    saveVersionRef.current.set(playerId, version);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Your session has expired. Please sign in again.");

      const { error } = await supabase.from("draft_picks").upsert(
        {
          user_id: user.id,
          player_id: playerId,
          picked: next.picked.has(playerId),
          watchlisted: next.watchlisted.has(playerId),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,player_id" }
      );
      if (error) throw error;
    } catch (error) {
      if (saveVersionRef.current.get(playerId) === version) {
        applyBoardState(previous.picked, previous.watchlisted);
        setSaveError(error instanceof Error ? error.message : "Unable to save your draft board.");
      }
    }
  }

  function toggleBoardFlag(playerId: string, flag: "picked" | "watchlisted") {
    setSaveError(null);
    const previous = boardStateRef.current;
    const next = {
      picked: new Set(previous.picked),
      watchlisted: new Set(previous.watchlisted),
    };
    const target = next[flag];
    if (target.has(playerId)) target.delete(playerId);
    else target.add(playerId);

    applyBoardState(next.picked, next.watchlisted);
    void persistBoardState(playerId, previous, next);
  }

  async function resetDraftBoard() {
    setIsResetting(true);
    setSaveError(null);
    const previous = boardStateRef.current;
    applyBoardState(new Set(), new Set());

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Your session has expired. Please sign in again.");

      const { error } = await supabase.from("draft_picks").delete().eq("user_id", user.id);
      if (error) throw error;

      setIsResetDialogOpen(false);
    } catch (error) {
      applyBoardState(previous.picked, previous.watchlisted);
      setSaveError(error instanceof Error ? error.message : "Unable to clear your draft board.");
    } finally {
      setIsResetting(false);
    }
  }

  function toggleRole(role: RoleFilter) {
    setSelectedRoles((current) => {
      const next = new Set(current);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  function handleSort(nextKey: SortKey) {
    if (isMyRankMode) {
      setIsMyRankMode(false);
      setSortKey(nextKey);
      setSortDir(nextKey === "name" ? "asc" : "desc");
      return;
    }

    if (sortKey === nextKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDir(nextKey === "name" ? "asc" : "desc");
  }

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <label className="h-[76px] w-full space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2 sm:w-64 sm:shrink-0">
          <span className="block font-semibold uppercase tracking-wide text-slate-500">Search</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search player…"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-brand-dark placeholder:text-slate-400 focus:border-brand-green focus:outline-none"
          />
        </label>

        <div className="h-[76px] space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
          <span className="block font-semibold uppercase tracking-wide text-slate-500">Position</span>
          <div className="flex flex-nowrap gap-1">
            {POSITION_FILTERS.map((position) => (
              <button
                key={position}
                type="button"
                onClick={() => setPositionFilter(position)}
                className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                  positionFilter === position
                    ? "border-brand-green bg-brand-green text-brand-cream"
                    : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                }`}
              >
                {position}
              </button>
            ))}
          </div>
        </div>

        <label className="flex h-[76px] flex-col space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
          <span className="block font-semibold uppercase tracking-wide text-slate-500">Team</span>
          <select
            value={teamFilter}
            onChange={(event) => setTeamFilter(event.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark focus:border-brand-green focus:outline-none md:w-24"
          >
            <option value="All">All</option>
            {teams.map((team) => <option key={team} value={team}>{team}</option>)}
          </select>
        </label>

        <div className="h-[76px] space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
          <span className="block font-semibold uppercase tracking-wide text-slate-500">Role / Set Pieces</span>
          <div className="flex flex-nowrap gap-1">
            {ROLE_FILTERS.map((role) => (
              <button
                key={role.key}
                type="button"
                onClick={() => toggleRole(role.key)}
                className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                  selectedRoles.has(role.key)
                    ? "border-brand-green bg-brand-green text-brand-cream"
                    : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                }`}
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-[11px] font-semibold text-brand-dark">
            <input
              type="checkbox"
              checked={watchlistOnly}
              onChange={(event) => setWatchlistOnly(event.target.checked)}
              className="h-4 w-4 accent-brand-green"
            />
            <span>Watchlist Only</span>
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-[11px] font-semibold text-brand-dark">
            <input
              type="checkbox"
              checked={hideDrafted}
              onChange={(event) => setHideDrafted(event.target.checked)}
              className="h-4 w-4 accent-brand-green"
            />
            <span>Hide Drafted</span>
          </label>
        </div>
        <button
          type="button"
          onClick={() => setIsMyRankMode((current) => !current)}
          aria-pressed={isMyRankMode}
          className={`rounded-lg border px-3 py-2 text-[11px] font-bold transition-colors ${
            isMyRankMode
              ? "border-brand-green bg-brand-green text-brand-cream"
              : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
          }`}
        >
          My Rank
        </button>
        <button
          type="button"
          onClick={() => setIsResetDialogOpen(true)}
          className="ml-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700 transition-colors hover:bg-red-100"
        >
          New Draft
        </button>
      </div>

      {saveError ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {saveError}
        </p>
      ) : null}

      <div className="max-w-full overflow-x-auto">
        <div className="max-h-[75vh] w-max overflow-y-auto rounded-lg border border-slate-200 bg-white [scrollbar-gutter:stable]">
        <table className="w-[1520px] table-fixed border-separate border-spacing-0 text-left text-xs">
          <colgroup>
            <col style={{ width: "40px" }} />
            <col style={{ width: "56px" }} />
            <col style={{ width: "192px" }} />
            <col style={{ width: "40px" }} />
            <col style={{ width: "56px" }} />
            {Array.from({ length: 13 }, (_, index) => <col key={index} style={{ width: "80px" }} />)}
            <col style={{ width: "96px" }} />
          </colgroup>
          <thead>
            <tr>
              <th aria-label="Watchlist" className={`sticky left-0 top-0 z-30 h-16 ${WATCHLIST_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><span aria-hidden="true">★</span></th>
              <th className={`sticky left-10 top-0 z-30 h-16 ${PICKED_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}>Picked?</th>
              <th className={`sticky left-24 top-0 z-30 h-16 ${PLAYER_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}>
                <button type="button" onClick={() => handleSort("name")} className="inline-flex w-full items-center justify-center gap-1"><span>Player</span><span aria-hidden="true">{sortArrow("name")}</span></button>
              </th>
              <th className={`sticky left-[288px] top-0 z-30 h-16 ${POSITION_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}>POS</th>
              <th className={`sticky top-0 z-20 h-16 ${TEAM_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}>Team</th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="ADP" tooltip="Average draft position across current 2026-27 Fantrax drafts. Refreshed daily; lower means drafted earlier." sortKey="adp" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="Rank (25/26)" tooltip="Player's finish position among the full pool, ranked by total Fantasy Points scored in 2025-26. 1 = highest scorer." sortKey="rank" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="ADP v Rank (25/26)" tooltip="Current ADP minus last season's Rank. Positive means the player is being drafted lower than last season's output would justify (potential value). Negative means drafted higher than last season's output justified." sortKey="adpVsRank" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="FPts (25/26)" tooltip="Total Fantasy Points scored in 2025-26." sortKey="seasonPts" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="FPts/G (25/26)" tooltip="Average Fantasy Points per gameweek played in 2025-26." sortKey="fantasyPtsPerGame" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="FPts/S (25/26)" tooltip="Average Fantasy Points per start in 2025-26." sortKey="fantasyPtsPerStart" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="GhPts/S (25/26)" tooltip="Average recorded Ghost Points per start in 2025-26." sortKey="ghostPtsPerStart" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="GhPts % (25/26)" tooltip="Recorded Ghost Points as a percentage of total Fantasy Points in 2025-26." sortKey="ghostPtsPct" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="GS (25/26)" tooltip="Games started in 2025-26." sortKey="gamesStarted" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="Floor" subLabel="(10th pct)" tooltip="10th percentile of Fantasy Points in starts during 2025-26." sortKey="tenthPercentile" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="Ceiling" subLabel="(90th pct)" tooltip="90th percentile of Fantasy Points in starts during 2025-26." sortKey="ninetiethPercentile" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="Corners (25/26)" tooltip="Total corner kicks taken across the 2025-26 season." sortKey="corners" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="FK Shots (25/26)" tooltip="Total direct free-kick shots taken across the 2025-26 season." sortKey="freeKickShots" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${SET_PIECES_COLUMN_WIDTH} border-b border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><HeaderTooltip description="Current 2026-27 set-piece duty order at the player's club — P = penalties, C = corners, FK = direct free kicks. Lower number = higher priority."><span className="leading-tight">Set<br />Pieces</span></HeaderTooltip></th>
            </tr>
          </thead>
          <tbody className="[&>tr>td]:!py-1">
            {filteredAndSortedPlayers.map((player, index) => {
              const isPicked = pickedPlayerIds.has(player.id);
              const isWatchlisted = watchlistedPlayerIds.has(player.id);
              const rowShade = isPicked ? "bg-slate-100" : index % 2 === 0 ? "bg-white" : "bg-slate-50";
              const position = positionLetter(player.position);
              const setPieces = setPieceLabel(player.setPieces);
              const injuryIndicator = injuryStatusIndicator(player.chanceOfPlaying, player.availabilityStatus);
              const injuryTitle = player.availabilityNews?.trim() || injuryIndicator?.label;

              return (
                <tr key={player.id} className={`group ${rowShade} ${isPicked ? "text-slate-500 opacity-60" : "text-brand-dark"} transition-colors hover:bg-brand-green/10`}>
                  <td className={`sticky left-0 z-20 ${WATCHLIST_COLUMN_WIDTH} border-b border-r border-slate-200 px-1 py-1.5 text-center ${rowShade} group-hover:bg-brand-green/10`}>
                    <button type="button" onClick={() => toggleBoardFlag(player.id, "watchlisted")} aria-label={isWatchlisted ? `Remove ${player.name} from watchlist` : `Add ${player.name} to watchlist`} aria-pressed={isWatchlisted} className={`text-base leading-none ${isWatchlisted ? "text-amber-500" : "text-slate-400 hover:text-amber-500"}`}>
                      <span aria-hidden="true">{isWatchlisted ? "★" : "☆"}</span>
                    </button>
                  </td>
                  <td className={`sticky left-10 z-20 ${PICKED_COLUMN_WIDTH} border-b border-r border-slate-200 px-1 py-1.5 text-center ${rowShade} group-hover:bg-brand-green/10`}>
                    <input type="checkbox" checked={pickedPlayerIds.has(player.id)} onChange={() => toggleBoardFlag(player.id, "picked")} aria-label={`Mark ${player.name} as picked`} className="h-4 w-4 accent-brand-green" />
                  </td>
                  <td className={`sticky left-24 z-20 ${PLAYER_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 font-semibold ${isPicked ? "text-slate-500" : "text-brand-dark"} ${rowShade} group-hover:bg-brand-green/10`}>
                    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                      <Link href={`/portal/players/${player.id}`} prefetch={false} className={`min-w-0 flex-1 truncate ${isPicked ? "line-through hover:text-slate-500" : "hover:text-brand-green"}`} title={player.name}>{player.name}</Link>
                      {injuryIndicator ? <span title={injuryTitle} aria-label={injuryTitle} className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ${injuryIndicator.className}`} /> : null}
                    </span>
                  </td>
                  <td className={`sticky left-[288px] z-20 ${POSITION_COLUMN_WIDTH} border-b border-r border-slate-200 px-1 py-1.5 text-center ${rowShade} group-hover:bg-brand-green/10`}><span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${positionBadgeClass(player.position)}`}>{position}</span></td>
                  <td className={`${TEAM_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 font-medium ${isPicked ? "text-slate-500" : "text-slate-600"}`}>{player.team}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{player.adp == null ? "—" : formatNumber(player.adp, 1)}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{player.rank}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{formatAdpDelta(player)}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{formatNumber(player.stats.season_pts)}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{formatNumber(fantasyPtsPerGame(player))}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{formatNumber(player.stats.fantasy_pts_per_start)}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{formatNumber(player.stats.ghost_pts_per_start)}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{formatNumber(player.stats.ghost_pts_pct)}%</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{player.stats.games_started}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{formatNumber(player.stats.tenth_percentile_per_start)}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{formatNumber(player.stats.ninetieth_percentile_per_start)}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{player.corners}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{player.freeKickShots}</td>
                  <td className={`${SET_PIECES_COLUMN_WIDTH} border-b border-slate-200 px-2 py-1.5`}>{setPieces ? <span className="inline-flex max-w-full truncate rounded-full bg-brand-green/10 px-2 py-0.5 text-[10px] font-semibold text-brand-green">{setPieces}</span> : "—"}</td>
                </tr>
              );
            })}
            {filteredAndSortedPlayers.length === 0 ? (
              <tr><td colSpan={19} className="border-b border-slate-200 bg-slate-50 px-4 !py-6 text-center text-slate-500">No players match the current filters.</td></tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </div>

      {isResetDialogOpen ? createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-draft-title"
            aria-describedby="new-draft-description"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <h2 id="new-draft-title" className="text-lg font-black text-brand-dark">Start a new draft?</h2>
            <p id="new-draft-description" className="mt-2 text-sm leading-relaxed text-slate-600">
              This will clear ALL your Picked and Watchlist marks for every player. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsResetDialogOpen(false)}
                disabled={isResetting}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-brand-dark hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void resetDraftBoard()}
                disabled={isResetting}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResetting ? "Wiping…" : "Yes, wipe my board"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
