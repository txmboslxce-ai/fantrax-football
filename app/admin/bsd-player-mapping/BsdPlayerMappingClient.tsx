"use client";

import { useEffect, useMemo, useState } from "react";

type UnmatchedBsdPlayer = {
  id: number;
  name: string;
  shortName: string;
  teamId: number;
  teamAbbrev: string;
};

type UnmatchedFantraxPlayer = {
  id: string;
  name: string;
  team: string;
};

type FetchResult = {
  pendingAutoMatches: number;
  unmatchedBsdPlayers: UnmatchedBsdPlayer[];
  unmatchedFantraxPlayers: UnmatchedFantraxPlayer[];
};

export default function BsdPlayerMappingClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAutoMatches, setPendingAutoMatches] = useState(0);
  const [bsdPlayers, setBsdPlayers] = useState<UnmatchedBsdPlayer[]>([]);
  const [fantraxPlayers, setFantraxPlayers] = useState<UnmatchedFantraxPlayer[]>([]);

  const [autoMatching, setAutoMatching] = useState(false);
  const [autoMatchMessage, setAutoMatchMessage] = useState<string | null>(null);

  const [selectedByBsdId, setSelectedByBsdId] = useState<Record<number, string>>({});
  const [showAllTeamsByBsdId, setShowAllTeamsByBsdId] = useState<Record<number, boolean>>({});
  const [savingBsdId, setSavingBsdId] = useState<number | null>(null);
  const [rowErrorByBsdId, setRowErrorByBsdId] = useState<Record<number, string>>({});

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/admin/bsd-player-mapping");
      if (!alive) return;

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? `Failed to load (${response.status})`);
        setLoading(false);
        return;
      }

      const data = (await response.json()) as FetchResult;
      setPendingAutoMatches(data.pendingAutoMatches);
      setBsdPlayers(data.unmatchedBsdPlayers);
      setFantraxPlayers(data.unmatchedFantraxPlayers);
      setLoading(false);
    }

    void load();

    return () => {
      alive = false;
    };
  }, []);

  const fantraxByTeam = useMemo(() => {
    const map = new Map<string, UnmatchedFantraxPlayer[]>();
    for (const player of fantraxPlayers) {
      const list = map.get(player.team) ?? [];
      list.push(player);
      map.set(player.team, list);
    }
    return map;
  }, [fantraxPlayers]);

  async function handleAutoMatch() {
    setAutoMatching(true);
    setAutoMatchMessage(null);

    const response = await fetch("/api/admin/bsd-player-mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto" }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
      updatedCount?: number;
      unmatchedBsdPlayers?: UnmatchedBsdPlayer[];
      unmatchedFantraxPlayers?: UnmatchedFantraxPlayer[];
    };

    if (!response.ok) {
      setAutoMatchMessage(data.message ?? `Auto-match failed (${response.status})`);
      setAutoMatching(false);
      return;
    }

    setAutoMatchMessage(`Matched ${data.updatedCount ?? 0} player${data.updatedCount === 1 ? "" : "s"} automatically.`);
    setPendingAutoMatches(0);
    setBsdPlayers(data.unmatchedBsdPlayers ?? []);
    setFantraxPlayers(data.unmatchedFantraxPlayers ?? []);
    setAutoMatching(false);
  }

  async function handleConfirm(bsdPlayer: UnmatchedBsdPlayer) {
    const playerId = selectedByBsdId[bsdPlayer.id];
    if (!playerId) {
      setRowErrorByBsdId((prev) => ({ ...prev, [bsdPlayer.id]: "Choose a player first." }));
      return;
    }

    setSavingBsdId(bsdPlayer.id);
    setRowErrorByBsdId((prev) => {
      const next = { ...prev };
      delete next[bsdPlayer.id];
      return next;
    });

    const response = await fetch("/api/admin/bsd-player-mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, bsdId: bsdPlayer.id }),
    });

    const data = (await response.json().catch(() => ({}))) as { message?: string };

    if (!response.ok) {
      setRowErrorByBsdId((prev) => ({ ...prev, [bsdPlayer.id]: data.message ?? `Save failed (${response.status})` }));
      setSavingBsdId(null);
      return;
    }

    setBsdPlayers((prev) => prev.filter((p) => p.id !== bsdPlayer.id));
    setFantraxPlayers((prev) => prev.filter((p) => p.id !== playerId));
    setSavingBsdId(null);
  }

  if (loading) {
    return (
      <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl text-sm text-brand-creamDark">Loading unmapped players...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl rounded-xl border border-red-400/50 bg-red-950/25 p-6 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-black sm:text-4xl">BSD ↔ Fantrax Player Mapping</h1>
        <p className="mt-2 text-sm text-brand-creamDark">
          Links sports.bzzoiro.com player ids to Fantrax players, so pages like Transfers can link to a player&apos;s
          page. Names that match exactly (same team, same normalized name) can be auto-matched; anything else needs a
          manual pick below.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-4">
          <button
            type="button"
            onClick={() => void handleAutoMatch()}
            disabled={autoMatching || pendingAutoMatches === 0}
            className="rounded bg-brand-green px-4 py-2 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60"
          >
            {autoMatching ? "Matching..." : `Run auto-match (${pendingAutoMatches} pending)`}
          </button>
          {autoMatchMessage ? <p className="text-sm text-brand-creamDark">{autoMatchMessage}</p> : null}
        </div>

        <p className="mt-8 text-sm text-brand-creamDark">
          {bsdPlayers.length} BSD player{bsdPlayers.length === 1 ? "" : "s"} without a match. Pick the corresponding
          Fantrax player on the right and confirm.
        </p>

        <div className="mt-4 space-y-3">
          {bsdPlayers.length === 0 ? (
            <p className="text-sm text-brand-creamDark">Nothing unmapped. Everything&apos;s linked.</p>
          ) : (
            bsdPlayers.map((bsdPlayer) => {
              const showAllTeams = showAllTeamsByBsdId[bsdPlayer.id] ?? false;
              const sameTeamCandidates = fantraxByTeam.get(bsdPlayer.teamAbbrev) ?? [];
              const candidates = showAllTeams || sameTeamCandidates.length === 0 ? fantraxPlayers : sameTeamCandidates;
              const rowError = rowErrorByBsdId[bsdPlayer.id];
              const isSaving = savingBsdId === bsdPlayer.id;

              return (
                <div key={bsdPlayer.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-4">
                  <div className="min-w-56 flex-1">
                    <p className="font-semibold">{bsdPlayer.name}</p>
                    <p className="text-xs text-brand-creamDark">
                      short: {bsdPlayer.shortName} &middot; {bsdPlayer.teamAbbrev} &middot; bsd_id {bsdPlayer.id}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedByBsdId[bsdPlayer.id] ?? ""}
                      onChange={(event) => setSelectedByBsdId((prev) => ({ ...prev, [bsdPlayer.id]: event.target.value }))}
                      className="min-w-64 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1.5 text-sm text-brand-cream focus:border-brand-green focus:outline-none"
                    >
                      <option value="">Select Fantrax player...</option>
                      {candidates.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name} ({player.team})
                        </option>
                      ))}
                    </select>

                    {sameTeamCandidates.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowAllTeamsByBsdId((prev) => ({ ...prev, [bsdPlayer.id]: !showAllTeams }))}
                        className="rounded border border-brand-cream/35 px-2 py-1 text-xs font-semibold text-brand-creamDark hover:bg-brand-greenDark"
                      >
                        {showAllTeams ? `Show ${bsdPlayer.teamAbbrev} only` : "Show all teams"}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => void handleConfirm(bsdPlayer)}
                      disabled={isSaving}
                      className="rounded bg-brand-green px-3 py-1.5 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60"
                    >
                      {isSaving ? "Saving..." : "Confirm"}
                    </button>
                  </div>

                  {rowError ? <p className="w-full text-xs text-red-300">{rowError}</p> : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
