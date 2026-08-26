import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json({ success: false, message: "SUPABASE_SERVICE_ROLE_KEY is required to post updates." }, { status: 500 });
  }

  let body: { title?: unknown; body?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const updateBody = typeof body.body === "string" ? body.body.trim() : "";

  if (!title || !updateBody) {
    return NextResponse.json({ success: false, message: "Both a title and a description are required." }, { status: 400 });
  }

  const { data, error } = await admin.from("product_updates").insert({ title, body: updateBody }).select("id, title, body, created_at").single();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, update: data });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json({ success: false, message: "SUPABASE_SERVICE_ROLE_KEY is required to delete updates." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ success: false, message: "An update id is required." }, { status: 400 });
  }

  const { error } = await admin.from("product_updates").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
