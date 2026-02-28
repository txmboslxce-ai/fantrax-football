"use client";

import { useState } from "react";

type UploadResult = {
  success: boolean;
  rowsProcessed: number;
  errors: string[];
};

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

    const formData = new FormData();
    formData.append("file", file);
    formData.append("season", season);

    const response = await fetch("/api/admin/fixtures", {
      method: "POST",
      body: formData,
    });

    const data = (await response.json()) as UploadResult;
    setResult(data);
    setIsUploading(false);
  }

  return (
    <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-xl border border-brand-green/40 bg-brand-green/10 p-6">
        <h1 className="text-3xl font-black">Upload Fixtures</h1>
        <p className="mt-2 text-sm text-brand-creamDark">
          Upload a FixtureKey XLSX with columns: Gameweek, Home, Away. Expected: 380 rows (10 fixtures x 38 gameweeks).
        </p>

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
