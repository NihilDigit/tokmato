import { NextResponse } from "next/server";
import { saveFcmToken } from "@/app/actions/push";
import { readJson, withRpc } from "../_lib";

export async function POST(req: Request): Promise<NextResponse> {
  return withRpc(
    async () => {
      const body = await readJson<{ token: string }>(req);
      return saveFcmToken(body.token);
    },
    (data) => NextResponse.json(data),
  );
}
