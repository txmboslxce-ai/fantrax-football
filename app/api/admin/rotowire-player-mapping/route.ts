import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getRotowireMatchingReport } from "@/lib/rotowire/sync";

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdminEmail(user.email)) {
    return { ok: false as const };
  }

  return { ok: true as const };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await getRotowireMatchingReport();
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compute RotoWire player matches";
    return NextResponse.json({ message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminSupabaseClient();
  if (!db) {
    return NextResponse.json({ message: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  let body: { playerId?: unknown; rotowireId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const playerId = body.playerId;
  const rotowireId = body.rotowireId;

  if (typeof playerId !== "string" || !playerId || typeof rotowireId !== "number" || !Number.isInteger(rotowireId)) {
    return NextResponse.json({ message: "Missing or invalid playerId/rotowireId" }, { status: 400 });
  }

  const { data: existingForRotowireId, error: existingError } = await db
    .from("players")
    .select("id, name")
    .eq("rotowire_id", rotowireId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ message: existingError.message }, { status: 500 });
  }

  if (existingForRotowireId) {
    return NextResponse.json({ message: `rotowire_id ${rotowireId} is already mapped to ${existingForRotowireId.name}` }, { status: 409 });
  }

  const { error: updateError } = await db.from("players").update({ rotowire_id: rotowireId }).eq("id", playerId);

  if (updateError) {
    return NextResponse.json({ message: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
