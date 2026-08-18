"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AnalyticsPayload } from "@/app/api/league-analytics/types";

export type LeagueTeam = {
  id: string;
  name: string;
};

export type LeaguePlayerData = {
  playerId: string;
  playerName: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  team: string;
  teamId: string;
  teamName: string;
  ownershipPct: number;
  seasonPts: number;
  avgPtsPerGw: number;
  ghostPtsPerGw: number;
};

type MyLeagueClientProps = {
  leagueId: string | null;
  lastSyncedAt: string | null;
  teams: LeagueTeam[];
  players: LeaguePlayerData[];
  savedTeamId: string | null;
  savedTeamName: string | null;
  isConnected: boolean;
};

type CachedLeague = {
  league_id: string;
  league_name: string;
};

type Tab = "roster" | "standings" | "analytics" | "trade-values";

const TABS: { id: Tab; label: string }[] = [
  { id: "roster", label: "Roster" },
  { id: "standings", label: "Standings" },
  { id: "analytics", label: "Analytics" },
  { id: "trade-values", label: "Trade Values" },
];

const POSITION_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

function positionLetter(position: LeaguePlayerData["position"]): "G" | "D" | "M" | "F" {
  if (position === "GK") return "G";
  if (position === "DEF") return "D";
  if (position === "MID") return "M";
  return "F";
}

function positionBadgeClass(position: LeaguePlayerData["position"]): string {
  if (position === "GK") return "bg-amber-100 text-amber-900";
  if (position === "DEF") return "bg-emerald-200 text-emerald-950";
  if (position === "MID") return "bg-violet-200 text-violet-950";
  return "bg-orange-200 text-orange-950";
}

