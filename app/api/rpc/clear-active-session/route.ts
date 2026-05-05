import { NextResponse } from "next/server";
import { clearActiveSession } from "@/app/actions/active-session";
import { withRpc } from "../_lib";

export async function POST(): Promise<NextResponse> {
  return withRpc(
    () => clearActiveSession(),
    (data) => NextResponse.json(data),
  );
}
