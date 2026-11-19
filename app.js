// INV web app: a personal front page built from what arrives by push. Everything stays on this
// phone (IndexedDB). Four tabs: Today (the latest briefing as a front page), Alerts, Reports
// (past briefings and Saturday reports) and Settings. It never trades.
const DB = "inv", STORE = "messages";
const $ = (id) => document.getElementById(id);
const view = () => $("view");

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
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function safeUrl(u) { return /^https:\/\//.test(u || "") ? u : "#"; }
function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Small Markdown subset for alerts and the Saturday report. Input is escaped first.
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])_(.+?)_(?=$|[\s.,)])/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function render(md) {
  const out = [];
  let table = null, list = false;
  const flush = () => {
    if (table) { out.push('<div style="overflow-x:auto"><table>' + table.join("") + "</table></div>"); table = null; }
    if (list) { out.push("</ul>"); list = false; }
  };
  for (const line of (md || "").split("\n")) {
    if (/^\|/.test(line)) {
      if (/^\|[-\s|:]+\|$/.test(line)) continue;
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
    if (h) out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
    else if (line.trim()) out.push("<p>" + inline(line) + "</p>");
  }
  flush();
  return out.join("\n");
}

// ---- Newspaper pieces --------------------------------------------------------------------
function links(s) {
  return (s.links || []).map(([label, url]) => `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${esc(label)}</a>`).join(" · ");
}
function story(s, lead) {
  const l = links(s);
  const cases = lead && s.up ? `<div class="case"><b class="up">Up case</b><span>${esc(s.up)}</span><b class="down">Down case</b><span>${esc(s.down)}</span></div>` : "";
  return lead ? `<article class="lead">
      ${s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : ""}
      <h2>${esc(s.headline)}</h2>
      ${s.standfirst ? `<p class="stand">${esc(s.standfirst)}</p>` : ""}${cases}
      <div class="by">${esc(s.byline)}${l ? " · " + l : ""}</div></article>`
    : `<article class="item">
      ${s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : ""}
      <h4>${esc(s.headline)}</h4>
      ${s.standfirst ? `<p class="stand">${esc(s.standfirst)}</p>` : ""}
      <div class="by">${esc(s.byline)}${l ? " · " + l : ""}</div></article>`;
}
function ticker(markets) {
  if (!(markets || []).length) return "";
  return `<div class="ticker" aria-label="Markets at the close">${markets.map((m) =>
    `<div><span>${esc(m.name)}</span><b>${esc(m.value)}</b><i class="${/^[-−]/.test(m.change) ? "down" : "up"}">${esc(m.change)}</i></div>`).join("")}</div>`;
}
function masthead(dateline, right) {
  return `<header class="mast"><div class="mast-top"><span>${esc(dateline)}</span><span>${esc(right)}</span></div>
    <div class="mast-name">INV</div><div class="mast-sub">Your evening briefing</div></header>`;
}
function bar(title, back) {
  return `<div class="bar"><h1>${esc(title)}</h1>${back ? `<button class="back" data-go="${esc(back)}">Back</button>` : ""}</div>`;
}

// ---- Views --------------------------------------------------------------------------------
let cache = [];
const briefings = () => cache.filter((m) => m.kind === "briefing");
const alerts = () => cache.filter((m) => m.kind === "alert");
const weeklies = () => cache.filter((m) => m.kind === "weekly");
const recent = (m, hours) => Date.now() - new Date(m.received || 0) < hours * 3600e3;

function briefingBody(doc, opts = {}) {
  const sections = (doc.sections || []).map((sec) => `<section class="sec"><div class="sec-h"><h3>${esc(sec.title)}</h3></div>
    ${sec.stories.map((s) => story(s, false)).join("")}</section>`).join("");
  const quiet = (doc.quiet || []).length ? `<section class="sec"><div class="sec-h"><h3>Also checked</h3></div><ul class="quiet">${doc.quiet.map((q) =>
    `<li><b>${esc(q.title)}</b> ${esc(q.note)}</li>`).join("")}</ul></section>` : "";
  return `${ticker(doc.markets)}
    ${opts.alerts || ""}
    ${doc.lead ? story(doc.lead, true) : '<p class="note">A quiet day: nothing passed the importance threshold.</p>'}
    ${sections}${quiet}
    ${doc.later ? `<p class="note">${doc.later} more stories are saved for the Saturday report.</p>` : ""}
    ${doc.watchlist ? `<p class="note">${esc(doc.watchlist)}</p>` : ""}
    ${opts.footer || ""}
    <p class="last">${esc(doc.last_line || "Information only. You decide and place every order.")}</p>`;
}

function alertRows(list) {
  return list.map((m) => {
    const a = m.doc && m.doc.type === "alert" ? m.doc : null;
    const kicker = a ? a.tags.join(" · ") : "Alert";
    return `<button class="row" data-open="${esc(m.id)}"><span><div class="kicker alert">${esc(kicker)} · ${esc(when(m.received))}</div>
    <div class="t">${esc(a ? a.headline : m.title)}</div><div class="muted">${esc(a ? a.sure.label + " · " + a.sure.short : m.body)}</div></span><span class="chev">›</span></button>`;
  }).join("");
}

// One alert, laid out like a news card: tags, headline, summary, why, what you could do, both cases, how sure.
function alertCard(a) {
  const block = (h, text) => text ? `<div class="blk"><h3>${h}</h3><p>${esc(text)}</p></div>` : "";
  const cases = a.up || a.down ? `<div class="blk case"><b class="up">Bull</b><span>${esc(a.up)}</span><b class="down">Bear</b><span>${esc(a.down)}</span></div>` : "";
  const also = (a.also || []).length ? `<div class="blk"><h3>Also reported today${a.also_from ? " (" + esc(a.also_from) + ")" : ""}</h3>
      <ul>${a.also.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></div>` : "";
  const src = a.source || {};
  return `<article class="acard">
    <div class="tags">${a.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}${a.running ? `<span class="tag urg">${esc(a.running)}</span>` : ""}</div>
    <h2>${esc(a.headline)}</h2>
    ${a.standfirst ? `<p class="stand">${esc(a.standfirst)}</p>` : ""}
    ${block("Why it matters to you", a.why)}${block("What you could do", a.todo)}${cases}
    <div class="blk"><h3>How sure</h3><p class="conf"><span class="dots">${esc(a.sure.dots)}</span><span><b>${esc(a.sure.label)}.</b> ${esc(a.sure.reason)}</span></p></div>
    ${also}
    <div class="src"><span>${esc(src.name || "")}${src.published ? " · " + esc(when(src.published)) : ""}</span>
      ${src.link ? `<a class="btn" href="${esc(safeUrl(src.link))}" target="_blank" rel="noopener">Read on ${esc(src.name || "source")}</a>` : ""}</div>
    <p class="last">${esc(a.last_line || "Information only. You decide and place every order.")}</p></article>`;
}

function today() {
  const latest = briefings().find((m) => m.doc);
  const fresh = alerts().filter((m) => recent(m, 48));
  const alertBlock = fresh.length ? `<section class="sec" style="margin-top:12px"><div class="sec-h"><h3>Alerts</h3>
      <button data-go="alerts">All alerts</button></div>${alertRows(fresh.slice(0, 3))}</section>` : "";
  const weekly = weeklies()[0];
  const footer = `<section class="sec"><div class="sec-h"><h3>Reports</h3><button data-go="reports">Archive</button></div>
    ${weekly ? `<button class="row" data-open="${esc(weekly.id)}"><span><div class="kicker">Saturday report · ${esc(weekly.at || "")}</div>
      <div class="t">${esc(weekly.title)}</div><div class="muted">${esc(weekly.body)}</div></span><span class="chev">›</span></button>`
      : '<p class="muted">The first Saturday report arrives at 07:00 on Saturday.</p>'}</section>`;
  if (!latest) {
    view().innerHTML = masthead(new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }), "")
      + setupBanner() + alertBlock + `<div class="empty"><h2>Your first front page arrives at 22:30</h2>
      <p class="muted">Each evening's briefing becomes this page: markets, the lead story and every asset class.</p></div>` + footer;
    return;
  }
  const doc = latest.doc;
  view().innerHTML = masthead(doc.dateline, `${doc.time} Luxembourg`) + setupBanner()
    + briefingBody(doc, { alerts: alertBlock, footer });
}

