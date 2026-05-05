import { NextResponse } from "next/server";
import { removeFcmToken } from "@/app/actions/push";
import { readJson, withRpc } from "../_lib";

export async function POST(req: Request): Promise<NextResponse> {
  return withRpc(
    async () => {
      const body = await readJson<{ token?: string }>(req).catch(
        () => ({ token: undefined }) as { token?: string },
      );
      return removeFcmToken(body.token);
    },
    (data) => NextResponse.json(data),
  );
}
