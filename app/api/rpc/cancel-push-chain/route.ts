import { NextResponse } from "next/server";
import { cancelPushChain } from "@/app/actions/push";
import { withRpc } from "../_lib";

export async function POST(): Promise<NextResponse> {
  return withRpc(
    () => cancelPushChain(),
    (data) => NextResponse.json(data),
  );
}
