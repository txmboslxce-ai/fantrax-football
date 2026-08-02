"use client";

import { useEffect, useMemo, useState } from "react";

type UnmappedFplPlayer = {
  fplId: number;
  name: string;
  webName: string;
  team: string | null;
  position: string;
};

type UnmappedPlayer = {
  id: string;
  name: string;
  team: string;
  position: string;
  isStale: boolean;
  staleFplId: number | null;
};

type FetchResult = {
  unmappedFplPlayers: UnmappedFplPlayer[];
  unmappedPlayers: UnmappedPlayer[];
};

export default function PlayerMappingClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fplPlayers, setFplPlayers] = useState<UnmappedFplPlayer[]>([]);
  const [players, setPlayers] = useState<UnmappedPlayer[]>([]);

  const [selectedByFplId, setSelectedByFplId] = useState<Record<number, string>>({});
  const [showAllTeamsByFplId, setShowAllTeamsByFplId] = useState<Record<number, boolean>>({});
  const [savingFplId, setSavingFplId] = useState<number | null>(null);
  const [rowErrorByFplId, setRowErrorByFplId] = useState<Record<number, string>>({});

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/admin/player-mapping");
      if (!alive) return;

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? `Failed to load (${response.status})`);
        setLoading(false);
        return;
      }

      const data = (await response.json()) as FetchResult;
      setFplPlayers(data.unmappedFplPlayers);
      setPlayers(data.unmappedPlayers);
      setLoading(false);
    }

    void load();

    return () => {
      alive = false;
    };
  }, []);

  const playersByTeam = useMemo(() => {
    const map = new Map<string, UnmappedPlayer[]>();
    for (const player of players) {
      const list = map.get(player.team) ?? [];
      list.push(player);
      map.set(player.team, list);
    }
    return map;
  }, [players]);

  async function handleConfirm(fplPlayer: UnmappedFplPlayer) {
    const playerId = selectedByFplId[fplPlayer.fplId];
    if (!playerId) {
      setRowErrorByFplId((prev) => ({ ...prev, [fplPlayer.fplId]: "Choose a player first." }));
      return;
    }

    setSavingFplId(fplPlayer.fplId);
    setRowErrorByFplId((prev) => {
      const next = { ...prev };
      delete next[fplPlayer.fplId];
      return next;
    });

    const response = await fetch("/api/admin/player-mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, fplId: fplPlayer.fplId }),
    });

    const data = (await response.json().catch(() => ({}))) as { message?: string };

    if (!response.ok) {
      setRowErrorByFplId((prev) => ({ ...prev, [fplPlayer.fplId]: data.message ?? `Save failed (${response.status})` }));
      setSavingFplId(null);
      return;
    }

    // Success — remove the matched FPL player from the left list and the
    // matched players row from the dropdown pool, without a refetch.
    setFplPlayers((prev) => prev.filter((p) => p.fplId !== fplPlayer.fplId));
    setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    setSavingFplId(null);
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
        <h1 className="text-3xl font-black sm:text-4xl">FPL ↔ Fantrax Player Mapping</h1>
        <p className="mt-2 text-sm text-brand-creamDark">
          {fplPlayers.length} FPL player{fplPlayers.length === 1 ? "" : "s"} without a match. Pick the corresponding
          Fantrax player on the right and confirm.
        </p>

        <div className="mt-8 space-y-3">
          {fplPlayers.length === 0 ? (
            <p className="text-sm text-brand-creamDark">Nothing unmapped. Everything's linked.</p>
          ) : (
            fplPlayers.map((fplPlayer) => {
              const showAllTeams = showAllTeamsByFplId[fplPlayer.fplId] ?? false;
              const sameTeamCandidates = fplPlayer.team ? playersByTeam.get(fplPlayer.team) ?? [] : [];
              const candidates = showAllTeams || sameTeamCandidates.length === 0 ? players : sameTeamCandidates;
              const rowError = rowErrorByFplId[fplPlayer.fplId];
              const isSaving = savingFplId === fplPlayer.fplId;

              return (
                <div
                  key={fplPlayer.fplId}
                  className="flex flex-wrap items-center gap-4 rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-4"
                >
                  <div className="min-w-56 flex-1">
                    <p className="font-semibold">{fplPlayer.name}</p>
                    <p className="text-xs text-brand-creamDark">
                      web: {fplPlayer.webName} &middot; {fplPlayer.team ?? "?"} &middot; {fplPlayer.position} &middot; fpl_id{" "}
                      {fplPlayer.fplId}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedByFplId[fplPlayer.fplId] ?? ""}
                      onChange={(event) =>
                        setSelectedByFplId((prev) => ({ ...prev, [fplPlayer.fplId]: event.target.value }))
                      }
                      className="min-w-64 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1.5 text-sm text-brand-cream focus:border-brand-green focus:outline-none"
                    >
                      <option value="">Select Fantrax player...</option>
                      {candidates.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name} ({player.team} / {player.position})
                          {player.isStale ? ` — (stale match, currently fpl_id ${player.staleFplId})` : ""}
                        </option>
                      ))}
                    </select>

                    {fplPlayer.team && sameTeamCandidates.length > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setShowAllTeamsByFplId((prev) => ({ ...prev, [fplPlayer.fplId]: !showAllTeams }))
                        }
                        className="rounded border border-brand-cream/35 px-2 py-1 text-xs font-semibold text-brand-creamDark hover:bg-brand-greenDark"
                      >
                        {showAllTeams ? `Show ${fplPlayer.team} only` : "Show all teams"}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => void handleConfirm(fplPlayer)}
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
