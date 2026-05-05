import { NextResponse } from "next/server";
import { setActiveSession } from "@/app/actions/active-session";
import { readJson, withRpc } from "../_lib";

type Args = Parameters<typeof setActiveSession>[0];

export async function POST(req: Request): Promise<NextResponse> {
  return withRpc(
    async () => {
      const body = await readJson<Args>(req);
      return setActiveSession(body);
    },
    (data) => NextResponse.json(data),
  );
}
