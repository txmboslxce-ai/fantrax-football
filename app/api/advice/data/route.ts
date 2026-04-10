import { NextResponse } from "next/server";
import { getAdviceData } from "@/app/portal/advice/getAdviceData";

export async function GET() {
  try {
    const data = await getAdviceData();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load advice data.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
