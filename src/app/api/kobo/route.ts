import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** USB device scanning needs a locally attached Kobo — not reachable from a hosted deployment. */
function unavailable() {
  return NextResponse.json({ available: false, reason: "not available when hosted" }, { status: 501 });
}

export async function GET() {
  return unavailable();
}

export async function POST() {
  return unavailable();
}
