// Service Worker: app files-ஐ phone-ல் cache செய்கிறது (offline-ல் app திறக்க).
// Gemini API calls cache செய்யப்படுவதில்லை.
const CACHE = "jarvis-v5";
const FILES = [
  "./", "./index.html", "./style.css", "./manifest.json",
  "./config.js", "./storage.js", "./security.js", "./biometric.js", "./gemini.js",
  "./chat.js", "./dashboard.js", "./memory.js", "./voice.js", "./vault.js", "./app.js",
  "./icon-192.png", "./icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // external (Gemini) -> network only
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
