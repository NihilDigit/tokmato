import { createHash } from "node:crypto";

/**
 * Field name for an FCM token in the per-user Hash. Same shape as
 * `endpointField` for web-push subs — sha1 truncated to 16 hex chars.
 *
 * Lives outside `app/actions/push.ts` because that file is a Server
 * Actions module ("use server") and its exports must all be async.
 * Multiple action modules need this helper, so it lives here.
 */
export function fcmTokenField(token: string): string {
  return createHash("sha1").update(token).digest("hex").slice(0, 16);
}
