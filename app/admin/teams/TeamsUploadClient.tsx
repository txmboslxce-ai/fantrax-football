"use client";

import { useState } from "react";

type UploadResult = {
  success: boolean;
  rowsProcessed: number;
  errors: string[];
};

export default function TeamsUploadClient() {
  const [file, setFile] = useState<File | null>(null);
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

    const response = await fetch("/api/admin/teams", {
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
        <h1 className="text-3xl font-black">Upload Teams</h1>
        <p className="mt-2 text-sm text-brand-creamDark">Upload your TeamMap XLSX to update club abbreviations and names.</p>

        <label className="mt-6 block text-sm">
          <span className="mb-2 block font-semibold text-brand-creamDark">TeamMap XLSX</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="w-full rounded-md border border-brand-cream/30 bg-brand-dark px-3 py-2"
          />
        </label>

        <button
          type="button"
          onClick={handleUpload}
          disabled={isUploading}
          className="mt-5 rounded-md bg-brand-green px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60"
        >
          {isUploading ? "Uploading..." : "Upload Teams"}
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
