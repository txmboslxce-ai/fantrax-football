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
  playersSynced?: number;
  unmatchedFantraxIds?: string[];
  currentGameweek?: number;
  positionOrGroup?: FantraxPositionGroup;
  positionLabel?: string;
  message?: string;
};

type SyncAllSummary = {
  totalPlayersSynced: number;
  unmatchedFantraxIds: string[];
  completed: number;
  total: number;
  currentStep: string | null;
  errors: string[];
};

type PreviewRow = Record<string, string>;

type CsvUploadCardProps = {
  title: string;
  type: UploadType;
};

type PositionSyncCardProps = {
  buttonLabel: string;
  positionLabel: string;
  positionOrGroup: FantraxPositionGroup;
  defaultGameweek: number;
  currentGameweek: number | null;
  isLoadingCurrentGw: boolean;
  onSync: (gameweek: number, positionOrGroup: FantraxPositionGroup) => Promise<FantraxSyncResponse>;
};

const FANTRAX_POSITION_CARDS: Array<{
  buttonLabel: string;
  positionLabel: string;
  positionOrGroup: FantraxPositionGroup;
}> = [
  { buttonLabel: "Sync Forwards (GW)", positionLabel: "Forwards", positionOrGroup: "POS_701" },
  { buttonLabel: "Sync Midfielders (GW)", positionLabel: "Midfielders", positionOrGroup: "POS_702" },
  { buttonLabel: "Sync Defenders (GW)", positionLabel: "Defenders", positionOrGroup: "POS_703" },
  { buttonLabel: "Sync Goalkeepers (GW)", positionLabel: "Goalkeepers", positionOrGroup: "POS_704" },
];