function alertsView() {
  const list = alerts();
  view().innerHTML = bar("Alerts") + `<div class="wrap">${list.length ? alertRows(list)
    : '<p class="muted" style="padding:16px 0">No alerts yet. Urgent news reaches you here and on your lock screen; the threshold rises on busy days so it stays rare.</p>'}</div>`;
  try { localStorage.setItem("inv-alerts-seen", new Date().toISOString()); } catch (_) {}
  badge();
}

function reportsView() {
  const rows = [...weeklies(), ...briefings()].sort((a, b) => (b.received || "").localeCompare(a.received || ""));
  view().innerHTML = bar("Reports") + `<div class="wrap">${rows.length ? rows.map((m) => `<button class="row" data-open="${esc(m.id)}"><span>
      <div class="kicker">${m.kind === "weekly" ? "Saturday report" : "Evening briefing"} · ${esc(m.doc ? m.doc.dateline : when(m.received))}</div>
      <div class="t">${esc(m.doc && m.doc.lead ? m.doc.lead.headline : m.title)}</div><div class="muted">${esc(m.kind === "weekly" ? m.body : (m.doc ? m.doc.notification : m.body))}</div>
    </span><span class="chev">›</span></button>`).join("") : '<p class="muted" style="padding:16px 0">Past briefings and Saturday reports appear here.</p>'}</div>`;
}

