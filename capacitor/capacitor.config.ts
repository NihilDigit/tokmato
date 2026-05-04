import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.nihildigit.tokmato",
  appName: "tokmato",
  webDir: "web",
  // Thin-shell strategy: Capacitor's WebView loads the deployed
  // Next.js app directly. We don't bundle any of the Next.js output;
  // the only role of this APK is to expose native FCM (priority:high)
  // alongside the existing web codebase, dodging Doze on locked
  // Android screens that Web Push cannot escape.
  server: {
    url: "https://tokmato.nihildigit.dev",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    // Allow mixed content / cleartext — disabled. We only ever talk
    // to the canonical https domain.
    allowMixedContent: false,
  },
};

export default config;
