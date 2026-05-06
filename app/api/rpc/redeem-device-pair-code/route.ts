import { NextResponse } from "next/server";
import { redeemDevicePairCode } from "@/app/actions/relay-pair";
import { readJson, withRpc } from "../_lib";

/**
 * Relay-only endpoint. No session/auth — the relay APK sends the 4-digit
 * code minted by /api/rpc/create-device-pair-code along with its FCM
 * token. Server resolves the userId from the code, writes the token to
 * the user's `kvKey.fcmTokens` Hash, and returns `sub` so the relay can
 * persist its own bound-user identity.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return withRpc(
    async () => {
      const body = await readJson<{ code: string; fcmToken: string }>(req);
      return redeemDevicePairCode(body);
    },
    (data) => NextResponse.json(data),
  );
}
