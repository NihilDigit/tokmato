// tokmato service worker — handles Web Push delivery.
//
// QStash → /api/push/fire → web-push (VAPID) → push provider → here.
// We only do two things: render the notification, and focus the app
// when the user clicks it. Everything else (timers, scheduling) is
// either client-side wall-clock or server-side QStash.

self.addEventListener("install", (event) => {
  // Take over old SWs immediately so a hot-deployed version starts
  // delivering pushes without a manual reload.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "tokmato", body: "" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to text body.
    try {
      payload.body = event.data ? event.data.text() : "";
    } catch {}
  }
  const { title, body, tag } = payload;
  event.waitUntil(
    self.registration.showNotification(title || "tokmato", {
      body: body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      // tag collapses successive notifications onto the same slot so
      // a backgrounded user with three boundary alerts sees one, not
      // a stack. Caller can override.
      tag: tag || "tokmato-pomodoro",
      // Re-vibrate / re-alert when a same-tag push lands.
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = "/home";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Prefer focusing an existing tokmato tab over opening a new one.
      for (const client of allClients) {
        if ("focus" in client) {
          try {
            await client.focus();
            if ("navigate" in client) await client.navigate(target);
            return;
          } catch {}
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })()
  );
});