function settingsView() {
  const p = (briefings().find((m) => m.doc && m.doc.profile) || {}).doc?.profile;
  const edit = (url, label) => url ? `<a class="edit" href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${label} ›</a>` : "";
  view().innerHTML = bar("Settings") + `
    <div class="group"><h3>Notifications</h3>${notifState()}</div>
    <div class="group"><h3>Watchlist</h3>
      ${p ? `<div class="chips">${p.following.map((f) => `<span class="chip">${esc(f)}</span>`).join("")}</div>` : '<p>Arrives with the next briefing.</p>'}
      <p>Changes are made in the repository; the next briefing names what was added or removed.</p>
      ${edit(p && p.edit_watchlist, "Edit watchlist on GitHub")}</div>
    <div class="group"><h3>Schedule</h3>
      <div class="kv"><span>Evening briefing</span><span>${esc(p ? p.briefing : "Every evening at 22:30")}</span></div>
      <div class="kv"><span>Saturday report</span><span>${esc(p ? p.weekly : "Saturdays at 07:00")}</span></div>
      <div class="kv"><span>Quiet hours</span><span>${esc(p ? p.quiet_hours : "23:00–07:00")}</span></div>
      <div class="kv"><span>Urgent alerts</span><span>Rarer on busy days</span></div>
      ${edit(p && p.edit_settings, "Change schedule or quiet hours on GitHub")}</div>
    <div class="group"><h3>About</h3><p>Information only. The app never trades: every alert says what could be done and why, and you decide and place every order. Messages are stored only on this phone.</p></div>`;
  wireSetup();
}

async function openMessage(id) {
  const m = cache.find((x) => x.id === id);
  if (!m) return go("today");
  const back = m.kind === "alert" ? "alerts" : "reports";
  if (m.doc && m.doc.type === "alert") {
    view().innerHTML = bar("Alert", back) + alertCard(m.doc);
  } else if (m.doc) {
    view().innerHTML = bar("Evening briefing", back) + masthead(m.doc.dateline, `${m.doc.time} Luxembourg`) + briefingBody(m.doc);
  } else {
    view().innerHTML = bar(m.kind === "weekly" ? "Saturday report" : m.kind === "alert" ? "Alert" : "Evening briefing", back)
      + `<article class="wrap doc">${render(m.text || m.body)}${m.url ? `<p><a href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener">Read source</a></p>` : ""}</article>`;
  }
  window.scrollTo(0, 0);
}

