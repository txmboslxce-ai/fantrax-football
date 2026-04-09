"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
};

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

export default function MyLeagueClient({ leagueId, lastSyncedAt, teams, players }: MyLeagueClientProps) {
  const router = useRouter();
  const [inputLeagueId, setInputLeagueId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ teams: number; playersRostered: number; unmatchedPlayers: string[] } | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teams[0]?.id ?? "");

  // Keep selectedTeamId valid when the teams prop changes (e.g. after a re-sync)
  useEffect(() => {
    if (teams.length > 0 && !teams.some((t) => t.id === selectedTeamId)) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

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

        <div className="mx-auto max-w-md rounded-xl border border-brand-cream/20 bg-brand-dark/60 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-brand-cream">Connect Your League</h2>
          <p className="mt-2 text-sm text-brand-creamDark">
            Enter your Fantrax league ID to see roster availability across all player tables.
          </p>

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

      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-brand-creamDark">Team</span>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
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
                    <div className="font-semibold text-brand-cream">{player.playerName}</div>
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
        </table>
      </div>
    </div>
  );
}
