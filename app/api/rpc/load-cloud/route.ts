import { NextResponse } from "next/server";
import { loadFromCloud } from "@/app/actions/sync";
import { withRpc } from "../_lib";

export async function GET(): Promise<NextResponse> {
  return withRpc(
    () => loadFromCloud(),
    (data) => NextResponse.json({ ok: true, data }),
  );
}
