
const CACHE_NAME = "media-rwanda-pwa-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Do not cache uploads, videos, API data, or user-specific responses.
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin ||
    new URL(request.url).pathname.startsWith("/api/") ||
    new URL(request.url).pathname.startsWith("/uploads/")
  ) {
    return;
  }

  // Use the network normally. Do not save media or API responses offline.
});
