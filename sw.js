// Service worker: receives encrypted pushes, keeps them on the phone, shows a notification.
const DB = "inv", STORE = "messages";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function save(msg) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...msg, received: new Date().toISOString() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg;
  try { msg = event.data.json(); } catch (_) { msg = { id: "msg:" + Date.now(), kind: "alert", title: "INV", body: event.data ? event.data.text() : "", text: "" }; }
  event.waitUntil((async () => {
    await save(msg);
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((c) => c.postMessage({ type: "new-message" }));
    await self.registration.showNotification(msg.title || "INV", {
      body: msg.body || "",
      tag: msg.id,
      data: { id: msg.id },
      icon: "icon-192.png",
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
