import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function isPremiumUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("profiles").select("is_premium").eq("id", userId).maybeSingle();

  if (error || !data) {
    return false;
  }

  return Boolean(data.is_premium);
}
