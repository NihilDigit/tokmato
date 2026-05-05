import { NextResponse } from "next/server";
import { removePushSubscription } from "@/app/actions/push";
import { readJson, withRpc } from "../_lib";

export async function POST(req: Request): Promise<NextResponse> {
  return withRpc(
    async () => {
      const body = await readJson<{ endpoint?: string }>(req).catch(
        () => ({ endpoint: undefined }) as { endpoint?: string },
      );
      return removePushSubscription(body.endpoint);
    },
    (data) => NextResponse.json(data),
  );
}
