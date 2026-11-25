// INV web app: a personal front page built from what arrives by push. Everything stays on this
// phone (IndexedDB). Four tabs: Moves (home: what to buy, hold, sell or wait on and why, moves.js),
// Portfolio (real positions and the risk check, portfolio.js), News (the briefing, alerts and the
// calendar) and More (Research = Ideas and Radar, reports, settings). It never trades.
const DB = "inv", STORE = "messages";
const $ = (id) => document.getElementById(id);
const view = () => $("view");

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains("parts")) db.createObjectStore("parts", { keyPath: "key" });
      if (!db.objectStoreNames.contains("log")) db.createObjectStore("log", { autoIncrement: true });
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
// The same alert received twice (an old server bug re-sent stories) is shown once, at its first arrival.
const alerts = () => {
  const seen = new Set();
  return cache.filter((m) => m.kind === "alert").reverse().filter((m) => {
    const key = (m.doc && m.doc.headline) || `${m.title}|${m.body}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).reverse();
};
const localDay = (iso) => { const d = new Date(iso || 0); return isNaN(d) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const weeklies = () => cache.filter((m) => m.kind === "weekly");
const recent = (m, hours) => Date.now() - new Date(m.received || 0) < hours * 3600e3;

function briefingBody(doc, opts = {}) {
  const sections = (doc.sections || []).map((sec) => `<section class="sec"><div class="sec-h"><h3>${esc(sec.title)}</h3></div>
    ${sec.stories.map((s) => story(s, false)).join("")}</section>`).join("");
  const quiet = (doc.quiet || []).length ? `<section class="sec"><div class="sec-h"><h3>Also checked</h3></div><ul class="quiet">${doc.quiet.map((q) =>
    `<li><b>${esc(q.title)}</b> ${esc(q.note)}</li>`).join("")}</ul></section>` : "";
  return `${opts.ticker || ticker(doc.markets)}
    ${opts.alerts || ""}
    ${doc.lead ? story(doc.lead, true) : '<p class="note">A quiet day: nothing passed the importance threshold.</p>'}
    ${sections}${radarToday(doc)}${quiet}
    ${doc.later ? `<p class="note">${doc.later} more stories are saved for the Saturday report.</p>` : ""}
    ${doc.watchlist ? `<p class="note">${esc(doc.watchlist)}</p>` : ""}
    ${opts.footer || ""}
    <p class="last">${esc(doc.last_line || "Information only. You decide and place every order.")}</p>`;
}

// "On the radar today": entries with a filing today; tapping opens the Radar entry in the Ideas tab.
function radarToday(doc) {
  const keys = doc.radar_today || [], rd = doc.radar;
  if (!rd || !keys.length) return "";
  const rows = keys.map((k) => rd.e.find((e) => e.k === k)).filter(Boolean);
  const rest = rd.e.length - rows.length;
  return `<section class="sec"><div class="sec-h"><h3>On the radar today</h3><button data-seg="radar">Radar</button></div>
    ${rows.map(radarRow).join("")}${rest > 0 ? `<p class="note">${rest} more quiet entries in Ideas, Radar.</p>` : ""}</section>`;
}

function alertRows(list) {
  return list.map((m) => {
    const a = m.doc && m.doc.type === "alert" ? m.doc : null;
    const kicker = a ? a.tags.join(" · ") : "Alert";
    const t = fbTap(m.id), mark = t ? ` <span class="fb-tag ${t === "useful" ? "up" : "down"}">${t === "useful" ? "Useful" : "Noise"}</span>` : "";
    return `<button class="row" data-open="${esc(m.id)}"><span><div class="kicker alert">${esc(kicker)} · ${esc(when(m.received))}</div>
    <div class="t">${esc(a ? a.headline : m.title)}</div><div class="muted">${esc(a ? a.sure.label + " · " + a.sure.short : m.body)}${mark}</div></span><span class="chev">›</span></button>`;
  }).join("");
}

// One alert, laid out like a news card: tags, headline, summary, why, what you could do, both cases, how sure.
function alertCard(a, id) {
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
    ${id ? feedbackBlock(id, a.headline, "alert") : ""}
    <p class="last">${esc(a.last_line || "Information only. You decide and place every order.")}</p></article>`;
}

function today() {
  const latest = briefings().find((m) => m.doc);
  const after = (briefings()[0] || {}).received || "";
  const fresh = alerts().filter((m) => (m.received || "") > after);   // only since the last briefing; older days are in the calendar
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
  if (doc.snapshot && !today.full) {                       // the headline snapshot first (snapshot.js)
    view().innerHTML = snapshotPage(latest);
    return;
  }
  const lv = liveFor(latest);
  view().innerHTML = (doc.snapshot ? bar("Full briefing", "today") : "") + masthead(doc.dateline, `${doc.time} Luxembourg`) + setupBanner()
    + briefingBody(doc, { alerts: alertBlock, footer, ticker: lv ? liveTicker(lv) : null });
}

function alertsView() {
  // Only what is new since the last evening briefing (which already covered the earlier ones); older days are in the calendar.
  const all = alerts(), last = (briefings()[0] || {}).received || "";
  const list = all.filter((m) => (m.received || "") > last);
  const older = all.length - list.length;
  view().innerHTML = bar("Alerts") + `<div class="wrap">${list.length ? alertRows(list)
    : `<p class="muted" style="padding:16px 0">${all.length ? "No new alerts since the last evening briefing." : "No alerts yet. Urgent news reaches you here and on your lock screen; the threshold rises on busy days so it stays rare."}</p>`}
    ${older ? `<button class="full" style="margin:14px 0 0;width:100%" data-go="reports">Earlier alerts are in the Calendar ›</button>` : ""}</div>`;
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
    <div class="group"><h3>Useful / Noise feedback</h3><div id="fb-settings">${feedbackSettings()}</div></div>
    <div class="group"><h3>Machine health</h3><div id="mhealth"><p class="muted">Loading…</p></div>
      <p class="muted">Is the machine running? Green: working. Red: Claude is looking at it; alerts may be late.</p></div>
    <div class="group"><h3>Delivery log</h3><div id="dlog"><p class="muted">Loading…</p></div>
      <p class="muted">Every push this phone received (newest first) and whether a notification was shown.</p></div>
    <div class="group"><h3>About</h3><p>Information only. The app never trades: every alert says what could be done and why, and you decide and place every order. Messages are stored only on this phone.</p></div>`;
  wireSetup();
  machineHealth();
  deliveryLog().then((rows) => {
    const el = $("dlog");
    if (!el) return;
    el.innerHTML = rows.length ? rows.map((r) => `<div class="kv"><span>${esc(when(r.at))}</span><span>${esc([r.title || r.id, r.part, r.shown ? "shown: " + r.shown : "", r.note, r.error].filter(Boolean).join(" · "))}</span></div>`).join("")
      : '<p class="muted">No push received since this log was added.</p>';
  });
}

// Each run publishes live/health.json next to the app (machine state only: times and problem kinds).
async function machineHealth() {
  const el = $("mhealth");
  if (!el) return;
  let doc = null;
  try {
    const res = await fetch("live/health.json?t=" + Date.now(), { cache: "no-store" });
    if (res.ok) doc = await res.json();
  } catch (_) { doc = null; }
  if (!$("mhealth")) return;
  if (!doc || !Array.isArray(doc.lines) || !doc.lines.length) {
    el.innerHTML = '<p class="muted">Arrives with the next run.</p>';
    return;
  }
  el.innerHTML = doc.lines.map((l) => `<div class="kv health ${l.ok ? "ok" : "bad"}"><span><i class="dot"></i>${esc(l.name)}</span>`
    + `<span>${l.ok ? "OK" : "Problem"} · ${esc(when(l.checked_at))}${l.ok ? "" : `<br>${esc(String(l.detail || "").replace(/\b(late|skipped|crash|network|empty): /g, ""))}`}</span></div>`).join("");
}

async function deliveryLog() {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction("log").objectStore("log").getAll();
      req.onsuccess = () => resolve((req.result || []).reverse().slice(0, 30));
      req.onerror = () => resolve([]);
    });
  } catch (_) { return []; }
}

async function openMessage(id) {
  const m = cache.find((x) => x.id === id);
  if (!m) return go("today");
  if (m.kind === "ideas") return go("ideas");
  const back = m.kind === "alert" ? "alerts" : "reports";
  if (m.doc && m.doc.type === "alert") {
    view().innerHTML = bar("Alert", back) + alertCard(m.doc, m.id);
  } else if (m.doc) {
    view().innerHTML = bar("Evening briefing", back) + masthead(m.doc.dateline, `${m.doc.time} Luxembourg`) + briefingBody(m.doc);
  } else {
    view().innerHTML = bar(m.kind === "weekly" ? "Saturday report" : m.kind === "alert" ? "Alert" : "Evening briefing", back)
      + `<article class="wrap doc">${render(m.text || m.body)}${m.url ? `<p><a href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener">Read source</a></p>` : ""}</article>`
      + (m.kind === "alert" ? `<div class="wrap">${feedbackBlock(m.id, m.title, "alert")}</div>` : "");
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

// Which of the four tab-bar buttons a screen belongs to.
const TAB_OF = { moves: "moves", move: "moves", portfolio: "portfolio", today: "today", full: "today", story: "today",
  alerts: "today", reports: "today", day: "today", more: "more", ideas: "more", idea: "more", radar: "more", settings: "more" };
function navOn(screen) {
  const t = TAB_OF[screen] || null;
  document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
}

async function go(tab, id) {
  cache = await allMessages();
  if (tab === "move") {                                    // one move opened: the full why
    navOn("move");
    history.replaceState(null, "", "#move/" + encodeURIComponent(id));
    moveCard(id);
    window.scrollTo(0, 0);
    return badge();
  }
  if (tab === "radar") {                                   // one Radar entry in the Ideas tab
    navOn("radar");
    history.replaceState(null, "", "#radar/" + encodeURIComponent(id));
    radarDetail(cache, id);
    return badge();
  }
  if (tab === "day") {                                     // one past day from the calendar
    navOn("day");
    history.replaceState(null, "", "#day/" + id);
    dayView(id);
    return badge();
  }
  if (tab === "story") {                                   // one snapshot line opened (layer 2)
    navOn("story");
    history.replaceState(null, "", "#story/" + encodeURIComponent(id));
    const [mid, i] = String(id).includes("|") ? String(id).split("|") : [null, id];
    const msg = mid ? cache.find((m) => m.id === mid) : briefings().find((m) => m.doc && m.doc.snapshot);
    if (msg && msg.doc && msg.doc.snapshot) storyCard(msg, Number(i)); else today();
    return badge();
  }
  today.full = tab === "full";
  if (tab === "full") tab = "today";
  if (tab === "idea") {                                    // one company in the Ideas tab
    navOn("idea");
    history.replaceState(null, "", "#ideas/" + encodeURIComponent(id));
    ideaDetail(cache, id);
    return badge();
  }
  const views = { moves: movesView, today, alerts: alertsView, ideas: () => ideasView(cache), portfolio: portfolioView,
    reports: calendarView, settings: settingsView, more: moreView };
  if (!id && !views[tab]) tab = "moves";
  const name = id ? "open" : tab;
  navOn(id ? null : tab);
  history.replaceState(null, "", id ? "#" + encodeURIComponent(id) : tab === "moves" ? "./" : "#" + tab);
  if (name === "open") await openMessage(id);
  else views[tab]();
  if (!id && ["today", "alerts", "reports"].includes(tab) && !today.full) {   // News: briefing, alerts, calendar
    view().insertAdjacentHTML("afterbegin", newsTabs(tab));
  }
  if (!id) window.scrollTo(0, 0);
  badge();
}

// Every tappable thing that moves between screens. route() does the move; swipe.js wraps it in a slide
// and keeps the stack of screens behind, so Back and a swipe return to the screen you came from.
const NAV = "[data-move],[data-idea],[data-seg],[data-sort],[data-radar],[data-story],[data-full],[data-day],[data-month],[data-tab],[data-go],[data-open]";
function route(target) {
  const mvEl = target.closest("[data-move]");
  if (mvEl) return go("move", mvEl.dataset.move);
  const idea = target.closest("[data-idea]"), seg = target.closest("[data-seg]"), sort = target.closest("[data-sort]");
  const rad = target.closest("[data-radar]");
  const st = target.closest("[data-story]"), full = target.closest("[data-full]");
  const day = target.closest("[data-day]"), mon = target.closest("[data-month]");
  if (day) return go("day", day.dataset.day);
  if (mon) { calMonth = mon.dataset.month; return go("reports"); }
  if (st) return go("story", st.dataset.story);
  if (full) return go("full");
  if (rad) return go("radar", rad.dataset.radar);
  if (seg) { setIdeasSeg(seg.dataset.seg); return go("ideas"); }
  if (sort) { setIdeasSort(sort.dataset.sort); return go("ideas"); }
  if (idea) return go("idea", idea.dataset.idea);
  const t = target.closest("[data-tab],[data-go],[data-open]");
  if (!t) return Promise.resolve();
  return t.dataset.open ? go(null, t.dataset.open) : go(t.dataset.tab || t.dataset.go);
}

// The screen a hash names (the address bar keeps it, so a screen can be reopened as it was).
function goHash(hash, full) {
  const h = decodeURIComponent(String(hash || "").replace(/^#/, ""));
  if (["today", "alerts", "ideas", "portfolio", "reports", "settings", "more", "moves"].includes(h)) return go(h);
  if (h.startsWith("move/")) return go("move", h.slice(5));
  if (h.startsWith("ideas/")) return go("idea", h.slice(6));
  if (h.startsWith("radar/")) return go("radar", h.slice(6));
  if (h.startsWith("story/")) return go("story", h.slice(6));
  if (h.startsWith("day/")) return go("day", h.slice(4));
  if (h) return go(null, h);
  return go(full ? "full" : "moves");
}

document.addEventListener("click", (e) => {
  if (e.target.closest("a")) return;                       // links to filings open on their own
  const el = e.target.closest(NAV);
  if (el) navigate(el);                                    // swipe.js
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.type === "open") go(null, e.data.id);
    else if (/^#ideas/.test(location.hash)) { if (location.hash === "#ideas") go("ideas"); }
    else if (location.hash === "#portfolio") go("portfolio");                // a new briefing brings new positions
    else if (location.hash === "#today") go("today");
    else if (!location.hash || location.hash === "#moves") go("moves");                // new moves arrive with each read
  });
}

(async () => {
  if (pushOk()) {
    try {
      reg = await navigator.serviceWorker.register("sw.js");
      subscribed = !!(await reg.pushManager.getSubscription()) && Notification.permission === "granted";
      // a report whose box could not be fetched when it arrived is opened now
      navigator.serviceWorker.ready.then((r) => r.active && r.active.postMessage({ type: "open-waiting" })).catch(() => {});
    } catch (_) {}
  }
  goHash(location.hash);
  refreshLive();                                           // the hourly market prices (snapshot.js)
})();
