"use client";

import Papa from "papaparse";
import { useEffect, useMemo, useState } from "react";

type UploadType = "player" | "keeper";
type FantraxPositionGroup = "POS_701" | "POS_702" | "POS_703" | "POS_704";

type UploadResult = {
  success: boolean;
  rowsProcessed: number;
  errors: string[];
};

type FantraxSyncResponse = {
  success: boolean;
  gameweek?: number;
  season?: string;
  playersSynced?: number;
  unmatchedFantraxIds?: string[];
  currentGameweek?: number;
  positionOrGroup?: FantraxPositionGroup;
  positionLabel?: string;
  positionResults?: Array<{
    positionLabel: string;
    playersSynced: number;
    unmatchedFantraxIds: string[];
  }>;
  message?: string;
};

type FantraxPlayerSyncResponse = {
  success: boolean;
  season?: string;
  playersFound?: number;
  poolEntriesAdded?: number;
  poolEntriesRemoved?: number;
  added?: Array<{ fantraxId: string; name: string; team: string; position: string }>;
  changed?: Array<{
    fantraxId: string;
    name: string;
    before: { team: string | null; position: string };
    after: { team: string; position: string };
  }>;
  failed?: Array<{
    fantraxId: string;
    name: string;
    before: { team: string | null; position: string } | null;
    after: { team: string; position: string };
    error: string;
  }>;
  unmatched?: Array<{ fantraxId: string; name: string; team: string; reason: string }>;
  message?: string;
};

type FplSyncNowResponse = {
  success: boolean;
  playerData?: { synced: number; season: string; syncedAt: string };
  fixtures?: { synced: number; skipped: number; season: string };
  message?: string;
};

type AdpRefreshResponse = {
  success: boolean;
  updated?: number;
  season?: string;
  message?: string;
};

type PreviewRow = Record<string, string>;

type CsvUploadCardProps = {
  title: string;
  type: UploadType;
  defaultSeason: string;
};


