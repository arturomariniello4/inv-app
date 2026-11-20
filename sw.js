// Service worker: receives encrypted pushes, keeps them on the phone, shows a notification.
// v2: new INV logo icons (2026-11-19)
// v3: company logos in the Ideas list, kept on the phone after the first view so they also show offline
// v4: the notification always shows, even if saving a part fails (iOS stops pushes to an app that skips one)
// v5: a long report arrives as ONE push with a key; its content is fetched from an encrypted box and opened here
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

// A boxed message: the push carries box = {u: address, k: AES-256-GCM key, n: nonce}; the box holds the
// whole message, gzipped then encrypted. Only ciphertext sits at the public address.
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function openBox(box) {
  const res = await fetch(box.u, { cache: "no-store" });
  if (!res.ok) throw new Error("box " + res.status);
  const key = await crypto.subtle.importKey("raw", unb64(box.k), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.n) }, key, await res.arrayBuffer());
  return new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).json();
}

async function getMessage(id) {
  const db = await openDb();
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function receiveBox(msg) {
  try {
    await save(await openBox(msg.box));
  } catch (err) {                       // offline or not there yet: keep a note and try again when the app opens
    const had = await getMessage(msg.id);
    if (!had || had.waiting) await save({ ...msg, waiting: true });
  }
}

async function openWaiting() {
  const db = await openDb();
  const all = await new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
  let opened = 0;
  for (const m of all.filter((x) => x.waiting && x.box)) {
    try { await save(await openBox(m.box)); opened++; } catch (_) {}
  }
  return opened;
}

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "open-waiting") return;
  event.waitUntil((async () => {
    if (await openWaiting()) (await self.clients.matchAll({ type: "window" })).forEach((c) => c.postMessage({ type: "new-message" }));
  })());
});

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
    if (msg.box) {                      // one push for the whole report: show it first, then open the box
      await self.registration.showNotification(msg.title || "INV", {
        body: msg.body || "", tag: msg.tag || msg.id, data: { id: msg.id }, icon: "icon-192.png?v=2" });
      await receiveBox(msg);
      (await self.clients.matchAll({ type: "window" })).forEach((c) => c.postMessage({ type: "new-message" }));
      return;
    }
    try {
      if (msg.parts) {
        const whole = await addPart(msg);
        if (whole) await save(whole);
      } else {
        await save(msg);
      }
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.postMessage({ type: "new-message" }));
    } catch (err) {
      console.error("INV: could not save a push", err);   // the notification below must still show
    }
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
