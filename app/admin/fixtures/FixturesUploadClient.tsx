"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

type UploadResult = {
  success: boolean;
  rowsProcessed: number;
  errors: string[];
};

type FixtureRow = {
  gameweek: number;
  home_team: string;
  away_team: string;
};

function getCellValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return String(record[key]).trim();
    }
  }
  return "";
}

export default function FixturesUploadClient() {
  const [file, setFile] = useState<File | null>(null);
  const [season, setSeason] = useState("2024-25");
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function handleUpload() {
    if (!file) {
      setResult({ success: false, rowsProcessed: 0, errors: ["Please choose an XLSX file."] });
      return;
    }

    setIsUploading(true);
    setResult(null);

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });

    const fixtures: FixtureRow[] = rows
      .map((row) => ({
        gameweek: Number(getCellValue(row, ["GW", "Gameweek", "gameweek"])),
        home_team: getCellValue(row, ["Home", "home_team", "Home Team", "home"]),
        away_team: getCellValue(row, ["Away", "away_team", "Away Team", "away"]),
      }))
      .filter((row) => row.gameweek >= 1 && row.gameweek <= 38 && row.home_team && row.away_team);

    const response = await fetch("/api/admin/fixtures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ season, rows: fixtures }),
    });

    const data = (await response.json()) as UploadResult;
    setResult(data);
    setIsUploading(false);
  }

  return (
    <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-xl border border-brand-green/40 bg-brand-green/10 p-6">
        <h1 className="text-3xl font-black">Upload Fixtures</h1>
        <p className="mt-2 text-sm text-brand-creamDark">Upload your FixtureKey XLSX once per season.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-2 block font-semibold text-brand-creamDark">FixtureKey XLSX</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="w-full rounded-md border border-brand-cream/30 bg-brand-dark px-3 py-2"
            />
          </label>

          <label className="text-sm">
            <span className="mb-2 block font-semibold text-brand-creamDark">Season</span>
            <input
              value={season}
              onChange={(event) => setSeason(event.target.value)}
              className="w-full rounded-md border border-brand-cream/30 bg-brand-dark px-3 py-2"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={handleUpload}
          disabled={isUploading}
          className="mt-5 rounded-md bg-brand-green px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60"
        >
          {isUploading ? "Uploading..." : "Upload Fixtures"}
        </button>

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
      </div>
    </div>
  );
}
