// Service Worker: adds ngrok-skip-browser-warning header to all requests
// so the ngrok interstitial page never appears after SW is installed.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only modify requests to the same origin (our ngrok domain)
  if (url.origin === self.location.origin) {
    const newHeaders = new Headers(event.request.headers);
    newHeaders.set("ngrok-skip-browser-warning", "1");

    const modifiedRequest = new Request(event.request, {
      headers: newHeaders,
    });

    event.respondWith(fetch(modifiedRequest));
  }
});