function CsvUploadCard({ title, type }: CsvUploadCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [season, setSeason] = useState("2024-25");
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

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function PositionSyncCard({
  buttonLabel,
  positionLabel,
  positionOrGroup,
  defaultGameweek,
  currentGameweek,
  isLoadingCurrentGw,
  onSync,
}: PositionSyncCardProps) {
  const [gameweek, setGameweek] = useState(defaultGameweek);
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<FantraxSyncResponse | null>(null);

  useEffect(() => {
    setGameweek(defaultGameweek);
  }, [defaultGameweek]);

  async function handleSync() {
    setIsSyncing(true);
    setResult(null);

    try {
      const data = await onSync(gameweek, positionOrGroup);
      setResult(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : `${positionLabel} sync failed.`;
      setResult({ success: false, message, positionOrGroup, positionLabel, gameweek });
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <section className="rounded-xl border border-brand-green/40 bg-brand-green/10 p-6">
      <h3 className="text-lg font-bold text-brand-cream">{positionLabel}</h3>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,180px)_auto] md:items-end">
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
          onClick={handleSync}
          disabled={isSyncing || isLoadingCurrentGw}
          className="rounded-md bg-brand-green px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60"
        >
          {isSyncing ? "Syncing..." : buttonLabel}
        </button>
      </div>

      <p className="mt-3 text-xs text-brand-creamDark">
        {isLoadingCurrentGw
          ? "Loading current gameweek..."
          : `Current gameweek: ${currentGameweek ?? "Unavailable"}`}
      </p>

      {result ? (
        <div
          className={`mt-5 rounded-lg border p-4 text-sm ${
            result.success ? "border-green-400/50 bg-green-950/25" : "border-red-400/50 bg-red-950/25"
          }`}
        >
          {result.success ? (
            <>
              <p className="font-semibold">
                Synced {result.playersSynced ?? 0} {positionLabel.toLowerCase()} for GW {result.gameweek ?? gameweek}.
              </p>
              <p className="mt-2">Unmatched Fantrax IDs: {(result.unmatchedFantraxIds ?? []).join(", ") || "None"}</p>
            </>
          ) : (
            <p>{result.message ?? `${positionLabel} sync failed.`}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function FantraxSyncPanel() {
  const [currentGameweek, setCurrentGameweek] = useState<number | null>(null);
  const [isLoadingCurrentGw, setIsLoadingCurrentGw] = useState(true);
  const [syncAllSummary, setSyncAllSummary] = useState<SyncAllSummary | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncAllGameweek, setSyncAllGameweek] = useState(1);
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
          setSyncAllGameweek(data.currentGameweek);
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

  async function syncSingleGameweek(targetGameweek: number, positionOrGroup: FantraxPositionGroup) {
    const response = await fetch("/api/fantrax/sync-scores", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ gameweek: targetGameweek, positionOrGroup }),
    });

    return (await response.json()) as FantraxSyncResponse;
  }

  async function handleSyncAllGameweeks() {
    const lastGameweek = currentGameweek ?? syncAllGameweek;
    if (!Number.isInteger(lastGameweek) || lastGameweek < 1) {
      setSyncAllSummary({
        totalPlayersSynced: 0,
        unmatchedFantraxIds: [],
        completed: 0,
        total: 0,
        currentStep: null,
        errors: ["Current gameweek is unavailable."],
      });
      return;
    }

    setIsSyncingAll(true);
    setSyncAllSummary({
      totalPlayersSynced: 0,
      unmatchedFantraxIds: [],
      completed: 0,
      total: lastGameweek,
      currentStep: "Starting...",
      errors: [],
    });

    const unmatchedIds = new Set<string>();
    const errors: string[] = [];
    let totalPlayersSynced = 0;
    let completed = 0;

    try {
      for (let gw = 1; gw <= lastGameweek; gw += 1) {
        for (const position of FANTRAX_POSITION_CARDS) {
          setSyncAllSummary({
            totalPlayersSynced,
            unmatchedFantraxIds: Array.from(unmatchedIds),
            completed,
            total: lastGameweek,
            currentStep: `GW ${gw}: ${position.positionLabel}`,
            errors: [...errors],
          });

          const data = await syncSingleGameweek(gw, position.positionOrGroup);

          if (!data.success) {
            errors.push(`GW ${gw} ${position.positionLabel}: ${data.message ?? "Sync failed."}`);
          } else {
            totalPlayersSynced += data.playersSynced ?? 0;
            (data.unmatchedFantraxIds ?? []).forEach((id) => unmatchedIds.add(id));
          }

          await wait(500);
        }

        completed = gw;
        setSyncAllSummary({
          totalPlayersSynced,
          unmatchedFantraxIds: Array.from(unmatchedIds),
          completed,
          total: lastGameweek,
          currentStep: `Completed GW ${gw}`,
          errors: [...errors],
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync all gameweeks failed.";
      errors.push(message);
      setSyncAllSummary({
        totalPlayersSynced,
        unmatchedFantraxIds: Array.from(unmatchedIds),
        completed,
        total: lastGameweek,
        currentStep: null,
        errors: [...errors],
      });
    } finally {
      setIsSyncingAll(false);
    }
  }

  const progressPercent =
    syncAllSummary && syncAllSummary.total > 0
      ? Math.round((syncAllSummary.completed / syncAllSummary.total) * 100)
      : 0;

  return (
    <section className="rounded-xl border border-brand-green/40 bg-brand-green/10 p-6">
      <h2 className="text-xl font-bold text-brand-cream">Fantrax API Score Sync</h2>
      <p className="mt-2 text-sm text-brand-creamDark">
        Sync each position independently into `player_gameweeks`, or run all positions for every gameweek up to the current one.
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {FANTRAX_POSITION_CARDS.map((card) => (
          <PositionSyncCard
            key={card.positionOrGroup}
            buttonLabel={card.buttonLabel}
            positionLabel={card.positionLabel}
            positionOrGroup={card.positionOrGroup}
            defaultGameweek={currentGameweek ?? 1}
            currentGameweek={currentGameweek}
            isLoadingCurrentGw={isLoadingCurrentGw}
            onSync={syncSingleGameweek}
          />
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-brand-cream/20 bg-brand-dark/40 p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_auto] md:items-end">
          <label className="text-sm">
            <span className="mb-2 block font-semibold text-brand-creamDark">Sync All Through GW</span>
            <input
              type="number"
              min={1}
              max={38}
              value={syncAllGameweek}
              onChange={(event) => setSyncAllGameweek(Number(event.target.value))}
              className="w-full rounded-md border border-brand-cream/30 bg-brand-dark px-3 py-2 text-brand-cream"
            />
          </label>

          <button
            type="button"
            onClick={handleSyncAllGameweeks}
            disabled={isSyncingAll || isLoadingCurrentGw}
            className="rounded-md border border-brand-cream/30 bg-brand-dark px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60"
          >
            {isSyncingAll ? "Syncing All..." : "Sync All Gameweeks"}
          </button>
        </div>

        <p className="mt-3 text-xs text-brand-creamDark">
          {isLoadingCurrentGw
            ? "Loading current gameweek..."
            : currentGwError
              ? currentGwError
              : `Current gameweek: ${currentGameweek ?? "Unavailable"}`}
        </p>

        {isSyncingAll && syncAllSummary ? (
          <div className="mt-5 rounded-lg border border-brand-cream/20 bg-brand-dark/70 p-4">
            <p className="text-sm font-semibold text-brand-cream">{syncAllSummary.currentStep ?? "Running..."}</p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-brand-cream/15">
              <div
                className="h-full rounded-full bg-brand-greenLight transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-brand-creamDark">{progressPercent}% complete</p>
          </div>
        ) : null}

        {syncAllSummary ? (
          <div
            className={`mt-5 rounded-lg border p-4 text-sm ${
              syncAllSummary.errors.length === 0 ? "border-green-400/50 bg-green-950/25" : "border-red-400/50 bg-red-950/25"
            }`}
          >
            <p className="font-semibold">
              {isSyncingAll ? "In progress" : "Summary"}: {syncAllSummary.completed}/{syncAllSummary.total} gameweeks processed.
            </p>
            <p className="mt-2">Total players synced: {syncAllSummary.totalPlayersSynced}</p>
            <p className="mt-2">
              Unmatched Fantrax IDs: {syncAllSummary.unmatchedFantraxIds.join(", ") || "None"}
            </p>
            {syncAllSummary.errors.length > 0 ? (
              <ul className="mt-2 list-disc pl-5">
                {syncAllSummary.errors.map((error, index) => (
                  <li key={`${error}-${index}`}>{error}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function UploadClient() {
  return (
    <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-3xl font-black sm:text-4xl">Admin Data Upload</h1>
        <p className="text-sm text-brand-creamDark">
          Sync Fantrax API scores by position or upload weekly player and keeper Fantrax CSV dumps.
        </p>

        <FantraxSyncPanel />
        <CsvUploadCard title="Upload Player Dump" type="player" />
        <CsvUploadCard title="Upload Keeper Dump" type="keeper" />
      </div>
    </div>
  );
}
