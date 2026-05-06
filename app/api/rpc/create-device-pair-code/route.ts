import { NextResponse } from "next/server";
import { createDevicePairCode } from "@/app/actions/relay-pair";
import { withRpc } from "../_lib";

/**
 * Web-only endpoint. The signed-in user calls this from Settings to
 * mint a 4-digit pair code; the relay APK consumes it via
 * /api/rpc/redeem-device-pair-code. No body required.
 */
export async function POST(): Promise<NextResponse> {
  return withRpc(
    () => createDevicePairCode(),
    (data) => NextResponse.json(data),
  );
}
