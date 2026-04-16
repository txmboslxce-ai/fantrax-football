"use client";

import { useState } from "react";

type SyncResponse = {
  success: boolean;
  message?: string;
  gameweek?: number;
  season?: string;
  synced?: number;
  unmatched?: string[];
  fetchedAt?: string;
};

export default function SofascoreLineupsCard({ defaultGameweek }: { defaultGameweek: number }) {
  const [gameweek, setGameweek] = useState(String(defaultGameweek));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResponse | null>(null);

  async function handleSync() {
    const gw = parseInt(gameweek, 10);
    if (!Number.isInteger(gw) || gw <= 0) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/sofascore/sync-lineups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season: "2025-26", gameweek: gw }),
      });
      const data = (await res.json()) as SyncResponse;
      setResult(data);
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-greenLight/40 bg-brand-green p-6">
      <h2 className="text-2xl font-bold text-brand-cream">SofaScore Lineups</h2>
      <p className="mt-2 text-sm text-brand-creamDark">
        Fetch lineup data from SofaScore and override start probabilities in player predictions.
      </p>

      <div className="mt-5 flex items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
            Gameweek
          </span>
          <input
            type="number"
            min={1}
            max={38}
            value={gameweek}
            onChange={(e) => setGameweek(e.target.value)}
            className="w-20 rounded border border-brand-cream/25 bg-brand-dark px-2 py-1.5 text-center text-sm font-semibold text-brand-cream focus:border-brand-green focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={handleSync}
          disabled={loading}
          className="rounded-md border border-brand-cream/25 bg-brand-dark px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Syncing…" : "Sync Lineups"}
        </button>
      </div>

      {result ? (
        <div
          className={`mt-4 rounded-lg border p-3 text-sm ${
            result.success ? "border-green-400/50 bg-green-950/25" : "border-red-400/50 bg-red-950/25"
          }`}
        >
          {result.success ? (
            <div className="space-y-1.5">
              <p className="font-semibold text-brand-cream">
                GW{result.gameweek} — {result.synced} player{result.synced !== 1 ? "s" : ""} synced
              </p>
              {result.fetchedAt ? (
                <p className="text-xs text-brand-creamDark">
                  Fetched at: {new Date(result.fetchedAt).toLocaleString()}
                </p>
              ) : null}
              {result.unmatched && result.unmatched.length > 0 ? (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                    {result.unmatched.length} unmatched player{result.unmatched.length !== 1 ? "s" : ""} — add to manual-mapping.csv:
                  </p>
                  <ul className="mt-1 max-h-40 overflow-y-auto space-y-0.5">
                    {result.unmatched.map((name) => (
                      <li key={name} className="text-xs text-brand-creamDark">
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-brand-creamDark">No unmatched players.</p>
              )}
            </div>
          ) : (
            <p className="text-red-300">{result.message ?? "Sync failed."}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
