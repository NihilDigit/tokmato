import { NextResponse } from "next/server";
import { savePushSubscription } from "@/app/actions/push";
import { readJson, withRpc } from "../_lib";

export async function POST(req: Request): Promise<NextResponse> {
  return withRpc(
    async () => {
      const body = await readJson<unknown>(req);
      return savePushSubscription(body);
    },
    (data) => NextResponse.json(data),
  );
}