function CsvUploadCard({ title, type, defaultSeason }: CsvUploadCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [season, setSeason] = useState(defaultSeason);
  const [gameweek, setGameweek] = useState(1);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const rowCount = useMemo(() => previewRows.length, [previewRows.length]);

  async function handlePreview() {
    if (!file) {
      setResult({ success: false, rowsProcessed: 0, errors: ["Please choose a CSV file first."] });
      return;
    }

    setIsParsing(true);
    setResult(null);

    const text = await file.text();
    const parsed = Papa.parse<PreviewRow>(text, { header: true, skipEmptyLines: true });

    setIsParsing(false);

    if (parsed.errors.length > 0) {
      setResult({
        success: false,
        rowsProcessed: 0,
        errors: parsed.errors.map((error) => `Row ${error.row}: ${error.message}`),
      });
      return;
    }

    setPreviewRows(parsed.data.slice(0, 5));
    setShowConfirm(true);
  }

  async function handleConfirmUpload() {
    if (!file) {
      return;
    }

    setIsUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    formData.append("season", season);
    formData.append("gameweek", String(gameweek));

    const response = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData,
    });

    const data = (await response.json()) as UploadResult;
    setResult(data);
    setShowConfirm(false);
    setIsUploading(false);
  }

  return (
    <section className="rounded-xl border border-brand-green/40 bg-brand-green/10 p-6">
      <h2 className="text-xl font-bold text-brand-cream">{title}</h2>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-2 block font-semibold text-brand-creamDark">CSV File</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreviewRows([]);
              setShowConfirm(false);
              setResult(null);
            }}
            className="w-full rounded-md border border-brand-cream/30 bg-brand-dark px-3 py-2 text-brand-cream"
          />
        </label>

        <label className="text-sm">
          <span className="mb-2 block font-semibold text-brand-creamDark">Season</span>
          <input
            value={season}
            onChange={(event) => setSeason(event.target.value)}
            className="w-full rounded-md border border-brand-cream/30 bg-brand-dark px-3 py-2 text-brand-cream"
          />
        </label>

        <label className="text-sm">
          <span className="mb-2 block font-semibold text-brand-creamDark">Gameweek (1-38)</span>
          <input
            type="number"
            min={1}
            max={38}
            value={gameweek}
            onChange={(event) => setGameweek(Number(event.target.value))}
            className="w-full rounded-md border border-brand-cream/30 bg-brand-dark px-3 py-2 text-brand-cream"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handlePreview}
          disabled={isParsing || isUploading}
          className="rounded-md bg-brand-green px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60"
        >
          {isParsing ? "Parsing..." : "Preview First 5 Rows"}
        </button>
      </div>

      {previewRows.length > 0 && (
        <div className="mt-5 overflow-auto rounded-lg border border-brand-cream/20">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-brand-dark/80 text-brand-creamDark">
              <tr>
                {Object.keys(previewRows[0]).map((key) => (
                  <th key={key} className="px-3 py-2">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, index) => (
                <tr key={`${index}-${row.ID ?? ""}`} className="border-t border-brand-cream/15 text-brand-cream">
                  {Object.keys(previewRows[0]).map((key) => (
                    <td key={`${key}-${index}`} className="px-3 py-2">
                      {row[key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showConfirm && (
        <div className="mt-5 rounded-lg border border-brand-greenLight/50 bg-brand-dark/80 p-4">
          <p className="font-medium text-brand-cream">Process {rowCount} rows for GW {gameweek}?</p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={handleConfirmUpload}
              disabled={isUploading}
              className="rounded-md bg-brand-green px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60"
            >
              {isUploading ? "Uploading..." : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={isUploading}
              className="rounded-md border border-brand-cream/40 px-4 py-2 font-semibold text-brand-cream"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <div
          className={`mt-5 rounded-lg border p-4 text-sm ${
            result.success ? "border-green-400/50 bg-green-950/25" : "border-red-400/50 bg-red-950/25"
          }`}
        >
          <p className="font-semibold">Rows processed: {result.rowsProcessed}</p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {result.errors.map((error, idx) => (
                <li key={`${error}-${idx}`}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function FantraxSyncPanel({ seasons, defaultSeason }: { seasons: string[]; defaultSeason: string }) {
  const [currentGameweek, setCurrentGameweek] = useState<number | null>(null);
  const [isLoadingCurrentGw, setIsLoadingCurrentGw] = useState(true);
  const [gameweek, setGameweek] = useState(1);
  const [season, setSeason] = useState(defaultSeason);
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<FantraxSyncResponse | null>(null);
  const [currentGwError, setCurrentGwError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentGameweek() {
      setIsLoadingCurrentGw(true);
      setCurrentGwError(null);

      try {
        const response = await fetch("/api/fantrax/sync-scores", { method: "GET" });
        const data = (await response.json()) as FantraxSyncResponse;

        if (cancelled) {
          return;
        }

        if (data.success && data.currentGameweek) {
          setCurrentGameweek(data.currentGameweek);
          setGameweek(data.currentGameweek);
        } else {
          setCurrentGwError(data.message ?? "Failed to load current gameweek.");
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Failed to load current gameweek.";
          setCurrentGwError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCurrentGw(false);
        }
      }
    }

    void loadCurrentGameweek();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSyncAllPositions() {
    setIsSyncing(true);
    setResult(null);

    try {
      const response = await fetch("/api/fantrax/sync-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameweek, season, syncAllPositions: true }),
      });
      const data = (await response.json()) as FantraxSyncResponse;
      setResult(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fantrax sync failed.";
      setResult({ success: false, message, gameweek, season });
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <section className="rounded-xl border border-brand-green/40 bg-brand-green/10 p-6">
      <h2 className="text-xl font-bold text-brand-cream">Fantrax API Score Sync</h2>
      <p className="mt-2 text-sm text-brand-creamDark">
        Sync all four Fantrax position groups into `player_gameweeks` for one selected season and gameweek.
      </p>

      <div className="mt-5 rounded-lg border border-brand-cream/20 bg-brand-dark/40 p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_minmax(0,180px)_auto] md:items-end">
          <label className="text-sm">
            <span className="mb-2 block font-semibold text-brand-creamDark">Season</span>
            <select
              value={season}
              onChange={(event) => setSeason(event.target.value)}
              className="w-full rounded-md border border-brand-cream/30 bg-brand-dark px-3 py-2 text-brand-cream"
            >
              {seasons.map((availableSeason) => (
                <option key={availableSeason} value={availableSeason}>{availableSeason}</option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-2 block font-semibold text-brand-creamDark">Gameweek</span>
            <input
              type="number"
              min={1}
              max={38}
              value={gameweek}
              onChange={(event) => setGameweek(Number(event.target.value))}
              className="w-full rounded-md border border-brand-cream/30 bg-brand-dark px-3 py-2 text-brand-cream"
            />
          </label>

          <button
            type="button"
            onClick={handleSyncAllPositions}
            disabled={isSyncing || isLoadingCurrentGw}
            className="rounded-md border border-brand-cream/30 bg-brand-dark px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60"
          >
            {isSyncing ? "Syncing All Positions..." : "Sync All Positions (GW)"}
          </button>
        </div>

        <p className="mt-3 text-xs text-brand-creamDark">
          {isLoadingCurrentGw
            ? "Loading current gameweek..."
            : currentGwError
              ? currentGwError
              : `Current gameweek: ${currentGameweek ?? "Unavailable"}`}
        </p>

        {season !== defaultSeason ? (
          <div className="mt-4 rounded-lg border border-amber-300/50 bg-amber-950/20 p-3 text-sm text-amber-100">
            <p className="font-semibold">Non-current season selected</p>
            <p className="mt-1 text-amber-100/80">
              This temporarily changes the live season while all four position groups sync, then restores it. Run this alone—do not sync or edit season data concurrently.
            </p>
          </div>
        ) : null}

        {result ? (
          <div
            className={`mt-5 rounded-lg border p-4 text-sm ${
              result.success ? "border-green-400/50 bg-green-950/25" : "border-red-400/50 bg-red-950/25"
            }`}
          >
            {result.success ? (
              <>
                <p className="font-semibold">Synced {result.playersSynced ?? 0} players across all positions for {result.season ?? season}, GW {result.gameweek ?? gameweek}.</p>
                <p className="mt-2">Unmatched Fantrax IDs: {(result.unmatchedFantraxIds ?? []).join(", ") || "None"}</p>
                <ul className="mt-2 list-disc pl-5">
                  {(result.positionResults ?? []).map((position) => (
                    <li key={position.positionLabel}>{position.positionLabel}: {position.playersSynced} players synced</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{result.message ?? "Fantrax sync failed."}</p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FantraxPlayerSyncPanel({ seasons, defaultSeason }: { seasons: string[]; defaultSeason: string }) {
  const [season, setSeason] = useState(defaultSeason);
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<FantraxPlayerSyncResponse | null>(null);

  async function handleSyncPlayers() {
    setIsSyncing(true);
    setResult(null);

    try {
      const response = await fetch("/api/fantrax/sync-players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season }),
      });
      setResult((await response.json()) as FantraxPlayerSyncResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fantrax player sync failed.";
      setResult({ success: false, message });
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <section className="rounded-xl border border-brand-green/40 bg-brand-green/10 p-6">
      <h2 className="text-xl font-bold text-brand-cream">Fantrax Player Pool Sync</h2>
      <p className="mt-2 text-sm text-brand-creamDark">
        Add the selected league&apos;s players to the season pool and update only player team or position changes. Scores and ownership are not touched.
      </p>

      <div className="mt-5 rounded-lg border border-brand-cream/20 bg-brand-dark/40 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="w-full max-w-[180px] text-sm">
            <span className="mb-2 block font-semibold text-brand-creamDark">Season</span>
            <select value={season} onChange={(event) => setSeason(event.target.value)} className="w-full rounded-md border border-brand-cream/30 bg-brand-dark px-3 py-2 text-brand-cream">
              {seasons.map((availableSeason) => <option key={availableSeason} value={availableSeason}>{availableSeason}</option>)}
            </select>
          </label>
          <button type="button" onClick={handleSyncPlayers} disabled={isSyncing} className="rounded-md border border-brand-cream/30 bg-brand-dark px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60">
            {isSyncing ? "Syncing Players..." : "Sync Players"}
          </button>
        </div>

        {result ? (
          <div className={`mt-5 rounded-lg border p-4 text-sm ${result.success ? "border-green-400/50 bg-green-950/25" : "border-red-400/50 bg-red-950/25"}`}>
            {result.success || result.failed ? (
              <>
                <p className="font-semibold">{result.added?.length ?? 0} added, {result.changed?.length ?? 0} team/position changes, {result.failed?.length ?? 0} failed, {result.unmatched?.length ?? 0} unmatched.</p>
                <p className="mt-1 text-brand-creamDark">Players found: {result.playersFound ?? 0}. New season-pool entries: {result.poolEntriesAdded ?? 0}. Stale season-pool entries removed: {result.poolEntriesRemoved ?? 0}.</p>
                {(result.changed?.length ?? 0) > 0 ? (
                  <ul className="mt-3 space-y-1 border-t border-brand-cream/15 pt-3">
                    {result.changed?.map((player) => <li key={player.fantraxId}>{player.name}: {player.before.team ?? "—"} / {player.before.position} → {player.after.team} / {player.after.position}</li>)}
                  </ul>
                ) : null}
                {(result.failed?.length ?? 0) > 0 ? (
                  <ul className="mt-3 space-y-1 border-t border-red-300/30 pt-3 text-red-100">
                    {result.failed?.map((player) => <li key={player.fantraxId}>{player.name}: {player.before ? `${player.before.team ?? "—"} / ${player.before.position} → ` : "new player → "}{player.after.team} / {player.after.position} ({player.error})</li>)}
                  </ul>
                ) : null}
                {(result.unmatched?.length ?? 0) > 0 ? (
                  <ul className="mt-3 space-y-1 border-t border-brand-cream/15 pt-3">
                    {result.unmatched?.map((player) => <li key={player.fantraxId}>{player.name} ({player.team || "no team"}): {player.reason}</li>)}
                  </ul>
                ) : null}
              </>
            ) : <p>{result.message ?? "Fantrax player sync failed."}</p>}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FplSyncNowPanel() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<FplSyncNowResponse | null>(null);

  async function handleSyncFplData() {
    setIsSyncing(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/fpl-sync-now", { method: "POST" });
      setResult((await response.json()) as FplSyncNowResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : "FPL data sync failed.";
      setResult({ success: false, message });
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <section className="rounded-xl border border-brand-green/40 bg-brand-green/10 p-6">
      <h2 className="text-xl font-bold text-brand-cream">Sync FPL Data</h2>
      <p className="mt-2 text-sm text-brand-creamDark">
        Run the same current-season player-data and fixture sync as the daily scheduled job.
      </p>

      <div className="mt-5 rounded-lg border border-brand-cream/20 bg-brand-dark/40 p-4">
        <button
          type="button"
          onClick={handleSyncFplData}
          disabled={isSyncing}
          className="rounded-md border border-brand-cream/30 bg-brand-dark px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60"
        >
          {isSyncing ? "Syncing FPL Data..." : "Sync FPL Data"}
        </button>

        {result ? (
          <div className={`mt-5 rounded-lg border p-4 text-sm ${result.success ? "border-green-400/50 bg-green-950/25" : "border-red-400/50 bg-red-950/25"}`}>
            {result.success ? (
              <>
                <p className="font-semibold">
                  {result.playerData?.synced ?? 0} players updated, {result.fixtures?.synced ?? 0} fixtures synced.
                </p>
                <p className="mt-1 text-brand-creamDark">
                  Season: {result.playerData?.season ?? result.fixtures?.season ?? "Unknown"}. Skipped fixtures without a gameweek: {result.fixtures?.skipped ?? 0}.
                </p>
              </>
            ) : <p>{result.message ?? "FPL data sync failed."}</p>}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AdpRefreshPanel() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [result, setResult] = useState<AdpRefreshResponse | null>(null);

  async function handleRefreshAdp() {
    setIsRefreshing(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/sync-adp-now", { method: "POST" });
      setResult((await response.json()) as AdpRefreshResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ADP refresh failed.";
      setResult({ success: false, message });
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <section className="rounded-xl border border-brand-green/40 bg-brand-green/10 p-6">
      <h2 className="text-xl font-bold text-brand-cream">Refresh ADP</h2>
      <p className="mt-2 text-sm text-brand-creamDark">
        Refresh Fantrax average draft position for existing 2026-27 player-pool rows only.
      </p>

      <div className="mt-5 rounded-lg border border-brand-cream/20 bg-brand-dark/40 p-4">
        <button
          type="button"
          onClick={handleRefreshAdp}
          disabled={isRefreshing}
          className="rounded-md border border-brand-cream/30 bg-brand-dark px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60"
        >
          {isRefreshing ? "Refreshing ADP..." : "Refresh ADP"}
        </button>

        {result ? (
          <div className={`mt-5 rounded-lg border p-4 text-sm ${result.success ? "border-green-400/50 bg-green-950/25" : "border-red-400/50 bg-red-950/25"}`}>
            {result.success ? (
              <p className="font-semibold">Updated ADP for {result.updated ?? 0} players in {result.season ?? "2026-27"}.</p>
            ) : <p>{result.message ?? "ADP refresh failed."}</p>}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function UploadClient({ defaultSeason, seasons }: { defaultSeason: string; seasons: string[] }) {
  return (
    <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-3xl font-black sm:text-4xl">Admin Data Upload</h1>
        <p className="text-sm text-brand-creamDark">
          Sync all Fantrax positions for a selected season and gameweek, or upload weekly player and keeper Fantrax CSV dumps.
        </p>

        <FantraxSyncPanel seasons={seasons} defaultSeason={defaultSeason} />
        <FantraxPlayerSyncPanel seasons={seasons} defaultSeason={defaultSeason} />
        <AdpRefreshPanel />
        <FplSyncNowPanel />
        <CsvUploadCard title="Upload Player Dump" type="player" defaultSeason={defaultSeason} />
        <CsvUploadCard title="Upload Keeper Dump" type="keeper" defaultSeason={defaultSeason} />
      </div>
    </div>
  );
}
