// INV web app: lists alerts, briefings and weekly reports received by push, and
// sets up notifications. Everything stays on this phone (IndexedDB). It never trades.
const DB = "inv", STORE = "messages";
const $ = (id) => document.getElementById(id);

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains("parts")) db.createObjectStore("parts", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function allMessages() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => (b.received || "").localeCompare(a.received || "")));
    req.onerror = () => reject(req.error);
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Small Markdown subset: headings, bold, italics, links, lists, tables. Input is escaped first.
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])_(.+?)_(?=$|[\s.,)])/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
}

function render(md) {
  const out = [];
  let table = null, list = false;
  const flush = () => {
    if (table) { out.push("<table>" + table.join("") + "</table>"); table = null; }
    if (list) { out.push("</ul>"); list = false; }
  };
  for (const line of (md || "").split("\n")) {
    if (/^\|/.test(line)) {
      if (/^\|[-\s|]+\|$/.test(line)) continue;
      table = table || [];
      table.push("<tr>" + line.split("|").slice(1, -1).map((c) => "<td>" + inline(c.trim()) + "</td>").join("") + "</tr>");
      continue;
    }
    if (/^\s*- /.test(line)) {
      if (table) flush();
      if (!list) { out.push("<ul>"); list = true; }
      out.push("<li>" + inline(line.replace(/^\s*- /, "")) + "</li>");
      continue;
    }
    flush();
    const h = line.match(/^(#{1,3}) (.*)/);
    if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    else if (line.trim()) out.push("<p>" + inline(line) + "</p>");
  }
  flush();
  return out.join("\n");
}

const KIND = { alert: "Alert", briefing: "Evening briefing", weekly: "Weekly report" };

// The evening briefing, laid out like a newspaper: masthead, markets strip, lead story, sections.
function safeUrl(u) { return /^https:\/\//.test(u || "") ? u : "#"; }

function storyHtml(s, lead) {
  const links = (s.links || []).map(([label, url]) =>
    `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${esc(label)}</a>`).join(" · ");
  const cases = lead && s.up ? `<div class="np-case"><b class="up">Up case</b><span>${esc(s.up)}</span><b class="down">Down case</b><span>${esc(s.down)}</span></div>` : "";
  const tag = lead ? "h2" : "h3";
  return `<article class="${lead ? "np-lead" : "np-item"}">
    ${s.kicker ? `<div class="np-kicker">${esc(s.kicker)}</div>` : ""}
    <${tag}>${esc(s.headline)}</${tag}>
    ${s.standfirst ? `<p class="np-stand">${esc(s.standfirst)}</p>` : ""}
    ${cases}
    <div class="np-by">${esc(s.byline)}${links ? " · " + links : ""}</div>
  </article>`;
}

function renderBriefing(doc) {
  const markets = (doc.markets || []).length ? `<div class="np-ticker">${doc.markets.map((m) =>
    `<div><span>${esc(m.name)}</span><b>${esc(m.value)}</b><i class="${/^[-−]/.test(m.change) ? "down" : "up"}">${esc(m.change)}</i></div>`).join("")}</div>` : "";
  const sections = (doc.sections || []).map((sec) =>
    `<section class="np-sec"><h4>${esc(sec.title)}</h4>${sec.stories.map((s) => storyHtml(s, false)).join("")}</section>`).join("");
  const quiet = (doc.quiet || []).length ? `<section class="np-sec"><h4>Also checked</h4><ul class="np-quiet">${doc.quiet.map((q) =>
    `<li><b>${esc(q.title)}</b> ${esc(q.note)}</li>`).join("")}</ul></section>` : "";
  return `<div class="np">
    <header class="np-mast"><div class="np-mast-top"><span>${esc(doc.dateline)}</span><span>${esc(doc.time)} Luxembourg</span></div>
      <div class="np-name">INV</div><div class="np-sub">Your evening briefing</div></header>
    ${markets}
    ${doc.lead ? storyHtml(doc.lead, true) : '<p class="np-stand np-pad">A quiet day: nothing passed the importance threshold.</p>'}
    ${sections}${quiet}
    ${doc.later ? `<p class="np-note">${doc.later} more stories are saved for the Saturday report.</p>` : ""}
    ${doc.watchlist ? `<p class="np-note">${esc(doc.watchlist)}</p>` : ""}
    <p class="np-last">${esc(doc.last_line || "")}</p>
  </div>`;
}

async function showList() {
  $("reader").classList.add("hidden");
  $("back").classList.add("hidden");
  $("heading").textContent = "INV";
  const msgs = await allMessages();
  $("list").classList.remove("hidden");
  $("list").innerHTML = msgs.length ? msgs.map((m) => `
    <div class="card item" data-id="${esc(m.id)}">
      <div class="kind ${esc(m.kind)}">${esc(KIND[m.kind] || m.kind)} · ${esc((m.received || "").slice(0, 16).replace("T", " "))}</div>
      <div class="title">${esc(m.title)}</div>
      <div class="muted">${esc(m.body || "")}</div>
    </div>`).join("") : '<p class="muted">Nothing yet. Alerts, the 22:30 evening briefing and the Saturday report will appear here.</p>';
  document.querySelectorAll(".item").forEach((el) => el.addEventListener("click", () => open(el.dataset.id)));
}

async function open(id) {
  const m = (await allMessages()).find((x) => x.id === id);
  if (!m) return showList();
  $("list").classList.add("hidden");
  $("back").classList.remove("hidden");
  $("heading").textContent = KIND[m.kind] || "INV";
  $("reader").innerHTML = m.doc ? renderBriefing(m.doc) : render(m.text || m.body) +
    (m.url ? `<p><a href="${esc(m.url)}" target="_blank" rel="noopener">Open the source</a></p>` : "");
  $("reader").classList.toggle("paper", !!m.doc);
  $("reader").classList.remove("hidden");
  history.replaceState(null, "", "#" + encodeURIComponent(id));
}

function b64ToBytes(b64) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function setup() {
  const standalone = window.navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  const supported = "serviceWorker" in navigator && "PushManager" in window;
  const reg = supported ? await navigator.serviceWorker.register("sw.js") : null;
  const existing = reg ? await reg.pushManager.getSubscription() : null;
  if (existing && Notification.permission === "granted") return;
  $("setup").classList.remove("hidden");
  if (!standalone) {
    $("setup-text").textContent = "First add this page to your Home Screen: tap Share, then 'Add to Home Screen'. Open INV from the Home Screen and come back here.";
    $("subscribe").classList.add("hidden");
    return;
  }
  if (!supported) { $("setup-text").textContent = "This browser cannot receive web notifications."; $("subscribe").classList.add("hidden"); return; }
  $("setup-text").textContent = "Allow notifications so alerts, the 22:30 briefing and the Saturday report reach this phone.";
  $("subscribe").onclick = async () => {
    if ((await Notification.requestPermission()) !== "granted") { $("setup-text").textContent = "Notifications were not allowed. You can allow them in Settings, Notifications, INV."; return; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(window.INV_CONFIG.vapidPublicKey) });
    $("sub-json").value = JSON.stringify(sub);
    $("sub-out").classList.remove("hidden");
    $("subscribe").classList.add("hidden");
  };
  $("copy").onclick = async () => { await navigator.clipboard.writeText($("sub-json").value); $("copy").textContent = "Copied"; };
}

$("back").addEventListener("click", () => { history.replaceState(null, "", "./"); showList(); });
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.type === "open") open(e.data.id);
    else showList();
  });
}

setup();
location.hash ? open(decodeURIComponent(location.hash.slice(1))) : showList();
