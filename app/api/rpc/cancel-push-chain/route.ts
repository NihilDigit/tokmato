import { NextResponse } from "next/server";
import { cancelPushChain } from "@/app/actions/push";
import { withRpc } from "../_lib";

export async function POST(request: Request): Promise<NextResponse> {
  let scope: "pomodoro" | "play" | "all" | undefined;
  try {
    const body = await request.json();
    if (
      body?.scope === "pomodoro" ||
      body?.scope === "play" ||
      body?.scope === "all"
    ) {
      scope = body.scope;
    }
  } catch {
    // Old clients send an empty POST; default stays pomodoro.
  }
  return withRpc(
    () => cancelPushChain(scope),
    (data) => NextResponse.json(data),
  );
}
