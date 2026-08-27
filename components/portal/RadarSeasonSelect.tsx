"use client";

import { usePathname, useRouter } from "next/navigation";

type RadarSeasonSelectProps = {
  season: string;
  availableSeasons: string[];
  paramName: string;
};

export default function RadarSeasonSelect({ season, availableSeasons, paramName }: RadarSeasonSelectProps) {
  const router = useRouter();
  const pathname = usePathname();

  if (availableSeasons.length <= 1) {
    return null;
  }

  function selectSeason(nextSeason: string) {
    const params = new URLSearchParams(window.location.search);
    params.set(paramName, nextSeason);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={`${paramName}-select`} className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        Season
      </label>
      <select
        id={`${paramName}-select`}
        value={season}
        onChange={(event) => selectSeason(event.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-brand-dark focus:border-brand-green focus:outline-none"
      >
        {availableSeasons.map((availableSeason) => (
          <option key={availableSeason} value={availableSeason}>
            {availableSeason}
          </option>
        ))}
      </select>
    </div>
  );
}
