"use client";

import type { PlayerWindowStats } from "@/lib/portal/playerMetrics";
import { injuryStatusIndicator } from "@/lib/portal/injuryStatus";
import { createClient } from "@/lib/supabase";
import HeaderTooltip from "@/components/portal/HeaderTooltip";
import { DndContext, type DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  tier: number | null;
  tierOrder: number | null;
};

type RoleFilter = "penalties" | "corners" | "directFreekicks";
type TierNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type TierAssignment = { tier: TierNumber; tierOrder: number };
type SortKey =
  | "name"
  | "adp"
  | "rank"
  | "adpVsRank"
  | "seasonPts"
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
const MY_RANK_POSITION_COLUMN_WIDTH = "w-10 min-w-10";
const PICKED_COLUMN_WIDTH = "w-14 min-w-14";
const PLAYER_COLUMN_WIDTH = "w-48 min-w-48";
const POSITION_COLUMN_WIDTH = "w-10 min-w-10";
const TEAM_COLUMN_WIDTH = "w-14 min-w-14";
const NUMERIC_COLUMN_WIDTH = "w-20 min-w-20";
const TIER_COLUMN_WIDTH = "w-28 min-w-28";
const SET_PIECES_COLUMN_WIDTH = "w-24 min-w-24";
const TIERS: Array<{ number: TierNumber; label: string; className: string }> = [
  { number: 1, label: "Elite", className: "border border-violet-400 bg-violet-100 text-violet-950" },
  { number: 2, label: "High-end", className: "border border-sky-400 bg-sky-100 text-sky-950" },
  { number: 3, label: "Starter", className: "border border-teal-400 bg-teal-100 text-teal-950" },
  { number: 4, label: "Solid", className: "border border-lime-400 bg-lime-100 text-lime-950" },
  { number: 5, label: "Rotation", className: "border border-amber-400 bg-amber-100 text-amber-950" },
  { number: 6, label: "Depth", className: "border border-orange-400 bg-orange-100 text-orange-950" },
  { number: 7, label: "Late Target", className: "border border-stone-400 bg-stone-100 text-stone-800" },
];

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

function myRankValue(player: DraftToolPlayer, customRanks: Map<string, number>): number | null {
  return customRanks.get(player.id) ?? player.adp;
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

function SortableRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: (sortable: ReturnType<typeof useSortable>) => ReactNode;
}) {
  const sortable = useSortable({ id, disabled });
  return <>{children(sortable)}</>;
}

