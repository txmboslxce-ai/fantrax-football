import { NextResponse } from "next/server";
import { syncFplPlayerData, syncFixtures } from "@/lib/fpl/sync";

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

async function handleSync(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [playerResult, fixturesResult] = await Promise.all([syncFplPlayerData(),
      // TEMP disabled — FPL was writing 2026-27 fixtures into 2025-26; re-enable after season-pointer fix.
      // syncFixtures()
    ]);
    return NextResponse.json({ success: true, ...playerResult, fixtures: fixturesResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync FPL data.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleSync(request);
}

export async function POST(request: Request) {
  return handleSync(request);
}
