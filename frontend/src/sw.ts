/// <reference lib="webworker" />
// Katei service worker (vite-plugin-pwa injectManifest). Precaches the shell,
// serves the SPA offline, and handles Web Push reminders + notification clicks.
// Excluded from the app tsconfig; bundled by vite-plugin-pwa.

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
clientsClaim();

// Precache the built assets, then fall back to the SPA shell for navigations
// (but never for API requests).
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api/] }));

// A reminder arrived — show it on the lock screen.
self.addEventListener('push', (event: PushEvent) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }
  const title = data.title || 'Katei';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      // icon is the large full-colour image in the notification body, so the
      // opaque app icon is right there.
      icon: '/pwa-192.png',
      // badge is the status-bar icon, and Android builds it from the alpha
      // channel alone — colour discarded, silhouette tinted flat white. The
      // app icon has no alpha channel at all, so pointing badge at it drew a
      // solid white square. badge-96.png is a transparent monochrome mark.
      badge: '/badge-96.png',
      data: { url: data.url || '/' },
    }),
  );
});

// Tapping the notification focuses an open tab or opens the app at the target.
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
