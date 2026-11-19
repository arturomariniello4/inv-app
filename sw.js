// Service worker: receives encrypted pushes, keeps them on the phone, shows a notification.
// v2: new INV logo icons (2026-11-19)
// v3: company logos in the Ideas list, kept on the phone after the first view so they also show offline
const DB = "inv", STORE = "messages", PARTS = "parts";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PARTS)) db.createObjectStore(PARTS, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// The day's ideas arrive gzipped as base64 in "z"; unpack them into doc before saving.
async function unpack(msg) {
  if (!msg.z) return msg;
  const bytes = Uint8Array.from(atob(msg.z), (c) => c.charCodeAt(0));
  const doc = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json();
  const { z, ...rest } = msg;
  return { ...rest, doc };
}

async function save(msg) {
  msg = await unpack(msg);
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...msg, received: new Date().toISOString() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// A long message (the briefing, the weekly report) arrives in several pushes; put them back together.
async function addPart(msg) {
  const db = await openDb();
  const tx = db.transaction(PARTS, "readwrite");
  const store = tx.objectStore(PARTS);
  store.put({ key: msg.id + "#" + msg.part, id: msg.id, part: msg.part, chunk: msg.chunk });
  const all = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.filter((p) => p.id === msg.id));
    req.onerror = () => reject(req.error);
  });
  if (all.length < msg.parts) return null;
  all.sort((a, b) => a.part - b.part).forEach((p) => store.delete(p.key));
  return JSON.parse(all.map((p) => p.chunk).join(""));
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Company logos (bundled with the app, same address): cache first, so they show offline and load instantly.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !/\/logos\/[^/]+\.(png|svg|jpg|gif|ico|webp)$/.test(url.pathname)) return;
  event.respondWith(caches.open("inv-logos-v1").then(async (cache) => {
    const hit = await cache.match(event.request);
    if (hit) return hit;
    const res = await fetch(event.request);
    if (res.ok) cache.put(event.request, res.clone());
    return res;
  }));
});

self.addEventListener("push", (event) => {
  let msg;
  try { msg = event.data.json(); } catch (_) { msg = { id: "msg:" + Date.now(), kind: "alert", title: "INV", body: event.data ? event.data.text() : "", text: "" }; }
  event.waitUntil((async () => {
    if (msg.parts) {
      const whole = await addPart(msg);
      if (whole) await save(whole);
    } else {
      await save(msg);
    }
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((c) => c.postMessage({ type: "new-message" }));
    await self.registration.showNotification(msg.title || "INV", {
      body: msg.body || "",
      tag: msg.tag || msg.id,   // the parts of one message replace each other; the day's ideas share the briefing's
      data: { id: msg.id },
      icon: "icon-192.png?v=2",
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = "./#" + encodeURIComponent(event.notification.data.id);
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (clients.length) { await clients[0].focus(); clients[0].postMessage({ type: "open", id: event.notification.data.id }); return; }
    await self.clients.openWindow(target);
  })());
});
