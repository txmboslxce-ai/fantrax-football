import type { SupabaseClient } from "@supabase/supabase-js";

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Set it in .env.local for local dev or in your Vercel project's environment variables.`);
  }

  return value;
}

export function getFantraxLeagueId(): string {
  return getRequiredEnv("FANTRAX_LEAGUE_ID");
}

export async function getFantraxLeagueIdForSeason(supabase: SupabaseClient, season: string): Promise<string> {
  const { data, error } = await supabase
    .from("seasons")
    .select("fantrax_league_id")
    .eq("id", season)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to resolve Fantrax league ID for ${season}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Cannot resolve Fantrax league ID: season ${season} does not exist.`);
  }

  const seasonLeagueId = data.fantrax_league_id?.trim();
  if (seasonLeagueId) {
    return seasonLeagueId;
  }

  const fallbackLeagueId = getFantraxLeagueId();
  console.warn(
    `[fantrax/sync-scores] Season ${season} has no fantrax_league_id; falling back to FANTRAX_LEAGUE_ID (suffix ${fallbackLeagueId.slice(-4)}). Configure seasons.fantrax_league_id to prevent this fallback.`
  );
  return fallbackLeagueId;
}

export async function getFantraxSeasonProjectionCodeForSeason(supabase: SupabaseClient, season: string): Promise<string> {
  const { data, error } = await supabase
    .from("seasons")
    .select("fantrax_season_projection_code")
    .eq("id", season)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to resolve Fantrax season projection code for ${season}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Cannot resolve Fantrax season projection code: season ${season} does not exist.`);
  }

  const projectionCode = data.fantrax_season_projection_code?.trim();
  if (!projectionCode) {
    throw new Error(`Fantrax season projection code is not configured for ${season}.`);
  }

  return projectionCode;
}
