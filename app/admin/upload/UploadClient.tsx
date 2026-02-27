"use client";

import Papa from "papaparse";
import { useMemo, useState } from "react";

type UploadType = "player" | "keeper";

type UploadResult = {
  success: boolean;
  rowsProcessed: number;
  errors: string[];
};

type PreviewRow = Record<string, string>;

type CsvUploadCardProps = {
  title: string;
  type: UploadType;
};

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

export default function UploadClient() {
  return (
    <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-3xl font-black sm:text-4xl">Admin Data Upload</h1>
        <p className="text-sm text-brand-creamDark">Upload weekly player and keeper Fantrax CSV dumps.</p>

        <CsvUploadCard title="Upload Player Dump" type="player" />
        <CsvUploadCard title="Upload Keeper Dump" type="keeper" />
      </div>
    </div>
  );
}
