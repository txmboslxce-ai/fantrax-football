// Pure types/helpers for radar profile data — no Supabase/server imports,
// so client components (e.g. CompareClient) can use these without pulling
// in server-only code (see lib/portal/summaryAdapters.ts, which does the
// actual Supabase fetching and re-exports these for server components).
export type RadarProfileKey = "fantasy" | "stats_total" | "stats_per90" | "goalkeeper";

export type RadarDatum = {
  stat: string;
  shortLabel?: string;
  rawValue: number;
  rank: number;
  percentile: number;
  value: number;
};

// Games Started is a count (no decimals); every other Fantasy stat is a
// points value (2 decimals). Stat totals and goalkeeper stats are whole
// counts; per-90 rates always show 2 decimals.
export function digitsForRadarStat(profile: RadarProfileKey, stat: string): number {
  if (profile === "fantasy") return stat === "Games Started" ? 0 : 2;
  if (profile === "stats_per90") return 2;
  return 0;
}
