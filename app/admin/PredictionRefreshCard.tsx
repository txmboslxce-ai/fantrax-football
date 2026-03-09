"use client";

import { useState } from "react";

type GeneratePredictionsResponse = {
  success: boolean;
  predictionsGenerated?: number;
  message?: string;
};

export default function PredictionRefreshCard() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<GeneratePredictionsResponse | null>(null);

  async function handleRefresh() {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/predictions/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const data = (await response.json()) as GeneratePredictionsResponse;
      setResult(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Prediction refresh failed";
      setResult({ success: false, message });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-greenLight/40 bg-brand-green p-6">
      <h2 className="text-2xl font-bold text-brand-cream">Regenerate Predictions</h2>
      <p className="mt-2 text-sm text-brand-creamDark">
        Run the shared prediction generator manually for the next five gameweeks.
      </p>

      <div className="mt-5">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="rounded-md border border-brand-cream/25 bg-brand-dark px-4 py-2 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Regenerating..." : "Regenerate Predictions"}
        </button>
      </div>

      {result ? (
        <div
          className={`mt-4 rounded-lg border p-3 text-sm ${
            result.success ? "border-green-400/50 bg-green-950/25" : "border-red-400/50 bg-red-950/25"
          }`}
        >
          {result.success ? (
            <p>Generated {result.predictionsGenerated ?? 0} prediction rows.</p>
          ) : (
            <p>{result.message ?? "Prediction refresh failed."}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
