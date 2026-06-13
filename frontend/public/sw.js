/* Pizza Denfert · Web Push service worker
 * Receives push events while the page is closed and routes taps. */
self.addEventListener("install", (event) => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  let payload = { title: "Pizza Denfert", body: "" };
  try { if (event.data) payload = event.data.json(); } catch (e) {
    try { payload.body = event.data.text(); } catch {}
  }
  const title = payload.title || "Pizza Denfert";
  const options = {
    body: payload.body || "",
    icon: "/icon.png",
    badge: "/favicon.ico",
    tag: payload.tag || "denfert",
    data: { url: payload.url || "/", ...payload },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) {
      if ("focus" in c) {
        c.focus();
        if ("navigate" in c) c.navigate(url);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
