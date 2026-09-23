import { NextResponse } from "next/server";

const NO_STORE = { "cache-control": "private, no-store" };

// Proves only that the Next.js process can respond - no external dependency checks (Redis,
// Backend V2, or anything else). A Redis outage must never make liveness fail; that's what
// /health/ready is for (see route.ts alongside this file).
export function GET(): NextResponse {
  return NextResponse.json(
    { status: "ok" },
    { status: 200, headers: NO_STORE },
  );
}
