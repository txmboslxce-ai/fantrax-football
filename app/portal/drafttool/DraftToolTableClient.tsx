"use client";

import type { PlayerWindowStats } from "@/lib/portal/playerMetrics";
import { injuryStatusIndicator } from "@/lib/portal/injuryStatus";
import { createClient } from "@/lib/supabase";
import HeaderTooltip from "@/components/portal/HeaderTooltip";
import { DndContext, type DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { Fragment, type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DraftToolPlayer = {
  id: string;
  fantrax_id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  multi_position: string | null;
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
  goals: number;
  assists: number;
  adp: number | null;
  rank: number;
  picked: boolean;
  watchlisted: boolean;
  customRank: number | null;
  watchlistOrder: number | null;
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
  | "tier"
  | "seasonPts"
  | "fantasyPtsPerStart"
  | "ghostPtsPerStart"
  | "ghostPtsPct"
  | "gamesStarted"
  | "tenthPercentile"
  | "ninetiethPercentile"
  | "corners"
  | "freeKickShots"
  | "goals"
  | "assists";

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
const TIERS: Array<{ number: TierNumber; label: string; className: string; dividerClassName: string }> = [
  { number: 1, label: "Elite", className: "border border-violet-400 bg-violet-100 text-violet-950", dividerClassName: "bg-[#EEEDFE] text-[#26215C]" },
  { number: 2, label: "Great", className: "border border-sky-400 bg-sky-100 text-sky-950", dividerClassName: "bg-[#E6F1FB] text-[#042C53]" },
  { number: 3, label: "Good", className: "border border-teal-400 bg-teal-100 text-teal-950", dividerClassName: "bg-[#E1F5EE] text-[#04342C]" },
  { number: 4, label: "Fine", className: "border border-lime-400 bg-lime-100 text-lime-950", dividerClassName: "bg-[#EAF3DE] text-[#173404]" },
  { number: 5, label: "Depth", className: "border border-amber-400 bg-amber-100 text-amber-950", dividerClassName: "bg-[#FAEEDA] text-[#412402]" },
  { number: 6, label: "Bench", className: "border border-orange-400 bg-orange-100 text-orange-950", dividerClassName: "bg-[#FAECE7] text-[#4A1B0C]" },
  { number: 7, label: "LateRd", className: "border border-stone-400 bg-stone-100 text-stone-800", dividerClassName: "bg-[#F1EFE8] text-[#2C2C2A]" },
];

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.round(value), min), max);
}

function snakePick(numTeams: number, slot: number, round: number): number {
  return round % 2 === 1 ? (round - 1) * numTeams + slot : round * numTeams - slot + 1;
}

function positionLetter(position: DraftToolPlayer["position"]): "G" | "D" | "M" | "F" {
  if (position === "GK") return "G";
  if (position === "DEF") return "D";
  if (position === "MID") return "M";
  return "F";
}

function eligiblePositionLetters(
  player: DraftToolPlayer,
  multiMode: boolean
): Set<"G" | "D" | "M" | "F"> {
  const primary = positionLetter(player.position);
  if (!multiMode || !player.multi_position) return new Set([primary]);
  const letters = player.multi_position
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is "G" | "D" | "M" | "F" => ["G", "D", "M", "F"].includes(s));
  return letters.length > 0 ? new Set(letters) : new Set([primary]);
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