// ---- Notifications setup ------------------------------------------------------------------
let reg = null;
const standalone = () => window.navigator.standalone || matchMedia("(display-mode: standalone)").matches;
const pushOk = () => "serviceWorker" in navigator && "PushManager" in window;
let subscribed = false;

function setupBanner() {
  if (subscribed) return "";
  return `<div class="banner">Notifications are off on this phone. <button data-go="settings">Turn them on</button></div>`;
}
function notifState() {
  if (subscribed) return `<div class="kv"><span>This phone</span><span>On</span></div>`;
  if (!standalone()) return "<p>First add INV to your Home Screen: tap Share, then 'Add to Home Screen', and open it from there.</p>";
  if (!pushOk()) return "<p>This browser cannot receive web notifications.</p>";
  return `<p>Allow notifications so alerts, the 22:30 briefing and the Saturday report reach this phone.</p>
    <button id="subscribe" class="btn">Allow notifications</button>
    <div id="sub-out" class="hidden"><p>Copy this into the repository secret <b>INV_PUSH_SUBSCRIPTIONS</b>, inside square brackets: [ ... ]</p>
    <textarea id="sub-json" readonly></textarea><button id="copy" class="btn">Copy</button></div>`;
}
function wireSetup() {
  const b = $("subscribe");
  if (b) b.onclick = async () => {
    if ((await Notification.requestPermission()) !== "granted") { b.outerHTML = "<p>Notifications were not allowed. You can allow them in Settings, Notifications, INV.</p>"; return; }
    const b64 = window.INV_CONFIG.vapidPublicKey;
    const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
    $("sub-json").value = JSON.stringify(sub);
    $("sub-out").classList.remove("hidden");
    b.classList.add("hidden");
  };
  const c = $("copy");
  if (c) c.onclick = async () => {
    try { await navigator.clipboard.writeText($("sub-json").value); c.textContent = "Copied"; }
    catch (_) { $("sub-json").select(); }
  };
}

// ---- Navigation ---------------------------------------------------------------------------
function badge() {
  let seen = "";
  try { seen = localStorage.getItem("inv-alerts-seen") || ""; } catch (_) {}
  const n = alerts().filter((m) => (m.received || "") > seen).length;
  $("badge").textContent = n;
  $("badge").classList.toggle("hidden", !n);
}

async function go(tab, id) {
  cache = await allMessages();
  const name = id ? "open" : tab;
  document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === (id ? null : tab)));
  history.replaceState(null, "", id ? "#" + encodeURIComponent(id) : tab === "today" ? "./" : "#" + tab);
  if (name === "open") await openMessage(id);
  else ({ today, alerts: alertsView, reports: reportsView, settings: settingsView }[tab] || today)();
  if (!id) window.scrollTo(0, 0);
  badge();
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab],[data-go],[data-open]");
  if (!t) return;
  if (t.dataset.open) go(null, t.dataset.open);
  else go(t.dataset.tab || t.dataset.go);
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.type === "open") go(null, e.data.id);
    else if (!/^#(alerts|reports|settings)|^#.+:/.test(location.hash)) go("today");
  });
}

(async () => {
  if (pushOk()) {
    try {
      reg = await navigator.serviceWorker.register("sw.js");
      subscribed = !!(await reg.pushManager.getSubscription()) && Notification.permission === "granted";
    } catch (_) {}
  }
  const h = decodeURIComponent(location.hash.slice(1));
  if (["alerts", "reports", "settings"].includes(h)) go(h);
  else if (h) go(null, h);
  else go("today");
})();
