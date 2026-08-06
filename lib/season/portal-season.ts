import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentSeason } from "@/lib/season/current";

type SeasonResolution = {
  availableSeasons: string[];
  season: string;
};

export async function resolvePortalSeason(
  supabase: SupabaseClient,
  requestedSeason?: string
): Promise<SeasonResolution> {
  const { data: availableSeasonsData, error: availableSeasonsError } = await supabase
    .from("seasons")
    .select("id")
    .order("id", { ascending: false });

  if (availableSeasonsError) {
    throw new Error(`Unable to load seasons: ${availableSeasonsError.message}`);
  }

  const availableSeasons = (availableSeasonsData ?? []).map((season) => season.id as string);
  if (availableSeasons.length === 0) {
    throw new Error("No seasons are available in the seasons table.");
  }

  if (requestedSeason && availableSeasons.includes(requestedSeason)) {
    return { availableSeasons, season: requestedSeason };
  }

  try {
    const currentSeason = await getCurrentSeason(supabase);
    if (availableSeasons.includes(currentSeason)) {
      return { availableSeasons, season: currentSeason };
    }
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "No season is marked as current in the seasons table.") {
      throw error;
    }
  }

  return { availableSeasons, season: availableSeasons[0] };
}
