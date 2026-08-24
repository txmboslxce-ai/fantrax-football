import type { SupabaseClient } from "@supabase/supabase-js";

export async function isWriter(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("is_writer")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_writer === true;
}
