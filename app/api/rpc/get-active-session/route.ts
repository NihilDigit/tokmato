import { NextResponse } from "next/server";
import { getActiveSession } from "@/app/actions/active-session";
import { withRpc } from "../_lib";

export async function GET(): Promise<NextResponse> {
  return withRpc(
    () => getActiveSession(),
    (data) => NextResponse.json({ ok: true, data }),
  );
}