function formatSyncDate(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function safeFixed(value: number | null | undefined, decimals: number): string {
  const n = value ?? 0;
  return (typeof n === "number" && isFinite(n) ? n : 0).toFixed(decimals);
}

export default function MyLeagueClient({ leagueId, lastSyncedAt, teams, players, savedTeamId, isConnected }: MyLeagueClientProps) {
  const router = useRouter();
  const [secretId, setSecretId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ teams: number; playersRostered: number; unmatchedPlayers: string[] } | null>(null);
  const [connectResult, setConnectResult] = useState<{ leagues: number; playersRostered: number; unmatched: number } | null>(null);
  const [isUnsyncDialogOpen, setIsUnsyncDialogOpen] = useState(false);
  const [isUnsyncing, setIsUnsyncing] = useState(false);
  const [unsyncError, setUnsyncError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("roster");
  const [analyticsData, setAnalyticsData] = useState<AnalyticsPayload | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const analyticsFetchedRef = useRef(false);

  // Roster tab: which team is being viewed (independent of profile)
  const [selectedTeamId, setSelectedTeamId] = useState<string>(savedTeamId ?? teams[0]?.id ?? "");

  const [leagues, setLeagues] = useState<CachedLeague[]>([]);
  const [isLeagueSwitching, setIsLeagueSwitching] = useState(false);
  const [leagueSwitchError, setLeagueSwitchError] = useState<string | null>(null);

  // Reset the roster viewer to the authoritative Fantrax team on league changes.
  useEffect(() => {
    const defaultTeamId = savedTeamId && teams.some((team) => team.id === savedTeamId)
      ? savedTeamId
      : teams[0]?.id ?? "";
    setSelectedTeamId(defaultTeamId);
  }, [leagueId, savedTeamId, teams]);

  useEffect(() => {
    if (!["standings", "analytics", "trade-values"].includes(activeTab) || !leagueId || analyticsFetchedRef.current) return;
    analyticsFetchedRef.current = true;
    setAnalyticsLoading(true);
    setAnalyticsError(null);

    fetch(`/api/league-analytics/summary?leagueId=${encodeURIComponent(leagueId)}`)
      .then(async (res) => {
        const data = (await res.json()) as AnalyticsPayload & { message?: string };
        if (!res.ok) throw new Error(data.message ?? "Failed to load analytics");
        setAnalyticsData(data);
      })
      .catch((err: unknown) => {
        setAnalyticsError(err instanceof Error ? err.message : "Failed to load analytics");
      })
      .finally(() => setAnalyticsLoading(false));
  }, [activeTab, leagueId]);

  useEffect(() => {
    let cancelled = false;

    async function loadLeagues() {
      try {
        const response = await fetch("/api/fantrax/leagues", { credentials: "same-origin" });
        if (!response.ok) return;
        const data = (await response.json()) as { leagues?: CachedLeague[] };
        if (!cancelled) setLeagues(data.leagues ?? []);
      } catch (error) {
        console.error("[MyLeague] Failed to load cached leagues:", error);
      }
    }

    void loadLeagues();
    return () => {
      cancelled = true;
    };
  }, []);

  async function switchLeague(nextLeagueId: string) {
    if (!nextLeagueId || nextLeagueId === leagueId) return;

    setIsLeagueSwitching(true);
    setLeagueSwitchError(null);
    try {
      const response = await fetch("/api/fantrax/switch-league", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId: nextLeagueId }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setLeagueSwitchError(data.message ?? "Unable to switch leagues.");
        return;
      }

      router.refresh();
    } catch {
      setLeagueSwitchError("Network error. Please try again.");
    } finally {
      setIsLeagueSwitching(false);
    }
  }

  function handleTeamChange(teamId: string) {
    setSelectedTeamId(teamId);
  }

  async function handleSync(idToSync: string) {
    if (!idToSync.trim()) return;
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const response = await fetch("/api/my-league/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId: idToSync.trim() }),
      });

      const data = (await response.json()) as {
        message?: string;
        teams?: number;
        playersRostered?: number;
        unmatchedPlayers?: string[];
      };

      if (!response.ok) {
        setSyncError(data.message ?? "Sync failed. Please try again.");
        return;
      }

      setSyncResult({
        teams: data.teams ?? 0,
        playersRostered: data.playersRostered ?? 0,
        unmatchedPlayers: data.unmatchedPlayers ?? [],
      });

      router.refresh();
    } catch {
      setSyncError("Network error. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleConnect() {
    if (!secretId.trim()) return;
    setSyncing(true);
    setSyncError(null);
    setConnectResult(null);

    try {
      const response = await fetch("/api/fantrax/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secretId: secretId.trim() }),
      });
      const data = (await response.json()) as {
        message?: string;
        leagues?: unknown[];
        syncResults?: Array<{ playersRostered?: number; unmatchedFantraxIds?: string[] }>;
      };

      if (!response.ok) {
        setSyncError(data.message ?? "Unable to connect your Fantrax account.");
        return;
      }

      const syncResults = data.syncResults ?? [];
      setConnectResult({
        leagues: data.leagues?.length ?? 0,
        playersRostered: syncResults.reduce((total, result) => total + (result.playersRostered ?? 0), 0),
        unmatched: syncResults.reduce((total, result) => total + (result.unmatchedFantraxIds?.length ?? 0), 0),
      });
      window.setTimeout(() => router.refresh(), 1200);
    } catch {
      setSyncError("Network error. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleUnsync() {
    setIsUnsyncing(true);
    setUnsyncError(null);

    try {
      const response = await fetch("/api/fantrax/disconnect", { method: "POST" });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setUnsyncError(data.message ?? "Unable to disconnect your Fantrax account.");
        return;
      }

      setIsUnsyncDialogOpen(false);
      router.refresh();
    } catch {
      setUnsyncError("Network error. Please try again.");
    } finally {
      setIsUnsyncing(false);
    }
  }

  // Setup screen
  if (!leagueId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">My League</h1>
          <p className="mt-2 text-sm text-brand-dark/70">Connect your Fantrax account to track roster availability across every league.</p>
        </div>

        <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-lg font-bold text-brand-dark">Connect Your Fantrax Account</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Find your Secret ID in your{" "}
            <a href="https://www.fantrax.com/user/profile" target="_blank" rel="noreferrer" className="font-semibold text-brand-green underline hover:text-brand-greenDark">
              Fantrax profile
            </a>
            {" "}and paste it below. Connect once and every league you&apos;re in is pulled in automatically — no more per-league IDs.
          </p>
          {isConnected ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Your Fantrax account is already connected, but no active league is currently available. Reconnect to refresh your league list.
            </p>
          ) : null}

          <div className="mt-5 space-y-3">
            <label className="space-y-1.5">
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Fantrax Secret ID
              </span>
              <input
                type="password"
                value={secretId}
                onChange={(e) => setSecretId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleConnect();
                }}
                placeholder="Paste your Secret ID"
                disabled={syncing}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-brand-dark placeholder:text-slate-400 focus:border-brand-green focus:outline-none disabled:opacity-50"
              />
            </label>

            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={syncing || !secretId.trim()}
              className="w-full rounded-lg border border-brand-green bg-brand-green px-4 py-2.5 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-greenDark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncing ? "Connecting and syncing your leagues…" : "Connect"}
            </button>

            {syncError ? <p className="text-sm text-red-700">{syncError}</p> : null}
            {connectResult ? (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                Connected {connectResult.leagues} {connectResult.leagues === 1 ? "league" : "leagues"} and synced {connectResult.playersRostered} players.
                {connectResult.unmatched > 0 ? ` ${connectResult.unmatched} players could not be matched.` : ""}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // League view
  const selectedTeamPlayers = players
    .filter((p) => p.teamId === selectedTeamId)
    .sort((a, b) => (POSITION_ORDER[a.position] ?? 4) - (POSITION_ORDER[b.position] ?? 4) || a.playerName.localeCompare(b.playerName));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">My League</h1>
          <p className="mt-1 text-sm text-brand-dark/70">
            League ID: <span className="font-mono text-brand-dark">{leagueId}</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Last synced: {formatSyncDate(lastSyncedAt)}</p>
          {(leagues.length > 0 || teams.length > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {leagues.length > 0 && (
                <label className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">League</span>
                  <select
                    value={leagueId}
                    onChange={(e) => void switchLeague(e.target.value)}
                    disabled={isLeagueSwitching}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-brand-dark focus:border-brand-green focus:outline-none disabled:cursor-wait disabled:opacity-60"
                  >
                    {leagues.map((league) => (
                      <option key={league.league_id} value={league.league_id}>{league.league_name}</option>
                    ))}
                  </select>
                </label>
              )}
              {teams.length > 0 && (
                <label className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Team</span>
                  <select
                    value={selectedTeamId}
                    onChange={(e) => handleTeamChange(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-brand-dark focus:border-brand-green focus:outline-none"
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </label>
              )}
              {activeTab === "roster" && teams.length > 0 && (
                <span className="text-xs text-slate-500">{selectedTeamPlayers.length} players</span>
              )}
              {leagueSwitchError && <span className="text-xs text-red-700">{leagueSwitchError}</span>}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => void handleSync(leagueId)}
            disabled={syncing}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-brand-dark transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Re-sync"}
          </button>
          <button
            type="button"
            onClick={() => {
              setUnsyncError(null);
              setIsUnsyncDialogOpen(true);
            }}
            disabled={syncing || isUnsyncing}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Disconnect Fantrax
          </button>
          {syncError ? <p className="text-xs text-red-700">{syncError}</p> : null}
          {syncResult ? (
            <p className="text-xs text-green-700">
              Synced {syncResult.playersRostered} players across {syncResult.teams} teams.
              {syncResult.unmatchedPlayers.length > 0
                ? ` ${syncResult.unmatchedPlayers.length} unmatched.`
                : ""}
            </p>
          ) : null}
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-brand-green text-brand-green"
                  : "text-slate-500 hover:text-brand-dark"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "roster" && (
        <>
          <div className="max-w-full overflow-x-auto">
            <div className="relative w-max max-h-[75vh] overflow-y-auto rounded-lg border border-slate-200 bg-white [scrollbar-gutter:stable]">
            <table className="w-[720px] min-w-[720px] table-fixed border-separate border-spacing-0 text-left text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 w-[200px] min-w-[200px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                    Player
                  </th>
                  <th className="sticky top-0 z-20 w-20 min-w-20 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                    Team
                  </th>
                  <th className="sticky top-0 z-20 w-12 min-w-12 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                    Pos
                  </th>
                  <th className="sticky top-0 z-20 w-[98px] min-w-[98px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                    Season Pts
                  </th>
                  <th className="sticky top-0 z-20 w-[98px] min-w-[98px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                    Avg Pts/GW
                  </th>
                  <th className="sticky top-0 z-20 w-[98px] min-w-[98px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                    Ghost Pts/GW
                  </th>
                  <th className="sticky top-0 z-20 w-[98px] min-w-[98px] border-b border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                    Ownership %
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedTeamPlayers.map((player, index) => {
                  const rowShade = index % 2 === 0 ? "bg-white" : "bg-slate-50";
                  return (
                    <tr key={player.playerId} className={`group ${rowShade} text-brand-dark transition-colors hover:bg-brand-green/10`}>
                      <td className={`sticky left-0 z-20 w-[200px] min-w-[200px] border-b border-r border-slate-200 px-2 py-1.5 ${rowShade} group-hover:bg-brand-green/10`}>
                        <Link
                          href={`/portal/players/${player.playerId}`}
                          prefetch={false}
                          className="font-semibold text-brand-dark hover:text-brand-green hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {player.playerName}
                        </Link>
                      </td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 font-medium text-slate-600">
                        {player.team}
                      </td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 text-center">
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${positionBadgeClass(player.position)}`}>
                          {positionLetter(player.position)}
                        </span>
                      </td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                        {safeFixed(player.seasonPts, 2)}
                      </td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                        {safeFixed(player.avgPtsPerGw, 2)}
                      </td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                        {safeFixed(player.ghostPtsPerGw, 2)}
                      </td>
                      <td className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                        {safeFixed(player.ownershipPct, 1)}%
                      </td>
                    </tr>
                  );
                })}
                {selectedTeamPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="border-b border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-500">
                      No players found for this team.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              {selectedTeamPlayers.length > 0 ? (() => {
                const n = selectedTeamPlayers.length;
                const totalSeasonPts = selectedTeamPlayers.reduce((sum, p) => sum + p.seasonPts, 0);
                const avgPtsPerGw = selectedTeamPlayers.reduce((sum, p) => sum + p.avgPtsPerGw, 0) / n;
                const avgGhostPtsPerGw = selectedTeamPlayers.reduce((sum, p) => sum + p.ghostPtsPerGw, 0) / n;
                const avgOwnership = selectedTeamPlayers.reduce((sum, p) => sum + p.ownershipPct, 0) / n;
                return (
                  <tfoot>
                    <tr className="bg-brand-green/10 text-brand-dark">
                      <td className="sticky left-0 w-[200px] min-w-[200px] border-t border-slate-200 bg-brand-green/10 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        Team Total
                      </td>
                      <td className="border-t border-slate-200 bg-brand-green/10" />
                      <td className="border-t border-slate-200 bg-brand-green/10" />
                      <td className="border-t border-slate-200 px-2 py-1.5 text-right text-xs font-bold tabular-nums text-brand-dark">
                        {safeFixed(totalSeasonPts, 2)}
                      </td>
                      <td className="border-t border-slate-200 px-2 py-1.5 text-right text-xs font-bold tabular-nums text-brand-dark">
                        {safeFixed(avgPtsPerGw, 2)}
                      </td>
                      <td className="border-t border-slate-200 px-2 py-1.5 text-right text-xs font-bold tabular-nums text-brand-dark">
                        {safeFixed(avgGhostPtsPerGw, 2)}
                      </td>
                      <td className="border-t border-slate-200 px-2 py-1.5 text-right text-xs font-bold tabular-nums text-brand-dark">
                        {safeFixed(avgOwnership, 1)}%
                      </td>
                    </tr>
                  </tfoot>
                );
              })() : null}
            </table>
            </div>
          </div>
        </>
      )}

      {activeTab === "standings" && (
        <>
          {analyticsLoading && (
            <div className="flex min-h-[200px] items-center justify-center">
              <p className="text-sm text-slate-500">Loading analytics…</p>
            </div>
          )}
          {analyticsError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{analyticsError}</p>
            </div>
          )}
          {analyticsData && (
            <div className="space-y-8">
              {/* Power Rankings */}
              {(() => {
                const leaguePosMap = new Map(
                  [...analyticsData.powerRankings]
                    .sort((a, b) => b.actualW - a.actualW)
                    .map((r, i) => [r.teamId, i + 1])
                );
                return (
                  <AnalyticsTable
                    title="Power Rankings"
                    description="0–100 score based on simulated wins if every team played every other team's schedule each week. 100 = best, 0 = worst."
                    headers={["Rank", "Team", "Power Score (0-100)", "League Position"]}
                    rows={analyticsData.powerRankings.map((r) => ({
                      teamId: r.teamId,
                      cells: [
                        r.rank,
                        r.teamName,
                        safeFixed(r.powerScore, 1),
                        leaguePosMap.get(r.teamId) ?? "—",
                      ],
                    }))}
                    myTeamId={savedTeamId}
                  />
                );
              })()}

              {/* Luck Index */}
              <AnalyticsTable
                title="Luck Index"
                description="Compares actual wins to expected wins if you played every opponent each week. Positive = luckier than average."
                headers={["Rank", "Team", "Actual W", "Expected W", "Luck Score"]}
                rows={analyticsData.luckIndex.map((r) => ({
                  teamId: r.teamId,
                  cells: [
                    r.rank,
                    r.teamName,
                    r.actualW,
                    safeFixed(r.expectedW, 2),
                    <LuckBadge key="luck" value={r.luckScore ?? 0} />,
                  ],
                }))}
                myTeamId={savedTeamId}
              />

            </div>
          )}
        </>
      )}

      {activeTab === "analytics" && (
        <>
          {analyticsLoading && (
            <div className="flex min-h-[200px] items-center justify-center">
              <p className="text-sm text-slate-500">Loading analytics…</p>
            </div>
          )}
          {analyticsError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{analyticsError}</p>
            </div>
          )}
          {analyticsData && (
            <div className="space-y-8">
              {/* Consistency Rankings */}
              <AnalyticsTable
                title="Consistency Rankings"
                description="Standard deviation of weekly scores. Lower std dev = more reliable week-to-week output."
                headers={["Rank", "Team", "Avg Score (per GW)", "Std Dev", "Profile"]}
                rows={analyticsData.consistency.map((r) => ({
                  teamId: r.teamId,
                  cells: [
                    r.consistencyRank,
                    r.teamName,
                    safeFixed(r.avgScore, 2),
                    safeFixed(r.stdDev, 2),
                    <ConsistencyProfileBadge key="profile" stdDev={r.stdDev ?? 0} />,
                  ],
                }))}
                myTeamId={savedTeamId}
              />

              {/* Trajectory */}
              <AnalyticsTable
                title="Trajectory"
                description="Ranks teams by their last 4 gameweek average vs the league average over the same period. Positive = trending above the league."
                headers={["Rank", "Team", "Last 4 GW Avg", "League Avg", "Delta"]}
                rows={analyticsData.trajectory.map((r, i) => ({
                  teamId: r.teamId,
                  cells: [
                    i + 1,
                    r.teamName,
                    safeFixed(r.last4Avg, 2),
                    safeFixed(r.leagueLast4Avg, 2),
                    <DeltaBadge key="delta" value={r.trajectoryDelta ?? 0} />,
                  ],
                }))}
                myTeamId={savedTeamId}
              />
            </div>
          )}
        </>
      )}

      {activeTab === "trade-values" && (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
          <p className="text-sm text-slate-500">Coming soon</p>
        </div>
      )}

      {isUnsyncDialogOpen ? createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsync-league-title"
            aria-describedby="unsync-league-description"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <h2 id="unsync-league-title" className="text-lg font-black text-brand-dark">Disconnect Fantrax?</h2>
            <p id="unsync-league-description" className="mt-2 text-sm leading-relaxed text-slate-600">
              This permanently disconnects your Fantrax account, clearing all synced leagues and roster data. This cannot be undone.
            </p>
            {unsyncError ? <p className="mt-3 text-sm text-red-700">{unsyncError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsUnsyncDialogOpen(false)}
                disabled={isUnsyncing}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-brand-dark hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleUnsync()}
                disabled={isUnsyncing}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUnsyncing ? "Disconnecting…" : "Yes, disconnect Fantrax"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

    </div>
  );
}

// ── Analytics sub-components ─────────────────────────────────────────────────

type AnalyticsRow = {
  teamId: string;
  cells: (string | number | React.ReactNode)[];
};

function AnalyticsTable({
  title,
  description,
  headers,
  rows,
  myTeamId,
}: {
  title: string;
  description: string;
  headers: string[];
  rows: AnalyticsRow[];
  myTeamId: string | null;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-base font-bold text-brand-dark">{title}</h3>
        <p className="text-xs text-slate-600">{description}</p>
      </div>
      <div className="max-w-full overflow-x-auto">
        <div className="w-[720px] min-w-[720px] rounded-lg border border-slate-200 bg-white">
          <table className="w-[720px] min-w-[720px] table-fixed border-separate border-spacing-0 text-left text-xs">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={h}
                    className={`border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream ${i === 0 ? "w-[84px]" : i === 1 ? "w-[220px] text-left" : headers.length === 4 ? "w-[208px]" : "w-[138px]"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isMyTeam = myTeamId && row.teamId === myTeamId;
                const rowShade = isMyTeam
                  ? "bg-brand-green/10"
                  : index % 2 === 0
                  ? "bg-white"
                  : "bg-slate-50";
                return (
                  <tr key={row.teamId} className={`group ${rowShade} text-brand-dark transition-colors hover:bg-brand-green/10`}>
                    {row.cells.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`border-b border-r border-slate-200 px-2 py-1.5 text-right font-medium tabular-nums ${ci === 0 ? "w-[84px]" : ci === 1 ? "w-[220px] text-left" : headers.length === 4 ? "w-[208px]" : "w-[138px]"} ${isMyTeam ? "font-semibold text-brand-dark" : "text-slate-600"}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LuckBadge({ value }: { value: number }) {
  const positive = value > 0;
  const neutral = value === 0;
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
        neutral
          ? "bg-slate-100 text-slate-600"
          : positive
          ? "bg-green-100 text-green-800"
          : "bg-red-100 text-red-800"
      }`}
    >
      {positive ? "+" : ""}{value.toFixed(2)}
    </span>
  );
}

function DeltaBadge({ value }: { value: number }) {
  const positive = value > 0;
  const neutral = value === 0;
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
        neutral
          ? "bg-slate-100 text-slate-600"
          : positive
          ? "bg-green-100 text-green-800"
          : "bg-red-100 text-red-800"
      }`}
    >
      {positive ? "+" : ""}{value.toFixed(2)}
    </span>
  );
}

function ConsistencyProfileBadge({ stdDev }: { stdDev: number }) {
  if (stdDev < 18) {
    return (
      <span className="inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
        Reliable
      </span>
    );
  }
  if (stdDev <= 24) {
    return (
      <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
        Mixed
      </span>
    );
  }
  return (
    <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
      Boom/Bust
    </span>
  );
}