function sortValue(
  player: DraftToolPlayer,
  key: SortKey,
  tierAssignments: Map<string, TierAssignment>,
  tieredBoardRanks: Map<string, number>
): string | number | null {
  switch (key) {
    case "name": return player.name;
    case "adp": return player.adp;
    case "rank": return player.rank;
    case "adpVsRank": return adpVsRank(player);
    case "tier": {
      const assignment = tierAssignments.get(player.id);
      const boardRank = tieredBoardRanks.get(player.id);
      return assignment && boardRank != null ? assignment.tier * 100000 + boardRank : null;
    }
    case "seasonPts": return player.stats.season_pts;
    case "fantasyPtsPerStart": return player.stats.fantasy_pts_per_start;
    case "ghostPtsPerStart": return player.stats.ghost_pts_per_start;
    case "ghostPtsPct": return player.stats.ghost_pts_pct;
    case "gamesStarted": return player.stats.games_started;
    case "tenthPercentile": return player.stats.tenth_percentile_per_start;
    case "ninetiethPercentile": return player.stats.ninetieth_percentile_per_start;
    case "corners": return player.corners;
    case "freeKickShots": return player.freeKickShots;
    case "goals": return player.goals;
    case "assists": return player.assists;
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
  const [watchlistOrder, setWatchlistOrder] = useState<Map<string, number>>(
    () => new Map(players.flatMap((p) => p.watchlistOrder == null ? [] : [[p.id, p.watchlistOrder] as const]))
  );
  const watchlistOrderRef = useRef(new Map(
    players.flatMap((p) => p.watchlistOrder == null ? [] : [[p.id, p.watchlistOrder] as const])
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
  const tierMenuRef = useRef<HTMLTableCellElement | null>(null);
  const [isDraftSetupOpen, setIsDraftSetupOpen] = useState(false);
  const draftSetupRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [positionFilter, setPositionFilter] = useState<(typeof POSITION_FILTERS)[number]>("All");
  const [numTeams, setNumTeams] = useState<number>(12);
  const [draftSlot, setDraftSlot] = useState<number | null>(null);
  const [draftRounds, setDraftRounds] = useState<number>(16);
  const [liveLeagueId, setLiveLeagueId] = useState<string>("");
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [liveDraftedIds, setLiveDraftedIds] = useState<Set<string>>(() => new Set());
  const [liveStatus, setLiveStatus] = useState<{ pickCount: number; totalSlots: number } | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const livePollInFlight = useRef(false);
  const hasLoggedConnectionRef = useRef(false);
  const lastPickCountRef = useRef<number | null>(null);
  const lastChangeAtRef = useRef<number>(Date.now());
  const pollIntervalMsRef = useRef<number>(5000);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [teamFilter, setTeamFilter] = useState("All");
  const [selectedRoles, setSelectedRoles] = useState<Set<RoleFilter>>(new Set());
  const [hideDrafted, setHideDrafted] = useState(false);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [isMultiPositionMode, setIsMultiPositionMode] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("adp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [isMyTiersOnly, setIsMyTiersOnly] = useState(false);
  const [isMyRankMode, setIsMyRankMode] = useState(false);
  const [isSavingCustomRank, setIsSavingCustomRank] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isRankResetDialogOpen, setIsRankResetDialogOpen] = useState(false);
  const [isResettingRank, setIsResettingRank] = useState(false);
  const [isTierResetDialogOpen, setIsTierResetDialogOpen] = useState(false);
  const [isResettingTiers, setIsResettingTiers] = useState(false);

  const teams = useMemo(
    () => [...new Set(players.map((player) => player.team))].sort((a, b) => a.localeCompare(b)),
    [players]
  );

  useEffect(() => {
    const savedTeams = window.localStorage.getItem("da_draft_num_teams");
    const savedSlot = window.localStorage.getItem("da_draft_slot");
    const savedRounds = window.localStorage.getItem("da_draft_rounds");
    const savedLive = window.localStorage.getItem("da_draft_live_league");
    if (savedTeams != null) setNumTeams(clampInt(Number(savedTeams), 2, 30));
    if (savedSlot != null && savedSlot !== "") setDraftSlot(clampInt(Number(savedSlot), 1, 30));
    if (savedRounds != null) setDraftRounds(clampInt(Number(savedRounds), 1, 40));
    if (savedLive != null) setLiveLeagueId(savedLive);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("da_draft_num_teams", String(numTeams));
  }, [numTeams]);

  useEffect(() => {
    window.localStorage.setItem("da_draft_rounds", String(draftRounds));
  }, [draftRounds]);

  useEffect(() => {
    window.localStorage.setItem("da_draft_live_league", liveLeagueId);
  }, [liveLeagueId]);

  useEffect(() => {
    window.localStorage.setItem("da_draft_slot", draftSlot == null ? "" : String(draftSlot));
  }, [draftSlot]);

  useEffect(() => {
    if (tierMenuPlayerId == null) return;

    function closeTierMenuOnOutsideClick(event: MouseEvent) {
      if (!tierMenuRef.current?.contains(event.target as Node)) setTierMenuPlayerId(null);
    }

    function closeTierMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setTierMenuPlayerId(null);
    }

    function closeTierMenuOnScroll() {
      setTierMenuPlayerId(null);
    }

    document.addEventListener("click", closeTierMenuOnOutsideClick);
    document.addEventListener("keydown", closeTierMenuOnEscape);
    document.addEventListener("scroll", closeTierMenuOnScroll, true);
    return () => {
      document.removeEventListener("click", closeTierMenuOnOutsideClick);
      document.removeEventListener("keydown", closeTierMenuOnEscape);
      document.removeEventListener("scroll", closeTierMenuOnScroll, true);
    };
  }, [tierMenuPlayerId]);

  useEffect(() => {
    if (!isDraftSetupOpen) return;
    function onClick(e: MouseEvent) {
      if (!draftSetupRef.current?.contains(e.target as Node)) setIsDraftSetupOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setIsDraftSetupOpen(false); }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [isDraftSetupOpen]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const dragEnabled = isMyRankMode && !isMyTiersOnly && !isSavingCustomRank;
  const watchlistDragEnabled = watchlistOnly && !isSavingCustomRank;

  const globalRankedPlayers = useMemo(() => [...players].sort((a, b) => {
    const aValue = myRankValue(a, customRanks);
    const bValue = myRankValue(b, customRanks);
    if (aValue == null) return bValue == null ? a.name.localeCompare(b.name) : 1;
    if (bValue == null) return -1;
    return aValue - bValue || a.name.localeCompare(b.name);
  }), [customRanks, players]);

  const globalWatchlistedPlayers = useMemo(() => players
    .filter((player) => watchlistedPlayerIds.has(player.id))
    .sort((a, b) => {
      const aValue = watchlistOrder.get(a.id);
      const bValue = watchlistOrder.get(b.id);
      if (aValue == null) {
        if (bValue != null) return 1;
        if (a.adp == null) return b.adp == null ? a.name.localeCompare(b.name) : 1;
        if (b.adp == null) return -1;
        return a.adp - b.adp || a.name.localeCompare(b.name);
      }
      if (bValue == null) return -1;
      return aValue - bValue || a.name.localeCompare(b.name);
    }), [players, watchlistOrder, watchlistedPlayerIds]);

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
      const positionFilterLetter =
        positionFilter === "All" ? null
          : positionFilter === "GK" ? "G"
            : positionFilter === "DEF" ? "D"
              : positionFilter === "MID" ? "M"
                : "F";
      const matchesPosition =
        positionFilterLetter === null ||
        eligiblePositionLetters(player, isMultiPositionMode).has(positionFilterLetter);
      const matchesTeam = teamFilter === "All" || player.team === teamFilter;
      const matchesDrafted = !hideDrafted || !(pickedPlayerIds.has(player.id) || liveDraftedIds.has(player.id));
      const matchesWatchlist = !watchlistOnly || watchlistedPlayerIds.has(player.id);
      const matchesTier = !isMyTiersOnly || tierAssignments.has(player.id);
      return matchesSearch && matchesPosition && matchesTeam && matchesAnySelectedRole(player, selectedRoles) && matchesDrafted && matchesWatchlist && matchesTier;
    });

    return [...filtered].sort((a, b) => {
      if (watchlistOnly) {
        const aValue = watchlistOrder.get(a.id);
        const bValue = watchlistOrder.get(b.id);
        if (aValue == null) {
          if (bValue != null) return 1;
          if (a.adp == null) return b.adp == null ? a.name.localeCompare(b.name) : 1;
          if (b.adp == null) return -1;
          return a.adp - b.adp || a.name.localeCompare(b.name);
        }
        if (bValue == null) return -1;
        return aValue - bValue || a.name.localeCompare(b.name);
      }

      if (isMyTiersOnly) {
        const aAssignment = tierAssignments.get(a.id)!;
        const bAssignment = tierAssignments.get(b.id)!;
        return aAssignment.tier - bAssignment.tier || aAssignment.tierOrder - bAssignment.tierOrder || a.name.localeCompare(b.name);
      }

      if (isMyRankMode) {
        const aValue = myRankValue(a, customRanks);
        const bValue = myRankValue(b, customRanks);
        if (aValue == null) return bValue == null ? a.name.localeCompare(b.name) : 1;
        if (bValue == null) return -1;
        return aValue - bValue || a.name.localeCompare(b.name);
      }

      const aValue = sortValue(a, sortKey, tierAssignments, tieredBoardRanks);
      const bValue = sortValue(b, sortKey, tierAssignments, tieredBoardRanks);
      if (sortKey === "tier" && aValue == null && bValue == null) {
        if (a.adp == null) return b.adp == null ? a.name.localeCompare(b.name) : 1;
        if (b.adp == null) return -1;
        return a.adp - b.adp || a.name.localeCompare(b.name);
      }
      if (aValue == null) return bValue == null ? a.name.localeCompare(b.name) : 1;
      if (bValue == null) return -1;
      if (typeof aValue === "string" && typeof bValue === "string") {
        return aValue.localeCompare(bValue) * (sortDir === "asc" ? 1 : -1);
      }
      return (Number(aValue) - Number(bValue)) * (sortDir === "asc" ? 1 : -1) || a.name.localeCompare(b.name);
    });
  }, [customRanks, deferredSearch, hideDrafted, isMultiPositionMode, isMyRankMode, isMyTiersOnly, liveDraftedIds, pickedPlayerIds, players, positionFilter, selectedRoles, sortDir, sortKey, teamFilter, tierAssignments, tieredBoardRanks, watchlistOnly, watchlistOrder, watchlistedPlayerIds]);

  const totalDrafted = players.reduce(
    (n, player) => n + (pickedPlayerIds.has(player.id) || liveDraftedIds.has(player.id) ? 1 : 0),
    0
  );

  const playerIdByFantraxId = useMemo(
    () => new Map(players.map((p) => [p.fantrax_id, p.id])),
    [players]
  );

  useEffect(() => {
    if (!isLiveConnected || !liveLeagueId) return;
    let cancelled = false;
    lastPickCountRef.current = null;
    lastChangeAtRef.current = Date.now();
    pollIntervalMsRef.current = 5000;

    async function poll() {
      if (livePollInFlight.current) return;
      livePollInFlight.current = true;
      try {
        const res = await fetch("/api/draft/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leagueId: liveLeagueId,
            logConnection: !hasLoggedConnectionRef.current,
          }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) { setLiveError(json?.error ?? "Live draft fetch failed"); return; }
        setLiveError(null);
        hasLoggedConnectionRef.current = true;

        const ids = new Set<string>();
        for (const scorerId of json.draftedScorerIds as string[]) {
          const pid = playerIdByFantraxId.get(`*${scorerId}*`);
          if (pid) ids.add(pid);
        }
        setLiveDraftedIds(ids);
        setLiveStatus({ pickCount: json.pickCount, totalSlots: json.totalSlots });

        if (json.pickCount >= json.totalSlots && json.totalSlots > 0) {
          setIsLiveConnected(false);
          return;
        }

        const now = Date.now();
        if (lastPickCountRef.current !== json.pickCount) {
          lastPickCountRef.current = json.pickCount;
          lastChangeAtRef.current = now;
          pollIntervalMsRef.current = 5000;
        } else if (now - lastChangeAtRef.current > 120000) {
          pollIntervalMsRef.current = 60000;
        }
      } catch (e) {
        if (!cancelled) setLiveError(e instanceof Error ? e.message : "Live draft fetch failed");
      } finally {
        livePollInFlight.current = false;
        if (!cancelled) {
          pollTimeoutRef.current = setTimeout(poll, pollIntervalMsRef.current);
        }
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [isLiveConnected, liveLeagueId, playerIdByFantraxId]);

  const myPicks = useMemo(
    () =>
      draftSlot == null
        ? []
        : Array.from({ length: draftRounds }, (_, i) => ({
            round: i + 1,
            overall: snakePick(numTeams, draftSlot, i + 1),
          })),
    [numTeams, draftSlot, draftRounds]
  );

  const pickLineByIndex = useMemo(() => {
    const map = new Map<number, { round: number; overall: number; onClock: boolean }>();
    if (draftSlot == null) return map;

    for (const pick of myPicks) {
      if (pick.overall <= totalDrafted) continue;

      const undraftedBefore = pick.overall - totalDrafted - 1;
      let undraftedCount = 0;
      let targetIndex: number | null = null;

      for (let index = 0; index < filteredAndSortedPlayers.length; index += 1) {
        const player = filteredAndSortedPlayers[index];
        const isUndrafted = !pickedPlayerIds.has(player.id) && !liveDraftedIds.has(player.id);
        if (!isUndrafted) continue;
        if (undraftedCount === undraftedBefore) {
          targetIndex = index;
          break;
        }
        undraftedCount += 1;
      }

      if (targetIndex != null && !map.has(targetIndex)) {
        map.set(targetIndex, { ...pick, onClock: undraftedBefore === 0 });
      }
    }
    return map;
  }, [draftSlot, filteredAndSortedPlayers, liveDraftedIds, myPicks, pickedPlayerIds, totalDrafted]);

  function toggleLiveConnection() {
    if (isLiveConnected) {
      setIsLiveConnected(false);
      hasLoggedConnectionRef.current = false;
      setLiveDraftedIds(new Set());
      setLiveStatus(null);
      setLiveError(null);
    } else if (liveLeagueId.trim()) {
      hasLoggedConnectionRef.current = false;
      setIsLiveConnected(true);
    }
  }

  function applyCustomRanks(next: Map<string, number>) {
    customRanksRef.current = next;
    setCustomRanks(next);
  }

  function applyWatchlistOrder(next: Map<string, number>) {
    watchlistOrderRef.current = next;
    setWatchlistOrder(next);
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

  async function persistTierReorder(playerIds: [string, string], previous: Map<string, TierAssignment>, next: Map<string, TierAssignment>) {
    const versions = playerIds.map((playerId) => {
      const version = (tierSaveVersionRef.current.get(playerId) ?? 0) + 1;
      tierSaveVersionRef.current.set(playerId, version);
      return version;
    });

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Your session has expired. Please sign in again.");

      const { error } = await supabase.from("draft_picks").upsert(
        playerIds.map((playerId) => {
          const assignment = next.get(playerId)!;
          return {
            user_id: user.id,
            player_id: playerId,
            tier: assignment.tier,
            tier_order: assignment.tierOrder,
            updated_at: new Date().toISOString(),
          };
        }),
        { onConflict: "user_id,player_id" }
      );
      if (error) throw error;
    } catch (error) {
      if (playerIds.every((playerId, index) => tierSaveVersionRef.current.get(playerId) === versions[index])) {
        applyTierAssignments(previous);
        setSaveError(error instanceof Error ? error.message : "Unable to reorder your tiers.");
      }
    }
  }

  function movePlayerWithinTier(playerId: string, direction: "up" | "down") {
    const playerIndex = filteredAndSortedPlayers.findIndex((player) => player.id === playerId);
    const adjacentPlayer = filteredAndSortedPlayers[playerIndex + (direction === "up" ? -1 : 1)];
    const playerAssignment = tierAssignmentsRef.current.get(playerId);
    const adjacentAssignment = adjacentPlayer ? tierAssignmentsRef.current.get(adjacentPlayer.id) : undefined;
    if (!playerAssignment || !adjacentPlayer || !adjacentAssignment || playerAssignment.tier !== adjacentAssignment.tier) return;

    setSaveError(null);
    const previous = new Map(tierAssignmentsRef.current);
    const next = new Map(previous);
    next.set(playerId, { ...playerAssignment, tierOrder: adjacentAssignment.tierOrder });
    next.set(adjacentPlayer.id, { ...adjacentAssignment, tierOrder: playerAssignment.tierOrder });
    applyTierAssignments(next);
    void persistTierReorder([playerId, adjacentPlayer.id], previous, next);
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

  async function handleWatchlistDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!watchlistDragEnabled || !over || active.id === over.id) return;

    const visibleOrder = filteredAndSortedPlayers;
    const oldIndex = visibleOrder.findIndex((player) => player.id === active.id);
    const newIndex = visibleOrder.findIndex((player) => player.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(visibleOrder, oldIndex, newIndex);
    const previousOrders = new Map(watchlistOrderRef.current);
    const needsMaterialization = globalWatchlistedPlayers.some((player) => !previousOrders.has(player.id));
    const materializedOrders = needsMaterialization
      ? new Map(globalWatchlistedPlayers.map((player, index) => [player.id, (index + 1) * 10]))
      : new Map(previousOrders);
    const movedPlayer = reordered[newIndex];
    const globalOrderWithoutMoved = globalWatchlistedPlayers.filter((player) => player.id !== movedPlayer.id);
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
    const aboveOrder = globalAbovePlayer ? materializedOrders.get(globalAbovePlayer.id) : undefined;
    const belowOrder = globalBelowPlayer ? materializedOrders.get(globalBelowPlayer.id) : undefined;
    const nextWatchlistOrder = aboveOrder == null
      ? (belowOrder == null ? 10 : belowOrder - 10)
      : (belowOrder == null ? aboveOrder + 10 : (aboveOrder + belowOrder) / 2);
    const nextOrders = new Map(materializedOrders);
    nextOrders.set(movedPlayer.id, nextWatchlistOrder);

    applyWatchlistOrder(nextOrders);
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
          globalWatchlistedPlayers.map((player) => ({
            user_id: user.id,
            player_id: player.id,
            watchlist_order: materializedOrders.get(player.id),
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "user_id,player_id" }
        );
        if (materializationError) throw materializationError;
      }

      const { error: watchlistOrderError } = await supabase.from("draft_picks").upsert(
        {
          user_id: user.id,
          player_id: movedPlayer.id,
          watchlist_order: nextWatchlistOrder,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,player_id" }
      );
      if (watchlistOrderError) throw watchlistOrderError;
    } catch (error) {
      applyWatchlistOrder(previousOrders);
      setSaveError(error instanceof Error ? error.message : "Unable to save your watchlist order.");
    } finally {
      setIsSavingCustomRank(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    if (watchlistOnly) {
      void handleWatchlistDragEnd(event);
    } else if (isMyRankMode) {
      void handleRankDragEnd(event);
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

  async function resetTiers() {
    setIsResettingTiers(true);
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
        .update({ tier: null, tier_order: null, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (error) throw error;

      applyTierAssignments(new Map());
      setIsTierResetDialogOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to reset your tiers.");
    } finally {
      setIsResettingTiers(false);
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
    if (isMyTiersOnly && nextKey === "tier") return;

    if (isMyRankMode) {
      setIsMyRankMode(false);
      setSortKey(nextKey);
      setSortDir(nextKey === "name" || nextKey === "tier" ? "asc" : "desc");
      return;
    }

    if (sortKey === nextKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDir(nextKey === "name" || nextKey === "tier" ? "asc" : "desc");
  }

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕");
  const tableWidth = isMyTiersOnly
    ? isMyRankMode ? "1792px" : "1752px"
    : isMyRankMode ? "1752px" : "1712px";
  const tableColumnCount = (isMyRankMode ? 22 : 21) + (isMyTiersOnly ? 1 : 0);
  const stickyOffsets = isMyTiersOnly
    ? isMyRankMode
      ? { myRank: "left-10", watchlist: "left-20", picked: "left-[120px]", player: "left-[176px]", position: "left-[368px]" }
      : { myRank: "left-0", watchlist: "left-10", picked: "left-20", player: "left-[136px]", position: "left-[328px]" }
    : isMyRankMode
      ? { myRank: "left-0", watchlist: "left-10", picked: "left-20", player: "left-[136px]", position: "left-[328px]" }
      : { myRank: "left-0", watchlist: "left-0", picked: "left-10", player: "left-24", position: "left-[288px]" };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <label className="h-[76px] w-full space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2 sm:w-40 sm:shrink-0">
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

        <div ref={draftSetupRef} className="relative flex h-[76px] flex-col justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
          <span className="block font-semibold uppercase tracking-wide text-slate-500">Draft Setup</span>
          <button
            type="button"
            onClick={() => setIsDraftSetupOpen((v) => !v)}
            aria-expanded={isDraftSetupOpen}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-[11px] font-bold text-brand-dark hover:bg-slate-50"
          >
            My Pick &amp; Live Draft
          </button>
          {isLiveConnected || (liveStatus != null && liveStatus.pickCount >= liveStatus.totalSlots) ? (
            <span className="block truncate text-[10px] font-semibold text-brand-green">
              {liveError ? <span className="text-red-600">{liveError}</span>
                : liveStatus ? liveStatus.pickCount >= liveStatus.totalSlots ? "Draft complete" : `Live · ${liveStatus.pickCount}/${liveStatus.totalSlots}` : "Connecting…"}
            </span>
          ) : null}
          {isDraftSetupOpen ? (
            <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
              <div className="space-y-3">
                <div>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">My Pick</span>
                  <div className="flex gap-2">
                    <label className="flex flex-col text-[10px] font-semibold text-slate-500">Teams
                      <input type="number" min={2} max={30} value={numTeams}
                        onChange={(e) => { const t = clampInt(Number(e.target.value), 2, 30); setNumTeams(t); setDraftSlot((s) => s == null ? s : Math.min(s, t)); }}
                        className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark focus:border-brand-green focus:outline-none" />
                    </label>
                    <label className="flex flex-col text-[10px] font-semibold text-slate-500">Slot
                      <input type="number" min={1} max={numTeams} value={draftSlot ?? ""} placeholder="—"
                        onChange={(e) => { const r = e.target.value; setDraftSlot(r === "" ? null : clampInt(Number(r), 1, numTeams)); }}
                        className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark placeholder:text-slate-400 focus:border-brand-green focus:outline-none" />
                    </label>
                    <label className="flex flex-col text-[10px] font-semibold text-slate-500">Rounds
                      <input type="number" min={1} max={40} value={draftRounds}
                        onChange={(e) => setDraftRounds(clampInt(Number(e.target.value), 1, 40))}
                        className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark focus:border-brand-green focus:outline-none" />
                    </label>
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Live Draft</span>
                  <div className="flex items-center gap-2">
                    <input type="text" value={liveLeagueId} onChange={(e) => setLiveLeagueId(e.target.value.trim())}
                      disabled={isLiveConnected} placeholder="League ID"
                      className="w-40 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark placeholder:text-slate-400 focus:border-brand-green focus:outline-none disabled:bg-slate-100" />
                    <button type="button" onClick={toggleLiveConnection}
                      className={`rounded border px-2 py-1 text-[11px] font-bold ${isLiveConnected ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100" : "border-brand-green bg-brand-green text-brand-cream hover:opacity-90"}`}>
                      {isLiveConnected ? "Stop" : "Connect"}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] leading-tight text-slate-500">
                    Find this in your Fantrax draft URL:{" "}
                    <span className="font-semibold text-slate-600">fantrax.com/fantasy/league/</span>
                    <span className="font-semibold text-brand-green">ID</span>
                    <span className="font-semibold text-slate-600">/draft</span>
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex h-[76px] items-stretch gap-2">
        <div className="grid grid-cols-3 gap-1.5">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-[11px] font-semibold text-brand-dark">
            <input
              type="checkbox"
              checked={watchlistOnly}
              onChange={(event) => {
                const nextWatchlistOnly = event.target.checked;
                setWatchlistOnly(nextWatchlistOnly);
                if (nextWatchlistOnly) {
                  setIsMyTiersOnly(false);
                  setIsMyRankMode(false);
                }
              }}
              className="h-4 w-4 accent-brand-green"
            />
            <span>Watchlist Only</span>
          </label>
          <button
            type="button"
            onClick={() => {
              const nextIsMyTiersOnly = !isMyTiersOnly;
              setIsMyTiersOnly(nextIsMyTiersOnly);
              if (nextIsMyTiersOnly) {
                setWatchlistOnly(false);
                setIsMyRankMode(false);
              }
            }}
            aria-pressed={isMyTiersOnly}
            className={`whitespace-nowrap rounded-lg border px-3 py-2 text-[11px] font-bold transition-colors ${
              isMyTiersOnly
                ? "border-brand-green bg-brand-green text-brand-cream"
                : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
            }`}
          >
            Show My Tiers Only
          </button>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-[11px] font-semibold text-brand-dark">
            <input
              type="checkbox"
              checked={hideDrafted}
              onChange={(event) => setHideDrafted(event.target.checked)}
              className="h-4 w-4 accent-brand-green"
            />
            <span>Hide Drafted</span>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-[11px] font-semibold text-brand-dark">
            <input
              type="checkbox"
              checked={isMultiPositionMode}
              onChange={(event) => setIsMultiPositionMode(event.target.checked)}
              className="h-4 w-4 accent-brand-green"
            />
            <span>Multi-Position</span>
          </label>
          <button
            type="button"
            onClick={() => {
              const nextIsMyRankMode = !isMyRankMode;
              setIsMyRankMode(nextIsMyRankMode);
              if (nextIsMyRankMode) {
                setWatchlistOnly(false);
                setIsMyTiersOnly(false);
              }
            }}
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
            className="flex w-20 items-center justify-center self-stretch whitespace-nowrap rounded-lg border border-red-300 bg-red-50 px-2 text-center text-[11px] font-bold leading-tight text-red-700 transition-colors hover:bg-red-100"
          >
            New Draft
          </button>
        </div>
        </div>
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

      {isMyTiersOnly ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#7F77DD] bg-[#CECBF6] px-3 py-1.5 text-xs font-semibold text-[#26215C]">
          <span>Showing only players with a tier assigned. Toggle off to see the full board.</span>
          <button
            type="button"
            onClick={() => setIsTierResetDialogOpen(true)}
            className="shrink-0 rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700 transition-colors hover:bg-red-100"
          >
            Reset Tiers
          </button>
        </div>
      ) : null}

      <div className="h-fit max-h-[75vh] w-full max-w-full overflow-auto rounded-lg border border-slate-200 bg-white [scrollbar-gutter:stable]">
        <table style={{ width: tableWidth }} className="table-fixed border-separate border-spacing-0 text-left text-xs">
          <colgroup>
            {isMyTiersOnly ? <col style={{ width: "40px" }} /> : null}
            {isMyRankMode ? <col style={{ width: "40px" }} /> : null}
            <col style={{ width: "40px" }} />
            <col style={{ width: "56px" }} />
            <col style={{ width: "192px" }} />
            <col style={{ width: "40px" }} />
            <col style={{ width: "56px" }} />
            {Array.from({ length: 3 }, (_, index) => <col key={index} style={{ width: "80px" }} />)}
            <col style={{ width: "112px" }} />
            {Array.from({ length: 7 }, (_, index) => <col key={index} style={{ width: "80px" }} />)}
            <col style={{ width: "96px" }} />
            {Array.from({ length: 4 }, (_, index) => <col key={index} style={{ width: "80px" }} />)}
          </colgroup>
          <thead>
            <tr>
              {isMyTiersOnly ? <th aria-label="Reorder tier" className="sticky left-0 top-0 z-30 h-16 w-10 min-w-10 border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream">↕</th> : null}
              {isMyRankMode ? <th aria-label="Personal draft position" className={`sticky ${stickyOffsets.myRank} top-0 z-30 h-16 ${MY_RANK_POSITION_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}>My<br />#</th> : null}
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
              <th className={`sticky top-0 z-20 h-16 ${TIER_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="Tier" tooltip="Your assigned tier. Untiered players sort last. To reorder players within a tier, use Show My Tiers Only." sortKey="tier" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="FPts (25/26)" tooltip="Total Fantasy Points scored in 2025-26." sortKey="seasonPts" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="FPts/S (25/26)" tooltip="Average Fantasy Points per start in 2025-26." sortKey="fantasyPtsPerStart" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="GhPts/S (25/26)" tooltip="Average recorded Ghost Points per start in 2025-26." sortKey="ghostPtsPerStart" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="GhPts % (25/26)" tooltip="Recorded Ghost Points as a percentage of total Fantasy Points in 2025-26." sortKey="ghostPtsPct" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="GS (25/26)" tooltip="Games started in 2025-26." sortKey="gamesStarted" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="Floor" subLabel="(10th pct)" tooltip="10th percentile of Fantasy Points in starts during 2025-26." sortKey="tenthPercentile" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="Ceiling" subLabel="(90th pct)" tooltip="90th percentile of Fantasy Points in starts during 2025-26." sortKey="ninetiethPercentile" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${SET_PIECES_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><HeaderTooltip description="Current 2026-27 set-piece duty order at the player's club — P = penalties, C = corners, FK = direct free kicks. Lower number = higher priority."><span className="leading-tight">Set<br />Pieces</span></HeaderTooltip></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="Corners (25/26)" tooltip="Total corner kicks taken across the 2025-26 season." sortKey="corners" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="FK Shots (25/26)" tooltip="Total direct free-kick shots taken across the 2025-26 season." sortKey="freeKickShots" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="Goals (25/26)" tooltip="Total goals scored in 2025-26." sortKey="goals" onSort={handleSort} sortArrow={sortArrow} /></th>
              <th className={`sticky top-0 z-20 h-16 ${NUMERIC_COLUMN_WIDTH} border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold tracking-wide text-brand-cream`}><SortableHeader label="Fantasy Assists (25/26)" tooltip="Total Fantasy Assists in 2025-26." sortKey="assists" onSort={handleSort} sortArrow={sortArrow} /></th>
            </tr>
          </thead>
          <tbody className="[&>tr>td]:!py-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filteredAndSortedPlayers.map((player) => player.id)} strategy={verticalListSortingStrategy}>
            {filteredAndSortedPlayers.map((player, index) => {
              const isPicked = pickedPlayerIds.has(player.id);
              const isLiveDrafted = liveDraftedIds.has(player.id);
              const isEffectivelyPicked = isPicked || isLiveDrafted;
              const isWatchlisted = watchlistedPlayerIds.has(player.id);
              const rowShade = isEffectivelyPicked ? "bg-slate-100" : index % 2 === 0 ? "bg-white" : "bg-slate-50";
              const positionDisplay =
                isMultiPositionMode && player.multi_position && player.multi_position.includes(",")
                  ? player.multi_position
                  : positionLetter(player.position);
              const setPieces = setPieceLabel(player.setPieces);
              const tierAssignment = tierAssignments.get(player.id);
              const tierDefinition = tierAssignment ? TIERS.find((tier) => tier.number === tierAssignment.tier) : null;
              const tierBoardRank = tieredBoardRanks.get(player.id);
              const isTierMenuOpen = tierMenuPlayerId === player.id;
              const previousTierAssignment = index > 0 ? tierAssignments.get(filteredAndSortedPlayers[index - 1].id) : null;
              const nextTierAssignment = index < filteredAndSortedPlayers.length - 1 ? tierAssignments.get(filteredAndSortedPlayers[index + 1].id) : null;
              const startsTierBlock = isMyTiersOnly && tierAssignment != null && previousTierAssignment?.tier !== tierAssignment.tier;
              const canMoveTierPlayerUp = isMyTiersOnly && previousTierAssignment?.tier === tierAssignment?.tier;
              const canMoveTierPlayerDown = isMyTiersOnly && nextTierAssignment?.tier === tierAssignment?.tier;
              const injuryIndicator = injuryStatusIndicator(player.chanceOfPlaying, player.availabilityStatus);
              const injuryTitle = player.availabilityNews?.trim() || injuryIndicator?.label;

              return (
                <Fragment key={player.id}>
                  {pickLineByIndex.has(index) ? (
                    <tr>
                        {(() => {
                          const pick = pickLineByIndex.get(index)!;
                          return (
                            <td
                              colSpan={tableColumnCount}
                              className={pick.onClock
                                ? "border-y-2 border-brand-green bg-brand-green px-3 py-1 text-left text-[10px] font-extrabold uppercase tracking-wide text-brand-cream"
                                : "border-y-2 border-brand-green bg-brand-green/15 px-3 py-1 text-left text-[10px] font-bold uppercase tracking-wide text-brand-green"}
                            >
                              {pick.onClock
                                ? `↓ YOUR PICK — ON THE CLOCK · #${pick.overall} overall · pool below`
                                : `↓ R${pick.round} · pick #${pick.overall} overall · your pool below`}
                            </td>
                          );
                        })()}
                    </tr>
                  ) : null}
                  {startsTierBlock && tierDefinition ? (
                    <tr>
                      <td colSpan={tableColumnCount} className={`border-b border-slate-200 py-1 pl-[136px] pr-3 text-left text-[10px] font-semibold ${tierDefinition.dividerClassName}`}>
                        {tierDefinition.number} · {tierDefinition.label}
                      </td>
                    </tr>
                  ) : null}
                <SortableRow id={player.id} disabled={!(dragEnabled || watchlistDragEnabled)}>
                  {({ attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging }) => (
                <tr ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`group ${rowShade} ${isEffectivelyPicked ? "text-slate-500 opacity-60" : "text-brand-dark"} ${isDragging ? "relative z-30 opacity-80 shadow-lg" : ""} transition-colors hover:bg-brand-green/10`}>
                  {isMyTiersOnly ? <td className={`sticky left-0 z-20 w-10 min-w-10 border-b border-r border-slate-200 px-1 py-1.5 text-center ${rowShade} group-hover:bg-emerald-50`}>
                    <span className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => movePlayerWithinTier(player.id, "up")} disabled={!canMoveTierPlayerUp} aria-label={`Move ${player.name} up within tier`} className="leading-none text-slate-600 hover:text-brand-green disabled:cursor-not-allowed disabled:text-slate-300">↑</button>
                      <button type="button" onClick={() => movePlayerWithinTier(player.id, "down")} disabled={!canMoveTierPlayerDown} aria-label={`Move ${player.name} down within tier`} className="leading-none text-slate-600 hover:text-brand-green disabled:cursor-not-allowed disabled:text-slate-300">↓</button>
                    </span>
                  </td> : null}
                  {isMyRankMode ? <td className={`sticky ${stickyOffsets.myRank} z-20 ${MY_RANK_POSITION_COLUMN_WIDTH} border-b border-r border-slate-200 px-1 py-1.5 text-center font-semibold tabular-nums ${rowShade} group-hover:bg-emerald-50`}>{index + 1}</td> : null}
                  <td className={`sticky ${stickyOffsets.watchlist} z-20 ${WATCHLIST_COLUMN_WIDTH} border-b border-r border-slate-200 px-1 py-1.5 text-center ${rowShade} group-hover:bg-emerald-50`}>
                    <div className="flex items-center justify-center gap-0.5">
                      <button type="button" onClick={() => toggleBoardFlag(player.id, "watchlisted")} aria-label={isWatchlisted ? `Remove ${player.name} from watchlist` : `Add ${player.name} to watchlist`} aria-pressed={isWatchlisted} className={`text-base leading-none ${isWatchlisted ? "text-amber-500" : "text-slate-400 hover:text-amber-500"}`}>
                        <span aria-hidden="true">{isWatchlisted ? "★" : "☆"}</span>
                      </button>
                      {isMyRankMode || watchlistOnly ? (
                        <button
                          ref={setActivatorNodeRef}
                          type="button"
                          {...attributes}
                          {...listeners}
                          disabled={!(dragEnabled || watchlistDragEnabled)}
                          aria-label={dragEnabled || watchlistDragEnabled ? `Drag ${player.name} to reorder` : "Saving custom ranking"}
                          title={dragEnabled || watchlistDragEnabled ? "Drag to reorder" : "Saving custom ranking"}
                          className={`touch-none text-sm leading-none ${dragEnabled || watchlistDragEnabled ? "cursor-grab text-slate-500 active:cursor-grabbing" : "cursor-not-allowed text-slate-300"}`}
                        >
                          <span aria-hidden="true">⠿</span>
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className={`sticky ${stickyOffsets.picked} z-20 ${PICKED_COLUMN_WIDTH} border-b border-r border-slate-200 px-1 py-1.5 text-center ${rowShade} group-hover:bg-emerald-50`}>
                    <input type="checkbox" checked={isEffectivelyPicked} disabled={isLiveDrafted} title={isLiveDrafted ? "Drafted live via Fantrax" : undefined} onChange={() => toggleBoardFlag(player.id, "picked")} aria-label={`Mark ${player.name} as picked`} className="h-4 w-4 accent-brand-green" />
                  </td>
                  <td className={`sticky ${stickyOffsets.player} z-20 ${PLAYER_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 font-semibold ${isEffectivelyPicked ? "text-slate-500" : "text-brand-dark"} ${rowShade} group-hover:bg-emerald-50`}>
                    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                      <Link href={`/portal/players/${player.id}`} prefetch={false} className={`min-w-0 flex-1 truncate ${isEffectivelyPicked ? "line-through hover:text-slate-500" : "hover:text-brand-green"}`} title={player.name}>{player.name}</Link>
                      {injuryIndicator ? <span title={injuryTitle} aria-label={injuryTitle} className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ${injuryIndicator.className}`} /> : null}
                    </span>
                  </td>
                  <td className={`sticky ${stickyOffsets.position} z-20 ${POSITION_COLUMN_WIDTH} border-b border-r border-slate-200 px-1 py-1.5 text-center ${rowShade} group-hover:bg-emerald-50`}><span className={`inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${positionBadgeClass(player.position)}`}>{positionDisplay}</span></td>
                  <td className={`${TEAM_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 font-medium ${isEffectivelyPicked ? "text-slate-500" : "text-slate-600"}`}>{player.team}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{player.adp == null ? "—" : formatNumber(player.adp, 1)}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{player.rank}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{formatAdpDelta(player)}</td>
                  <td ref={isTierMenuOpen ? tierMenuRef : undefined} className={`relative ${TIER_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-center`}>
                    {tierAssignment && tierDefinition ? (
                      <button type="button" onClick={() => setTierMenuPlayerId(isTierMenuOpen ? null : player.id)} aria-label={`Change ${player.name}'s tier`} aria-expanded={isTierMenuOpen} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tierDefinition.className}`}>
                        {tierDefinition.number} · {tierDefinition.label} #{tierBoardRank}
                      </button>
                    ) : (
                      <button type="button" onClick={() => setTierMenuPlayerId(isTierMenuOpen ? null : player.id)} aria-label={`Add ${player.name} to a tier`} aria-expanded={isTierMenuOpen} className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-sm font-semibold leading-none text-slate-500 hover:border-brand-green hover:text-brand-green">
                        +
                      </button>
                    )}
                    {isTierMenuOpen ? (
                      <div className="absolute left-1/2 z-40 mt-1 w-36 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-1 text-left shadow-lg">
                        {TIERS.map((tier) => (
                          <button key={tier.number} type="button" onClick={() => setPlayerTier(player.id, tier.number)} aria-pressed={tierAssignment?.tier === tier.number} className={`flex w-full items-center justify-between rounded px-2 py-1 text-xs hover:bg-slate-100 ${tierAssignment?.tier === tier.number ? "bg-slate-100 font-semibold" : ""}`}>
                            <span>{tier.number} - {tier.label}</span>{tierAssignment?.tier === tier.number ? <span aria-hidden="true">✓</span> : null}
                          </button>
                        ))}
                        {tierAssignment ? <button type="button" onClick={() => setPlayerTier(player.id, null)} className="mt-1 w-full rounded border-t border-slate-200 px-2 py-1 text-left text-xs font-semibold text-red-700 hover:bg-red-50">Remove from tier</button> : null}
                        <p className="mt-1 border-t border-slate-200 px-2 pt-1 text-[10px] leading-tight text-slate-500">Reorder tiered players anytime via Show My Tiers Only.</p>
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
                  <td className={`${SET_PIECES_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5`}>{setPieces ? <span className="inline-flex max-w-full truncate rounded-full bg-brand-green/10 px-2 py-0.5 text-[10px] font-semibold text-brand-green">{setPieces}</span> : "—"}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{player.corners}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{player.freeKickShots}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{player.goals}</td>
                  <td className={`${NUMERIC_COLUMN_WIDTH} border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums`}>{player.assists}</td>
                </tr>
                  )}
                </SortableRow>
                </Fragment>
              );
            })}
            {filteredAndSortedPlayers.length === 0 ? (
              <tr><td colSpan={tableColumnCount} className="border-b border-slate-200 bg-slate-50 px-4 !py-6 text-center text-slate-500">No players match the current filters.</td></tr>
            ) : null}
            </SortableContext>
            </DndContext>
          </tbody>
        </table>
      </div>

      {isTierResetDialogOpen ? createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-tiers-title"
            aria-describedby="reset-tiers-description"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <h2 id="reset-tiers-title" className="text-lg font-black text-brand-dark">Reset your tiers?</h2>
            <p id="reset-tiers-description" className="mt-2 text-sm leading-relaxed text-slate-600">
              This clears your tier assignments and tier order for all players. Your Picked, Watchlist, and personal rankings are NOT affected. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsTierResetDialogOpen(false)}
                disabled={isResettingTiers}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-brand-dark hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void resetTiers()}
                disabled={isResettingTiers}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResettingTiers ? "Resetting…" : "Yes, reset my tiers"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

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
