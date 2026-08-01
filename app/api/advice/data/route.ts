import { NextResponse } from "next/server";
import { getAdviceData } from "@/app/portal/advice/getAdviceData";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getAdviceData();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load advice data.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
