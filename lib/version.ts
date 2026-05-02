// Injected at build time. Production deploys come from a `v*` git tag
// pushed to GitHub; the release workflow exports
// `NEXT_PUBLIC_APP_VERSION=${tag}` before `vercel build` so this string
// matches the tag that triggered the deploy. Local `bun run build`
// without the env shows "dev".
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
