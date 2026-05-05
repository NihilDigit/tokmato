import { NextResponse } from "next/server";
import { saveToCloud } from "@/app/actions/sync";
import { readJson, withRpc } from "../_lib";

export async function POST(req: Request): Promise<NextResponse> {
  return withRpc(
    async () => {
      const body = await readJson<{ snapshot: unknown }>(req);
      return saveToCloud(body.snapshot);
    },
    (data) => NextResponse.json(data),
  );
}
