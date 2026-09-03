"use client";

import { useEffect, useMemo, useState } from "react";

type UnmatchedRotowirePlayer = {
  name: string;
  rotowireId: number | null;
  team: string;
  position: string | null;
  kind: "starter" | "injury";
};

type UnmatchedFantraxPlayer = {
  id: string;
  name: string;
  team: string;
};

type FetchResult = {
  matchesFound: number;
  unmatchedTeams: string[];
  skippedFixtures: string[];
  unmatchedRotowirePlayers: UnmatchedRotowirePlayer[];
  unmatchedFantraxPlayers: UnmatchedFantraxPlayer[];
};

function rowKey(player: UnmatchedRotowirePlayer): string {
  return player.rotowireId != null ? `id:${player.rotowireId}` : `name:${player.team}:${player.name}`;
}

export default function RotowirePlayerMappingClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unmatchedTeams, setUnmatchedTeams] = useState<string[]>([]);
  const [skippedFixtures, setSkippedFixtures] = useState<string[]>([]);
  const [rotowirePlayers, setRotowirePlayers] = useState<UnmatchedRotowirePlayer[]>([]);
  const [fantraxPlayers, setFantraxPlayers] = useState<UnmatchedFantraxPlayer[]>([]);

  const [selectedByKey, setSelectedByKey] = useState<Record<string, string>>({});
  const [showAllTeamsByKey, setShowAllTeamsByKey] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rowErrorByKey, setRowErrorByKey] = useState<Record<string, string>>({});
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/admin/rotowire-player-mapping");
      if (!alive) return;

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        if (!alive) return;
        setError(data.message ?? `Failed to load (${response.status})`);
        setLoading(false);
        return;
      }

      const data = (await response.json()) as FetchResult;
      if (!alive) return;
      setUnmatchedTeams(data.unmatchedTeams);
      setSkippedFixtures(data.skippedFixtures);
      setRotowirePlayers(data.unmatchedRotowirePlayers);
      setFantraxPlayers(data.unmatchedFantraxPlayers);
      setLoading(false);
    }

    void load();

    return () => {
      alive = false;
    };
  }, [reloadToken]);

  const fantraxByTeam = useMemo(() => {
    const map = new Map<string, UnmatchedFantraxPlayer[]>();
    for (const player of fantraxPlayers) {
      const list = map.get(player.team) ?? [];
      list.push(player);
      map.set(player.team, list);
    }
    return map;
  }, [fantraxPlayers]);

  async function handleConfirm(rotowirePlayer: UnmatchedRotowirePlayer) {
    const key = rowKey(rotowirePlayer);
    const playerId = selectedByKey[key];
    if (!playerId) {
      setRowErrorByKey((prev) => ({ ...prev, [key]: "Choose a player first." }));
      return;
    }
    if (rotowirePlayer.rotowireId == null) {
      setRowErrorByKey((prev) => ({ ...prev, [key]: "This entry has no RotoWire player id to record (couldn't find one in its profile link)." }));
      return;
    }

    setSavingKey(key);
    setRowErrorByKey((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    const response = await fetch("/api/admin/rotowire-player-mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, rotowireId: rotowirePlayer.rotowireId }),
    });

    const data = (await response.json().catch(() => ({}))) as { message?: string };

    if (!response.ok) {
      setRowErrorByKey((prev) => ({ ...prev, [key]: data.message ?? `Save failed (${response.status})` }));
      setSavingKey(null);
      return;
    }

    setRotowirePlayers((prev) => prev.filter((p) => rowKey(p) !== key));
    setFantraxPlayers((prev) => prev.filter((p) => p.id !== playerId));
    setSavingKey(null);
  }

  if (loading) {
    return (
      <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl text-sm text-brand-creamDark">Fetching RotoWire&apos;s lineups page and matching...</div>
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
        <h1 className="text-3xl font-black sm:text-4xl">RotoWire ↔ Fantrax Player Mapping</h1>
        <p className="mt-2 text-sm text-brand-creamDark">
          Pairs a RotoWire player id to a Fantrax player, same idea as BSD player mapping. Every sync run already
          matches on exact name (and, once recorded here, on this id) automatically -- this is only for names RotoWire
          formats differently enough that automatic matching can&apos;t safely guess (abbreviations, bare first names with
          more than one same-name teammate, etc). Once paired, every future sync recognizes that player instantly
          regardless of how RotoWire happens to display their name that day.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-4">
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="rounded bg-brand-green px-4 py-2 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight"
          >
            Refresh from RotoWire
          </button>
          <p className="text-sm text-brand-creamDark">{`${rotowirePlayers.length} unmatched across ${skippedFixtures.length ? "some" : "all"} of today's fetched matches.`}</p>
        </div>

        {unmatchedTeams.length > 0 ? (
          <p className="mt-4 text-sm text-amber-300">Unmatched teams (check the teams table): {unmatchedTeams.join(", ")}</p>
        ) : null}
        {skippedFixtures.length > 0 ? (
          <p className="mt-1 text-sm text-amber-300">No matching fixture in our schedule for: {skippedFixtures.join(", ")}</p>
        ) : null}

        <div className="mt-4 space-y-3">
          {rotowirePlayers.length === 0 ? (
            <p className="text-sm text-brand-creamDark">Nothing unmapped right now. Everything on RotoWire&apos;s current page matched.</p>
          ) : (
            rotowirePlayers.map((rotowirePlayer) => {
              const key = rowKey(rotowirePlayer);
              const showAllTeams = showAllTeamsByKey[key] ?? false;
              const sameTeamCandidates = fantraxByTeam.get(rotowirePlayer.team) ?? [];
              const candidates = showAllTeams || sameTeamCandidates.length === 0 ? fantraxPlayers : sameTeamCandidates;
              const rowError = rowErrorByKey[key];
              const isSaving = savingKey === key;

              return (
                <div key={key} className="flex flex-wrap items-center gap-4 rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-4">
                  <div className="min-w-56 flex-1">
                    <p className="font-semibold">
                      {rotowirePlayer.name}
                      {rotowirePlayer.kind === "injury" ? (
                        <span className="ml-2 rounded-full bg-red-900/50 px-2 py-0.5 text-[10px] font-bold text-red-200">INJURY LIST</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-brand-creamDark">
                      {rotowirePlayer.team} &middot; {rotowirePlayer.position ?? "no position"} &middot;{" "}
                      {rotowirePlayer.rotowireId != null ? `rotowire_id ${rotowirePlayer.rotowireId}` : "no rotowire id found"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedByKey[key] ?? ""}
                      onChange={(event) => setSelectedByKey((prev) => ({ ...prev, [key]: event.target.value }))}
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
                        onClick={() => setShowAllTeamsByKey((prev) => ({ ...prev, [key]: !showAllTeams }))}
                        className="rounded border border-brand-cream/35 px-2 py-1 text-xs font-semibold text-brand-creamDark hover:bg-brand-greenDark"
                      >
                        {showAllTeams ? `Show ${rotowirePlayer.team} only` : "Show all teams"}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => void handleConfirm(rotowirePlayer)}
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
