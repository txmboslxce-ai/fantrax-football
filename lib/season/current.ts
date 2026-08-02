import type { SupabaseClient } from "@supabase/supabase-js";

export async function getCurrentSeason(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load current season: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error("No season is marked as current in the seasons table.");
  }

  return data.id as string;
}
