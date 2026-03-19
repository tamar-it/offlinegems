const CACHE_VERSION = "offline-games-v8";
const CORE_ASSETS = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./gem-icon.svg",
    "./bubble-preview.png",
    "./missile-shooter.png",
    "./missile-defense.png",
    "./popcorn-preview.png",
    "./invaders-crusher-preview.png"
];

async function discoverHubAssets() {
    try {
        const response = await fetch("./index.html", { cache: "no-cache" });
        if (!response.ok) return [];

        const html = await response.text();
        const discovered = new Set();
        const linkPattern = /(href|src)="([^"]+)"/g;
        let match = null;

        while ((match = linkPattern.exec(html)) !== null) {
            const value = match[2];
            if (!value || value.startsWith("http") || value.startsWith("data:") || value.startsWith("#")) {
                continue;
            }
            if (value.endsWith(".html") || value.endsWith(".png") || value.endsWith(".svg") || value.endsWith(".webmanifest")) {
                discovered.add(value.startsWith("./") ? value : `./${value}`);
            }
        }

        return Array.from(discovered);
    } catch (_error) {
        return [];
    }
}

async function cacheCoreAssets() {
    const cache = await caches.open(CACHE_VERSION);
    const dynamicAssets = await discoverHubAssets();
    const installAssets = Array.from(new Set([...CORE_ASSETS, ...dynamicAssets]));

    await Promise.all(installAssets.map(async asset => {
        try {
            const response = await fetch(asset, { cache: "no-cache" });
            if (response.ok) {
                await cache.put(asset, response);
            }
        } catch (_error) {
        }
    }));
}

function shouldCacheRuntime(request, response) {
    if (!response || response.status !== 200 || response.type !== "basic") return false;
    const url = new URL(request.url);
    if (request.mode === "navigate") return true;
    if (url.pathname.endsWith(".html")) return true;
    if (url.pathname.endsWith(".png") || url.pathname.endsWith(".svg")) return true;
    if (url.pathname.endsWith(".webmanifest")) return true;
    return false;
}

async function networkThenCache(request) {
    const cache = await caches.open(CACHE_VERSION);
    try {
        const response = await fetch(request);
        if (shouldCacheRuntime(request, response)) {
            await cache.put(request, response.clone());
        }
        return response;
    } catch (_error) {
        const cached = await cache.match(request);
        if (cached) return cached;

        if (request.mode === "navigate") {
            const fallback = await cache.match("./index.html");
            if (fallback) return fallback;
        }
        throw _error;
    }
}

self.addEventListener("install", event => {
    event.waitUntil(cacheCoreAssets());
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(networkThenCache(request));
});

self.addEventListener("message", event => {
    if (!event.data || event.data.type !== "SKIP_WAITING") return;
    self.skipWaiting();
});
