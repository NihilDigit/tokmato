import { NextResponse } from "next/server";
import { startPushChain } from "@/app/actions/push";
import { readJson, withRpc } from "../_lib";

type StartArgs = Parameters<typeof startPushChain>[0];

export async function POST(req: Request): Promise<NextResponse> {
  return withRpc(
    async () => {
      const body = await readJson<StartArgs>(req);
      return startPushChain(body);
    },
    (data) => NextResponse.json(data),
  );
}