export default function DraftToolTableClient({ players }: { players: DraftToolPlayer[] }) {
  const [customRanks, setCustomRanks] = useState<Map<string, number>>(() => new Map(
    players.flatMap((player) => player.customRank == null ? [] : [[player.id, player.customRank] as const])
  ));
  const customRanksRef = useRef(new Map(
    players.flatMap((player) => player.customRank == null ? [] : [[player.id, player.customRank] as const])
  ));
  const [pickedPlayerIds, setPickedPlayerIds] = useState<Set<string>>(() => new Set(players.filter((player) => player.picked).map((player) => player.id)));
  const [watchlistedPlayerIds, setWatchlistedPlayerIds] = useState<Set<string>>(() => new Set(players.filter((player) => player.watchlisted).map((player) => player.id)));
  const boardStateRef = useRef({
    picked: new Set(players.filter((player) => player.picked).map((player) => player.id)),
    watchlisted: new Set(players.filter((player) => player.watchlisted).map((player) => player.id)),
  });
  const saveVersionRef = useRef(new Map<string, number>());
  const [tierAssignments, setTierAssignments] = useState<Map<string, TierAssignment>>(() => new Map(
    players.flatMap((player) => player.tier == null || player.tierOrder == null ? [] : [[player.id, { tier: player.tier as TierNumber, tierOrder: player.tierOrder }] as const])
  ));
  const tierAssignmentsRef = useRef(new Map(
    players.flatMap((player) => player.tier == null || player.tierOrder == null ? [] : [[player.id, { tier: player.tier as TierNumber, tierOrder: player.tierOrder }] as const])
  ));
  const tierSaveVersionRef = useRef(new Map<string, number>());
  const [tierMenuPlayerId, setTierMenuPlayerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [positionFilter, setPositionFilter] = useState<(typeof POSITION_FILTERS)[number]>("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [selectedRoles, setSelectedRoles] = useState<Set<RoleFilter>>(new Set());
  const [hideDrafted, setHideDrafted] = useState(false);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("adp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [isMyRankMode, setIsMyRankMode] = useState(false);
  const [isSavingCustomRank, setIsSavingCustomRank] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isRankResetDialogOpen, setIsRankResetDialogOpen] = useState(false);
  const [isResettingRank, setIsResettingRank] = useState(false);

  const teams = useMemo(
    () => [...new Set(players.map((player) => player.team))].sort((a, b) => a.localeCompare(b)),
    [players]
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const dragEnabled = isMyRankMode && !isSavingCustomRank;

  const globalRankedPlayers = useMemo(() => [...players].sort((a, b) => {
    const aValue = myRankValue(a, customRanks);
    const bValue = myRankValue(b, customRanks);
    if (aValue == null) return bValue == null ? a.name.localeCompare(b.name) : 1;
    if (bValue == null) return -1;
    return aValue - bValue || a.name.localeCompare(b.name);
  }), [customRanks, players]);

  const tieredBoardRanks = useMemo(() => new Map(
    players
      .flatMap((player) => {
        const assignment = tierAssignments.get(player.id);
        return assignment ? [{ player, assignment }] : [];
      })
      .sort((a, b) => a.assignment.tier - b.assignment.tier || a.assignment.tierOrder - b.assignment.tierOrder || a.player.name.localeCompare(b.player.name))
      .map(({ player }, index) => [player.id, index + 1] as const)
  ), [players, tierAssignments]);

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
        const aValue = myRankValue(a, customRanks);
        const bValue = myRankValue(b, customRanks);
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
  }, [customRanks, deferredSearch, hideDrafted, isMyRankMode, pickedPlayerIds, players, positionFilter, selectedRoles, sortDir, sortKey, teamFilter, watchlistOnly, watchlistedPlayerIds]);

  function applyCustomRanks(next: Map<string, number>) {
    customRanksRef.current = next;
    setCustomRanks(next);
  }

  function applyBoardState(picked: Set<string>, watchlisted: Set<string>) {
    boardStateRef.current = { picked, watchlisted };
    setPickedPlayerIds(picked);
    setWatchlistedPlayerIds(watchlisted);
  }

  function applyTierAssignments(next: Map<string, TierAssignment>) {
    tierAssignmentsRef.current = next;
    setTierAssignments(next);
  }

  async function persistTierAssignment(playerId: string, previous: Map<string, TierAssignment>, next: Map<string, TierAssignment>) {
    const version = (tierSaveVersionRef.current.get(playerId) ?? 0) + 1;
    tierSaveVersionRef.current.set(playerId, version);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Your session has expired. Please sign in again.");

      const assignment = next.get(playerId);
      const { error } = await supabase.from("draft_picks").upsert(
        {
          user_id: user.id,
          player_id: playerId,
          tier: assignment?.tier ?? null,
          tier_order: assignment?.tierOrder ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,player_id" }
      );
      if (error) throw error;
    } catch (error) {
      if (tierSaveVersionRef.current.get(playerId) === version) {
        applyTierAssignments(previous);
        setSaveError(error instanceof Error ? error.message : "Unable to save this player's tier.");
      }
    }
  }

  function setPlayerTier(playerId: string, tier: TierNumber | null) {
    setSaveError(null);
    const previous = new Map(tierAssignmentsRef.current);
    const next = new Map(previous);

    if (tier == null) {
      next.delete(playerId);
    } else {
      const maxTierOrder = Math.max(
        0,
        ...Array.from(next.values())
          .filter((assignment) => assignment.tier === tier)
          .map((assignment) => assignment.tierOrder)
      );
      next.set(playerId, { tier, tierOrder: maxTierOrder + 10 });
    }

    applyTierAssignments(next);
    setTierMenuPlayerId(null);
    void persistTierAssignment(playerId, previous, next);
  }

  async function handleRankDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!dragEnabled || !over || active.id === over.id) return;

    const visibleOrder = filteredAndSortedPlayers;
    const oldIndex = visibleOrder.findIndex((player) => player.id === active.id);
    const newIndex = visibleOrder.findIndex((player) => player.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(visibleOrder, oldIndex, newIndex);
    const previousRanks = new Map(customRanksRef.current);
    const needsMaterialization = players.some((player) => !previousRanks.has(player.id));
    const materializedRanks = needsMaterialization
      ? new Map(globalRankedPlayers.map((player, index) => [player.id, (index + 1) * 10]))
      : new Map(previousRanks);
    const movedPlayer = reordered[newIndex];
    const globalOrderWithoutMoved = globalRankedPlayers.filter((player) => player.id !== movedPlayer.id);
    const nextVisiblePlayer = reordered[newIndex + 1];
    const previousVisiblePlayer = reordered[newIndex - 1];
    const nextVisibleGlobalIndex = nextVisiblePlayer
      ? globalOrderWithoutMoved.findIndex((player) => player.id === nextVisiblePlayer.id)
      : -1;
    const previousVisibleGlobalIndex = previousVisiblePlayer
      ? globalOrderWithoutMoved.findIndex((player) => player.id === previousVisiblePlayer.id)
      : -1;
    const globalAbovePlayer = nextVisibleGlobalIndex >= 0
      ? globalOrderWithoutMoved[nextVisibleGlobalIndex - 1]
      : previousVisibleGlobalIndex >= 0
        ? globalOrderWithoutMoved[previousVisibleGlobalIndex]
        : undefined;
    const globalBelowPlayer = nextVisibleGlobalIndex >= 0
      ? globalOrderWithoutMoved[nextVisibleGlobalIndex]
      : previousVisibleGlobalIndex >= 0
        ? globalOrderWithoutMoved[previousVisibleGlobalIndex + 1]
        : undefined;
    const aboveRank = globalAbovePlayer ? materializedRanks.get(globalAbovePlayer.id) : undefined;
    const belowRank = globalBelowPlayer ? materializedRanks.get(globalBelowPlayer.id) : undefined;
    const nextCustomRank = aboveRank == null
      ? (belowRank == null ? 10 : belowRank - 10)
      : (belowRank == null ? aboveRank + 10 : (aboveRank + belowRank) / 2);
    const nextRanks = new Map(materializedRanks);
    nextRanks.set(movedPlayer.id, nextCustomRank);

    applyCustomRanks(nextRanks);
    setIsSavingCustomRank(true);
    setSaveError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Your session has expired. Please sign in again.");

      if (needsMaterialization) {
        const { error: materializationError } = await supabase.from("draft_picks").upsert(
          globalRankedPlayers.map((player) => ({
            user_id: user.id,
            player_id: player.id,
            custom_rank: materializedRanks.get(player.id),
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "user_id,player_id" }
        );
        if (materializationError) throw materializationError;
      }

      const { error: rankError } = await supabase.from("draft_picks").upsert(
        {
          user_id: user.id,
          player_id: movedPlayer.id,
          custom_rank: nextCustomRank,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,player_id" }
      );
      if (rankError) throw rankError;
    } catch (error) {
      applyCustomRanks(previousRanks);
      setSaveError(error instanceof Error ? error.message : "Unable to save your custom ranking.");
    } finally {
      setIsSavingCustomRank(false);
    }
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
    applyBoardState(new Set(), boardStateRef.current.watchlisted);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Your session has expired. Please sign in again.");

      const { error } = await supabase
        .from("draft_picks")
        .update({ picked: false, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (error) throw error;

      setIsResetDialogOpen(false);
    } catch (error) {
      applyBoardState(previous.picked, previous.watchlisted);
      setSaveError(error instanceof Error ? error.message : "Unable to clear your draft board.");
    } finally {
      setIsResetting(false);
    }
  }

  async function resetMyRank() {
    setIsResettingRank(true);
    setSaveError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Your session has expired. Please sign in again.");

      const { error } = await supabase
        .from("draft_picks")
        .update({ custom_rank: null })
        .eq("user_id", user.id);
      if (error) throw error;

      applyCustomRanks(new Map());
      setIsRankResetDialogOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to reset your custom ranking.");
    } finally {
      setIsResettingRank(false);
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
  const tableWidth = isMyRankMode ? "1592px" : "1552px";
  const stickyOffsets = isMyRankMode
    ? { watchlist: "left-10", picked: "left-20", player: "left-[136px]", position: "left-[328px]" }
    : { watchlist: "left-0", picked: "left-10", player: "left-24", position: "left-[288px]" };

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
          className={`whitespace-nowrap rounded-lg border px-3 py-2 text-[11px] font-bold transition-colors ${
            isMyRankMode
              ? "border-brand-green bg-brand-green text-brand-cream"
              : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
          }`}
        >
          Rank Players
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

      {isMyRankMode ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-green/20 bg-brand-green/10 px-3 py-1.5 text-xs font-semibold text-brand-green">
          <span>Rank Players — drag rows to set your order. Your rankings are saved automatically and will be here next time you log in.</span>
          <button
            type="button"
            onClick={() => setIsRankResetDialogOpen(true)}
            className="shrink-0 rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700 transition-colors hover:bg-red-100"
          >
            Reset Rankings
          </button>
        </div>
      ) : null}

      <div className="max-w-full overflow-x-auto">
        <div className="max-h-[75vh] w-max overflow-y-auto rounded-lg border border-slate-200 bg-white [scrollbar-gutter:stable]">
        <table style={{ width: tableWidth }} className="table-fixed border-separate border-spacing-0 text-left text-xs">
          <colgroup>
            {isMyRankMode ? <col style={{ width: "40px" }} /> : null}
            <col style={{ width: "40px" }} />
            <col style={{ width: "56px" }} />
            <col style={{ width: "192px" }} />
            <col style={{ width: "40px" }} />
            <col style={{ width: "56px" }} />
            {Array.from({ length: 3 }, (_, index) => <col key={index} style={{ width: "80px" }} />)}
            <col style={{ width: "112px" }} />
            {Array.from({ length: 9 }, (_, index) => <col key={index} style={{ width: "80px" }} />)}
            <col style={{ width: "96px" }} />
          </colgroup>
          <thead>
            <tr>
              {isMyRankMode ? <th aria-label="Personal draft position" className={`sticky left-0 top-0 z-30 h-16 ${MY_RANK_POSITION_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}>My<br />#</th> : null}
              <th aria-label="Watchlist" className={`sticky ${stickyOffsets.watchlist} top-0 z-30 h-16 ${WATCHLIST_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><span aria-hidden="true">★</span></th>
              <th className={`sticky ${stickyOffsets.picked} top-0 z-30 h-16 ${PICKED_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}>Picked?</th>
              <th className={`sticky ${stickyOffsets.player} top-0 z-30 h-16 ${PLAYER_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}>
                <button type="button" onClick={() => handleSort("name")} className="inline-flex w-full items-center justify-center gap-1"><span>Player</span><span aria-hidden="true">{sortArrow("name")}</span></button>
              </th>
              <th className={`sticky ${stickyOffsets.position} top-0 z-30 h-16 ${POSITION_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}>POS</th>
              <th className={`sticky top-0 z-20 h-16 ${TEAM_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}>Team</th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="ADP" tooltip="Average draft position across current 2026-27 Fantrax drafts. Refreshed daily; lower means drafted earlier." sortKey="adp" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="Rank (25/26)" tooltip="Player's finish position among the full pool, ranked by total Fantasy Points scored in 2025-26. 1 = highest scorer." sortKey="rank" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="ADP v Rank (25/26)" tooltip="Current ADP minus last season's Rank. Positive means the player is being drafted lower than last season's output would justify (potential value). Negative means drafted higher than last season's output justified." sortKey="adpVsRank" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${TIER_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}>Tier</th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="FPts (25/26)" tooltip="Total Fantasy Points scored in 2025-26." sortKey="seasonPts" onSort={handleSort} sortArrow={sortArrow} /></th>
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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRankDragEnd}>
            <SortableContext items={filteredAndSortedPlayers.map((player) => player.id)} strategy={verticalListSortingStrategy}>
            {filteredAndSortedPlayers.map((player, index) => {
              const isPicked = pickedPlayerIds.has(player.id);
              const isWatchlisted = watchlistedPlayerIds.has(player.id);
              const rowShade = isPicked ? "bg-slate-100" : index % 2 === 0 ? "bg-white" : "bg-slate-50";
              const position = positionLetter(player.position);
              const setPieces = setPieceLabel(player.setPieces);
              const tierAssignment = tierAssignments.get(player.id);
              const tierDefinition = tierAssignment ? TIERS.find((tier) => tier.number === tierAssignment.tier) : null;
              const tierBoardRank = tieredBoardRanks.get(player.id);
              const isTierMenuOpen = tierMenuPlayerId === player.id;
              const injuryIndicator = injuryStatusIndicator(player.chanceOfPlaying, player.availabilityStatus);
              const injuryTitle = player.availabilityNews?.trim() || injuryIndicator?.label;

              return (
                <SortableRow key={player.id} id={player.id} disabled={!dragEnabled}>
                  {({ attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging }) => (
                <tr ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`group ${rowShade} ${isPicked ? "text-slate-500 opacity-60" : "text-brand-dark"} ${isDragging ? "relative z-30 opacity-80 shadow-lg" : ""} transition-colors hover:bg-brand-green/10`}>
                  {isMyRankMode ? <td className={`sticky left-0 z-20 ${MY_RANK_POSITION_COLUMN_WIDTH} border-b border-r border-slate-200 px-1 py-1.5 text-center font-semibold tabular-nums ${rowShade} group-hover:bg-brand-green/10`}>{index + 1}</td> : null}
                  <td className={`sticky ${stickyOffsets.watchlist} z-20 ${WATCHLIST_COLUMN_WIDTH} border-b border-r border-slate-200 px-1 py-1.5 text-center ${rowShade} group-hover:bg-brand-green/10`}>
                    <div className="flex items-center justify-center gap-0.5">
                      <button type="button" onClick={() => toggleBoardFlag(player.id, "watchlisted")} aria-label={isWatchlisted ? `Remove ${player.name} from watchlist` : `Add ${player.name} to watchlist`} aria-pressed={isWatchlisted} className={`text-base leading-none ${isWatchlisted ? "text-amber-500" : "text-slate-400 hover:text-amber-500"}`}>
                        <span aria-hidden="true">{isWatchlisted ? "★" : "☆"}</span>
                      </button>
                      {isMyRankMode ? (
                        <button
                          ref={setActivatorNodeRef}
                          type="button"
                          {...attributes}
                          {...listeners}
                          disabled={!dragEnabled}
                          aria-label={dragEnabled ? `Drag ${player.name} to reorder` : "Saving custom ranking"}
                          title={dragEnabled ? "Drag to reorder" : "Saving custom ranking"}
                          className={`touch-none text-sm leading-none ${dragEnabled ? "cursor-grab text-slate-500 active:cursor-grabbing" : "cursor-not-allowed text-slate-300"}`}
                        >
                          <span aria-hidden="true">⠿</span>
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className={`sticky ${stickyOffsets.picked} z-20 ${PICKED_COLUMN_WIDTH} border-b border-r border-slate-200 px-1 py-1.5 text-center ${rowShade} group-hover:bg-brand-green/10`}>
                    <input type="checkbox" checked={pickedPlayerIds.has(player.id)} onChange={() => toggleBoardFlag(player.id, "picked")} aria-label={`Mark ${player.name} as picked`} className="h-4 w-4 accent-brand-green" />
                  </td>
                  <td className={`sticky ${stickyOffsets.player} z-20 ${PLAYER_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 font-semibold ${isPicked ? "text-slate-500" : "text-brand-dark"} ${rowShade} group-hover:bg-brand-green/10`}>
                    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                      <Link href={`/portal/players/${player.id}`} prefetch={false} className={`min-w-0 flex-1 truncate ${isPicked ? "line-through hover:text-slate-500" : "hover:text-brand-green"}`} title={player.name}>{player.name}</Link>
                      {injuryIndicator ? <span title={injuryTitle} aria-label={injuryTitle} className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ${injuryIndicator.className}`} /> : null}
                    </span>
                  </td>
                  <td className={`sticky ${stickyOffsets.position} z-20 ${POSITION_COLUMN_WIDTH} border-b border-r border-slate-200 px-1 py-1.5 text-center ${rowShade} group-hover:bg-brand-green/10`}><span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${positionBadgeClass(player.position)}`}>{position}</span></td>
                  <td className={`${TEAM_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 font-medium ${isPicked ? "text-slate-500" : "text-slate-600"}`}>{player.team}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{player.adp == null ? "—" : formatNumber(player.adp, 1)}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{player.rank}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{formatAdpDelta(player)}</td>
                  <td className={`relative ${TIER_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-center`}>
                    {tierAssignment && tierDefinition ? (
                      <span className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => setTierMenuPlayerId(isTierMenuOpen ? null : player.id)} aria-label={`Change ${player.name}'s tier`} aria-expanded={isTierMenuOpen} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tierDefinition.className}`}>
                          {tierDefinition.label}
                        </button>
                        <span className="text-[10px] font-semibold tabular-nums text-slate-500">#{tierBoardRank}</span>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setTierMenuPlayerId(isTierMenuOpen ? null : player.id)} aria-label={`Add ${player.name} to a tier`} aria-expanded={isTierMenuOpen} className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-sm font-semibold leading-none text-slate-500 hover:border-brand-green hover:text-brand-green">
                        +
                      </button>
                    )}
                    {isTierMenuOpen ? (
                      <div className="absolute left-1/2 z-40 mt-1 w-36 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-1 text-left shadow-lg">
                        {TIERS.map((tier) => (
                          <button key={tier.number} type="button" onClick={() => setPlayerTier(player.id, tier.number)} aria-pressed={tierAssignment?.tier === tier.number} className={`flex w-full items-center justify-between rounded px-2 py-1 text-xs hover:bg-slate-100 ${tierAssignment?.tier === tier.number ? "bg-slate-100 font-semibold" : ""}`}>
                            <span>{tier.label}</span>{tierAssignment?.tier === tier.number ? <span aria-hidden="true">✓</span> : null}
                          </button>
                        ))}
                        {tierAssignment ? <button type="button" onClick={() => setPlayerTier(player.id, null)} className="mt-1 w-full rounded border-t border-slate-200 px-2 py-1 text-left text-xs font-semibold text-red-700 hover:bg-red-50">Remove from tier</button> : null}
                      </div>
                    ) : null}
                  </td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{formatNumber(player.stats.season_pts)}</td>
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
                  )}
                </SortableRow>
              );
            })}
            {filteredAndSortedPlayers.length === 0 ? (
              <tr><td colSpan={isMyRankMode ? 20 : 19} className="border-b border-slate-200 bg-slate-50 px-4 !py-6 text-center text-slate-500">No players match the current filters.</td></tr>
            ) : null}
            </SortableContext>
            </DndContext>
          </tbody>
        </table>
        </div>
      </div>

      {isRankResetDialogOpen ? createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-my-rank-title"
            aria-describedby="reset-my-rank-description"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <h2 id="reset-my-rank-title" className="text-lg font-black text-brand-dark">Reset your rankings?</h2>
            <p id="reset-my-rank-description" className="mt-2 text-sm leading-relaxed text-slate-600">
              This clears your personal ranking order for all players. Your Picked and Watchlist marks are NOT affected. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRankResetDialogOpen(false)}
                disabled={isResettingRank}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-brand-dark hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void resetMyRank()}
                disabled={isResettingRank}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResettingRank ? "Resetting…" : "Yes, reset my rankings"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

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
              This will clear only the drafted (Picked) checkmarks for every player. Your Watchlist, rankings, and tiers will be kept.
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
                {isResetting ? "Clearing…" : "Yes, clear drafted players"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
