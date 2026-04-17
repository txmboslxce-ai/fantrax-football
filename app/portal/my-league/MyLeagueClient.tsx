"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
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
};

type Tab = "roster" | "standings" | "analytics" | "trade-values";

const TABS: { id: Tab; label: string }[] = [
  { id: "roster", label: "Roster" },
  { id: "standings", label: "Standings" },
  { id: "analytics", label: "Analytics" },
  { id: "trade-values", label: "Trade Values" },
];

const POSITION_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

function formatSyncDate(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MyLeagueClient({ leagueId, lastSyncedAt, teams, players, savedTeamId, savedTeamName }: MyLeagueClientProps) {
  const router = useRouter();
  const [inputLeagueId, setInputLeagueId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ teams: number; playersRostered: number; unmatchedPlayers: string[] } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("roster");
  const [analyticsData, setAnalyticsData] = useState<AnalyticsPayload | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const analyticsFetchedRef = useRef(false);

  // Initialise selectedTeamId from saved profile value, falling back to first team
  const initialTeamId = (() => {
    if (savedTeamId && teams.some((t) => t.id === savedTeamId)) return savedTeamId;
    return teams[0]?.id ?? "";
  })();
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialTeamId);

  // Keep selectedTeamId valid when teams change (e.g. after re-sync)
  useEffect(() => {
    if (teams.length > 0 && !teams.some((t) => t.id === selectedTeamId)) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  useEffect(() => {
    if (activeTab !== "standings" || !leagueId || analyticsFetchedRef.current) return;
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

  async function handleTeamChange(teamId: string) {
    setSelectedTeamId(teamId);
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ fantrax_team_id: teamId, fantrax_team_name: team.name })
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");
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

  // Setup screen
  if (!leagueId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">My League</h1>
          <p className="mt-2 text-sm text-brand-creamDark">Connect your Fantrax league to track roster availability.</p>
        </div>

        <div className="mx-auto max-w-lg rounded-xl border border-brand-cream/20 bg-brand-dark/60 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-brand-cream">Connect Your League</h2>

          <ol className="mt-4 space-y-3 text-sm text-brand-creamDark">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-green/20 text-xs font-bold text-brand-green">1</span>
              <span>Go to your Fantrax league and click <span className="font-semibold text-brand-cream">League</span> in the left sidebar.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-green/20 text-xs font-bold text-brand-green">2</span>
              <span>Find the league ID in your browser&apos;s URL bar:</span>
            </li>
          </ol>

          <div className="mt-3 rounded-lg border border-brand-cream/15 bg-brand-dark px-4 py-3 font-mono text-xs text-brand-creamDark">
            fantrax.com/fantasy/league/<span className="rounded bg-brand-green/30 px-1 py-0.5 font-bold text-brand-cream">abc123def456</span>/home
          </div>

          <ol className="mt-3 space-y-3 text-sm text-brand-creamDark" start={3}>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-green/20 text-xs font-bold text-brand-green">3</span>
              <span>Paste it in the field below and click <span className="font-semibold text-brand-cream">Sync League</span>.</span>
            </li>
          </ol>

          <div className="mt-5 space-y-3">
            <label className="space-y-1.5">
              <span className="block text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
                Fantrax League ID
              </span>
              <input
                type="text"
                value={inputLeagueId}
                onChange={(e) => setInputLeagueId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSync(inputLeagueId);
                }}
                placeholder="e.g. abc123def456"
                disabled={syncing}
                className="w-full rounded-lg border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream placeholder:text-brand-creamDark/50 focus:border-brand-green focus:outline-none disabled:opacity-50"
              />
            </label>

            <button
              type="button"
              onClick={() => void handleSync(inputLeagueId)}
              disabled={syncing || !inputLeagueId.trim()}
              className="w-full rounded-lg border border-brand-green bg-brand-green px-4 py-2.5 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-greenDark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync League"}
            </button>

            {syncError ? <p className="text-sm text-red-400">{syncError}</p> : null}
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
          <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">My League</h1>
          <p className="mt-1 text-sm text-brand-creamDark">
            League ID: <span className="font-mono text-brand-cream">{leagueId}</span>
          </p>
          <p className="mt-0.5 text-xs text-brand-creamDark">Last synced: {formatSyncDate(lastSyncedAt)}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => void handleSync(leagueId)}
            disabled={syncing}
            className="rounded-lg border border-brand-cream/35 px-4 py-2 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-cream/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Re-sync"}
          </button>
          {syncError ? <p className="text-xs text-red-400">{syncError}</p> : null}
          {syncResult ? (
            <p className="text-xs text-green-400">
              Synced {syncResult.playersRostered} players across {syncResult.teams} teams.
              {syncResult.unmatchedPlayers.length > 0
                ? ` ${syncResult.unmatchedPlayers.length} unmatched.`
                : ""}
            </p>
          ) : null}
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-brand-cream/20">
        <nav className="-mb-px flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-brand-green text-brand-green"
                  : "text-brand-creamDark hover:text-brand-cream"
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
          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1">
              <span className="block text-xs font-semibold uppercase tracking-wide text-brand-creamDark">Team</span>
              <select
                value={selectedTeamId}
                onChange={(e) => void handleTeamChange(e.target.value)}
                className="rounded-lg border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream focus:border-brand-green focus:outline-none"
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="pb-2 text-xs text-brand-creamDark">{selectedTeamPlayers.length} players</p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 border-b border-r border-brand-cream/20 bg-[#0F1F13] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
                    Player
                  </th>
                  <th className="border-b border-r border-brand-cream/20 bg-[#1a3a22] px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-brand-cream">
                    Season Pts
                  </th>
                  <th className="border-b border-r border-brand-cream/20 bg-[#1a3a22] px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-brand-cream">
                    Avg Pts/GW
                  </th>
                  <th className="border-b border-r border-brand-cream/20 bg-[#1a3a22] px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-brand-cream">
                    Ghost Pts/GW
                  </th>
                  <th className="border-b border-brand-cream/20 bg-[#1a3a22] px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-brand-cream">
                    Ownership %
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedTeamPlayers.map((player, index) => {
                  const rowShade = index % 2 === 0 ? "bg-brand-dark/60" : "bg-brand-dark/90";
                  return (
                    <tr key={player.playerId} className={rowShade}>
                      <td className={`sticky left-0 border-b border-r border-brand-cream/10 px-4 py-3 ${rowShade}`}>
                        <Link
                          href={`/portal/players/${player.playerId}`}
                          className="font-semibold text-brand-cream hover:text-brand-green hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {player.playerName}
                        </Link>
                        <div className="mt-0.5 text-xs text-brand-creamDark/70">
                          {player.team} / {player.position}
                        </div>
                      </td>
                      <td className="border-b border-r border-brand-cream/10 px-4 py-3 text-center text-brand-cream">
                        {player.seasonPts.toFixed(2)}
                      </td>
                      <td className="border-b border-r border-brand-cream/10 px-4 py-3 text-center text-brand-cream">
                        {player.avgPtsPerGw.toFixed(2)}
                      </td>
                      <td className="border-b border-r border-brand-cream/10 px-4 py-3 text-center text-brand-cream">
                        {player.ghostPtsPerGw.toFixed(2)}
                      </td>
                      <td className="border-b border-brand-cream/10 px-4 py-3 text-center text-brand-cream">
                        {player.ownershipPct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
                {selectedTeamPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="border-b border-brand-cream/10 px-4 py-8 text-center text-brand-creamDark">
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
                    <tr className="bg-[#1a3a22]">
                      <td className="sticky left-0 border-t border-brand-cream/20 bg-[#1a3a22] px-4 py-3 text-xs font-bold uppercase tracking-wide text-brand-cream">
                        Team Total
                      </td>
                      <td className="border-t border-brand-cream/20 px-4 py-3 text-center text-xs font-bold text-brand-cream">
                        {totalSeasonPts.toFixed(2)}
                      </td>
                      <td className="border-t border-brand-cream/20 px-4 py-3 text-center text-xs font-bold text-brand-cream">
                        {avgPtsPerGw.toFixed(2)}
                      </td>
                      <td className="border-t border-brand-cream/20 px-4 py-3 text-center text-xs font-bold text-brand-cream">
                        {avgGhostPtsPerGw.toFixed(2)}
                      </td>
                      <td className="border-t border-brand-cream/20 px-4 py-3 text-center text-xs font-bold text-brand-cream">
                        {avgOwnership.toFixed(1)}%
                      </td>
                    </tr>
                  </tfoot>
                );
              })() : null}
            </table>
          </div>
        </>
      )}

      {activeTab === "standings" && (
        <>
          {analyticsLoading && (
            <div className="flex min-h-[200px] items-center justify-center">
              <p className="text-sm text-brand-creamDark">Loading analytics…</p>
            </div>
          )}
          {analyticsError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-400">{analyticsError}</p>
            </div>
          )}
          {analyticsData && (
            <div className="space-y-8">
              {/* Power Rankings */}
              <AnalyticsTable
                title="Power Rankings"
                description="Teams ranked by expected wins — how many wins you'd have accumulated playing every other team's schedule each week."
                headers={["Rank", "Team", "Expected W", "Actual W", "Points For", "Luck"]}
                rows={analyticsData.powerRankings.map((r) => ({
                  teamId: r.teamId,
                  cells: [
                    r.rank,
                    r.teamName,
                    r.expectedW.toFixed(2),
                    r.actualW,
                    r.pf.toFixed(2),
                    <LuckBadge key="luck" value={r.luckScore} />,
                  ],
                }))}
                myTeamId={savedTeamId}
              />

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
                    r.expectedW.toFixed(2),
                    <LuckBadge key="luck" value={r.luckScore} />,
                  ],
                }))}
                myTeamId={savedTeamId}
              />

              {/* Consistency */}
              <AnalyticsTable
                title="Consistency"
                description="Standard deviation of weekly scores. Lower = more consistent week-to-week output."
                headers={["Rank", "Team", "Avg Score", "Std Dev"]}
                rows={analyticsData.consistency.map((r) => ({
                  teamId: r.teamId,
                  cells: [r.consistencyRank, r.teamName, r.avgScore.toFixed(2), r.stdDev.toFixed(2)],
                }))}
                myTeamId={savedTeamId}
              />

              {/* Trajectory */}
              <AnalyticsTable
                title="Trajectory"
                description="Average score over the last 4 gameweeks vs the league average. Positive delta = trending above the pack."
                headers={["Team", "Last 4 Avg", "League Avg", "Delta"]}
                rows={analyticsData.trajectory.map((r) => ({
                  teamId: r.teamId,
                  cells: [
                    r.teamName,
                    r.last4Avg.toFixed(2),
                    r.leagueLast4Avg.toFixed(2),
                    <DeltaBadge key="delta" value={r.trajectoryDelta} />,
                  ],
                }))}
                myTeamId={savedTeamId}
              />
            </div>
          )}
        </>
      )}

      {(activeTab === "analytics" || activeTab === "trade-values") && (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-brand-cream/20 bg-brand-dark/40">
          <p className="text-sm text-brand-creamDark">Coming soon</p>
        </div>
      )}
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
        <h3 className="text-base font-bold text-brand-cream">{title}</h3>
        <p className="text-xs text-brand-creamDark">{description}</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={h}
                  className={`border-b border-brand-cream/20 bg-[#1a3a22] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-brand-cream ${i === 0 ? "" : "text-center"}`}
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
                ? "bg-brand-dark/60"
                : "bg-brand-dark/90";
              return (
                <tr key={row.teamId} className={rowShade}>
                  {row.cells.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`border-b border-brand-cream/10 px-4 py-2.5 ${ci === 0 ? "" : "text-center"} ${isMyTeam ? "font-semibold text-brand-cream" : "text-brand-creamDark"}`}
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
  );
}

function LuckBadge({ value }: { value: number }) {
  const positive = value > 0;
  const neutral = value === 0;
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
        neutral
          ? "bg-brand-cream/10 text-brand-creamDark"
          : positive
          ? "bg-green-500/20 text-green-400"
          : "bg-red-500/20 text-red-400"
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
          ? "bg-brand-cream/10 text-brand-creamDark"
          : positive
          ? "bg-green-500/20 text-green-400"
          : "bg-red-500/20 text-red-400"
      }`}
    >
      {positive ? "+" : ""}{value.toFixed(2)}
    </span>
  );
}
