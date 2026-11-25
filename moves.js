// Your moves: the home screen. One Buy / Buy? / Hold / Sell / Trim / Wait / Check per instrument, each with a
// one-line why; a tap opens the full why (case for and against, how much, what would change it, evidence).
// The data (inv/moves.py, compact keys) rides inside the midday read and the evening briefing, by encrypted push,
// so only this phone can read it. Loaded before app.js, which supplies esc, bar, when, safeUrl and cache.
// Advice only: the app never trades; you place every order.
const MV = { "BUY": ["BUY", "buy"], "BUY?": ["BUY?", "buy"], "HOLD": ["HOLD", "hold"], "SELL": ["SELL", "sell"],
  "TRIM": ["TRIM", "sell"], "WAIT": ["WAIT", "wait"], "CHECK": ["CHECK", "wait"] };
const KIND = { core: "core plan", stock: "", holding: "you hold it" };

function movesLatest() {
  // newest message carrying moves (midday read, a ranking update or the evening briefing)
  const m = cache.find((x) => x.doc && x.doc.moves);
  return m ? m.doc.moves : null;
}
const mvPct = (x) => x == null ? "" : (x * 100).toFixed(0) + "%";
function mvTime(iso) {
  const d = new Date(iso || 0);
  return isNaN(d) ? "" : d.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}
function mvChip(mv, big) {
  const [label, cls] = MV[mv] || [mv, "hold"];
  return `<span class="mv mv-${cls}${big ? " big" : ""}">${esc(label)}</span>`;
}
function mvSub(m) {
  const bits = [];
  if (m.h != null) bits.push(`you hold ${typeof pfMoney === "function" ? pfMoney(m.h, "EUR") : m.h + " €"}`);
  else if (KIND[m.k]) bits.push(KIND[m.k]);
  if (m.ro && m.k === "stock") bits.push(m.ro === "core" ? "core pick" : "satellite");
  return bits.join(" · ");
}
function mvEntry(m) {
  const e = m.en;
  if (!e) return "";
  if (e.gd) return { "cool-off": "Cool-off", "news": "Bad news: settling" }[e.gd] || "Falling knife";
  return `Entry ${e.s}/6` + (e.st ? ` · in ${e.st} steps` : "");
}
function mvRow(m) {
  const size = m.sz && m.sz !== "keep" && m.sz !== "keep for now" && m.mv !== "WAIT" ? "Size: " + (m.en && m.en.st ? "half now, half in a month" : m.sz.split(";")[0]) : "";
  const meta = [mvEntry(m), size, "Confidence " + m.c, m.p ? "paper" : ""]
    .filter(Boolean).join(" · ");
  return `<button class="mrow" data-move="${esc(m.i)}">${mvChip(m.mv)}<span>
    <div class="t">${esc(m.n)}${m.tk ? ` <span class="tk">${esc(m.tk.t)}</span>` : ""} <span class="muted">${esc(mvSub(m))}</span></div>
    <div class="why">${esc(m.l)}</div>
    <div class="muted">${esc(meta)}${m.nw ? ` · <span class="newsdot">${m.nw.length} in the news</span>` : ""}</div>
    ${m.ch ? `<div class="chg">Changed: was ${esc(m.ch.f || "new")} · ${esc(when(m.ch.at))}</div>` : ""}</span></button>`;
}

function movesView() {
  const d = movesLatest();
  if (!d) {
    view().innerHTML = bar("Your moves") + setupBanner() + `<div class="empty"><h2>Your first moves arrive with the next update</h2>
      <p class="muted">The moves are checked every hour. This page fills with what to buy, hold, sell or wait on, and why,
      as soon as a move changes (changes at night wait until 07:00), and with the midday read and the evening briefing.
      Advice only: you place every order.</p></div>`;
    return;
  }
  const by = Object.fromEntries(d.m.map((m) => [m.i, m]));
  const k = d.mk || {}, gauges = [];
  if (k.world_vs_sma200 != null) gauges.push(`World ${k.world_vs_sma200 >= 0 ? "above" : "below"} its 200-day (${(k.world_vs_sma200 * 100).toFixed(1)}%)`);
  if (k.vix_close != null) gauges.push(`VIX ${k.vix_close.toFixed(1)}${k.vix_close < 25 ? " calm" : " nervous"}`);
  if (k.hy_oas_chg_3m != null) gauges.push(`credit spreads ${k.hy_oas_chg_3m >= 1 ? "widening" : "steady"}`);
  else if (k.hy_proxy_3m != null) gauges.push(`credit ${k.hy_proxy_3m <= -0.035 ? "stressed" : "steady"}`);
  const mood = (d.mood && d.mood.t) || gauges.length ? `<div class="mood-box">${d.mood && d.mood.t ? `<b>${esc(d.mood.t)}</b>` : ""}
    ${d.mood && d.mood.l ? `<div>${esc(d.mood.l)}</div>` : ""}${gauges.length ? `<div class="gauges">Market: ${esc(gauges.join(" · "))}</div>` : ""}</div>` : "";
  const paper = d.pu ? `<p class="paper">Paper trading until ${esc(new Date(d.pu).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}:
    every Buy is followed in the paper portfolio first.</p>` : "";
  const tr = d.tr ? trackBox(d.tr) : "";
  const secs = d.s.filter(([, , ids]) => ids.length).map(([id, title, ids]) => `<section class="msec">
    <div class="msec-h"><span>${esc(title)}</span><span>${ids.length}</span></div>${ids.map((i) => by[i] ? mvRow(by[i]) : "").join("")}</section>`).join("");
  view().innerHTML = `<div class="mhead"><div class="muted">${esc(mvTime(d.u))}</div><h1>Your moves</h1></div>`
    + setupBanner() + `<div class="wrap">${mood}${paper}${tr}${secs || '<p class="muted">Nothing to do today.</p>'}
    <p class="muted note">Advice only. The app never trades; you place every order.</p></div>`;
}

function moveCard(id) {
  const d = movesLatest(), m = d && d.m.find((x) => x.i === id);
  if (!m) return movesView();
  const list = (xs) => xs && xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : '<p class="muted">Nothing found.</p>';
  const gates = (m.g || []).map(([rule, ok]) => `<div class="kv"><span>${esc(rule)}</span><span class="${ok ? "ok" : "no"}">${ok ? "yes" : "no"}</span></div>`).join("");
  const ev = (m.ev || []).map(([t, u, g, dt]) => `<li>${u ? `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t)}
    <span class="muted">${esc([g && g.length === 1 ? "grade " + g : "", dt].filter(Boolean).join(" · "))}</span></li>`).join("");
  const sub = [mvSub(m), m.sh != null ? mvPct(m.sh) + " of your growth pot" : ""].filter(Boolean).join(" · ");
  view().innerHTML = `<div class="bar"><button class="back" data-go="moves">‹ Your moves</button></div><div class="wrap">
    <div class="mtitle">${mvChip(m.mv, true)}<div><h1>${esc(m.n)}</h1><div class="muted">${esc(sub)}</div></div></div>
    ${m.ch ? `<div class="chg">Changed: was ${esc(m.ch.f || "new")} · ${esc(when(m.ch.at))}</div>` : ""}
    <div class="mbox"><h3>In one line</h3><p>${esc(m.l)}</p></div>
    ${tickerBox(m)}
    ${entryBox(m)}
    ${newsBox(m)}
    ${m.yb && m.yb.length ? `<div class="mbox"><h3>Why buy or keep</h3>${list(m.yb)}</div>` : ""}
    <div class="mbox"><h3>Why not</h3>${list(m.yn)}</div>
    <div class="mbox"><h3>How much</h3><div class="kv"><span>Size</span><b>${esc(m.ls ? (m.sz || "").split(";")[0] : (m.sz || "n/a"))}</b></div>
      ${m.p ? '<div class="kv"><span>Paper first</span><span>yes, until month 3</span></div>' : ""}</div>
    ${gates ? `<div class="mbox"><h3>Rules checked</h3>${gates}</div>` : ""}
    ${m.ci ? `<div class="mbox"><h3>What would change this</h3><p>${esc(m.ci)}</p></div>` : ""}
    <div class="mbox"><h3>Evidence · confidence ${esc(m.c)}</h3><ul>${ev}</ul></div>
    ${m.k === "stock" ? `<button class="row" data-idea="${esc(m.i)}"><span><div class="t">Full company analysis</div>
      <div class="muted">Checks, grades, value range, statements</div></span><span class="chev">›</span></button>` : ""}
    <p class="muted note">Advice only. You place every order yourself.</p></div>`;
}

// In the news: only confirmed reports (official source, two outlets or the company's own filing). News alone never
// makes a Buy; confirmed bad news holds a Buy? back for 2 days.
function newsBox(m) {
  if (!m.nw || !m.nw.length) return "";
  const arrow = { up: "▲ ", down: "▼ " };
  const items = m.nw.map(([t, u, why, d, tone]) => `<li>${esc(arrow[tone] || "")}${u ? `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t)}
    <span class="muted">${esc([why, d].filter(Boolean).join(" · "))}</span></li>`).join("");
  return `<div class="mbox"><h3>In the news</h3><ul>${items}</ul>
    <p class="muted">Confirmed reports only. News alone never makes a Buy.</p></div>`;
}

// How to find it on Trading 212: the ticker its app shows, the listing the analysis priced, the ISIN (exact match).
function tickerBox(m) {
  const k = m.tk;
  if (!k) return "";
  const seen = k.ok === true ? "found in Trading 212's list" : k.ok === false ? "not found in Trading 212's list: search the ISIN" : "";
  return `<div class="mbox"><h3>On Trading 212</h3>
    <div class="kv"><span>Search</span><b class="tkbig">${esc(k.t)}</b></div>
    ${k.n && k.n !== m.n ? `<div class="kv"><span>Name</span><span>${esc(k.n)}</span></div>` : ""}
    ${k.x ? `<div class="kv"><span>Listing</span><span>${esc(k.x)}</span></div>` : ""}
    ${k.isin ? `<div class="kv"><span>ISIN</span><span>${esc(k.isin)}</span></div>` : ""}
    ${seen ? `<p class="muted">${esc(seen)}</p>` : ""}
    ${m.k === "core" ? '<p class="muted">The plan\'s suggested fund for this part; any similar fund you prefer works too.</p>' : ""}</div>`;
}

// The entry rules on the why card: Price, Trend and Market out of 2 each, the guards, the trigger; core: the lump-sum rule.
function entryBox(m) {
  if (m.ls) return `<div class="mbox"><h3>Timing</h3><p>Monthly money goes in every month, whatever the signals say.
    A lump sum goes in <b>${esc(m.ls.m === "at once" ? "at once" : m.ls.m === "not measured" ? "in 3 monthly steps (trend not measured yet)" : "in 3 monthly steps")}</b>: ${esc(m.ls.w)}.</p></div>`;
  const e = m.en;
  if (!e) return "";
  if (e.gd) return `<div class="mbox"><h3>Entry timing · ${esc(e.gd)}</h3><p>${esc(m.l)}</p>
    ${e.tr ? `<div class="kv"><span>Re-check</span><span>${esc(e.tr)}</span></div>` : ""}</div>`;
  const NAMES = { price: "Price", trend: "Trend", market: "Market" };
  const dots = (n) => "●".repeat(n) + "○".repeat(2 - n);
  const rows = Object.entries(e.p || {}).map(([k, [pts, txt]]) => `<div class="erow"><span class="en">${NAMES[k]}</span>
    <span class="ed">${dots(pts)}</span><span class="et">${esc(txt)}</span></div>`).join("");
  const verdict = e.s >= 5 ? "Good entry: buy" : e.s >= 3 ? "Mixed entry: buy in 2 steps" : "Poor entry: wait";
  return `<div class="mbox"><h3>Entry timing · ${e.s}/6</h3><p class="ev">${verdict}</p>${rows}
    ${e.a ? `<p class="muted">${esc(e.a)}</p>` : ""}${e.tr ? `<div class="kv"><span>Waiting for</span><span>${esc(e.tr)}</span></div>` : ""}
    <p class="muted">5-6 buy, 3-4 buy in 2 steps, 0-2 wait. A good company still needs a fair price, an up trend and a calm market.</p></div>`;
}

// The paper track record: every Buy followed on paper from the last close, scored against the World ETF.
function trackBox(t) {
  const pc = (x) => x == null ? "" : (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(1) + "%";
  const rows = t.c.map(([n, since, r, v, open]) => `<div class="kv"><span>${esc(n)} <span class="muted">${esc(since)}${open ? "" : " · sold"}</span></span>
    <span>${esc(pc(r))} <span class="${v >= 0 ? "ok" : "no"}">(${esc(pc(v))} vs World)</span></span></div>`).join("");
  return `<details class="mbox track"><summary><b>Paper track record</b> · ${t.n} call${t.n === 1 ? "" : "s"},
    ${t.b} beat the World ETF · average ${esc(pc(t.v))} vs World</summary>${rows}
    <p class="muted">Each Buy bought on paper at the last close and compared with the World ETF over the same days.
    Early calls say little; the record counts from 30 days.</p></details>`;
}

// More: everything that is not a move, one tap away.
function moreView() {
  const row = (go, t, sub) => `<button class="row" data-go="${go}"><span><div class="t">${t}</div><div class="muted">${sub}</div></span><span class="chev">›</span></button>`;
  view().innerHTML = bar("More") + `<div class="wrap">
    ${row("ideas", "Research", "Every company ranked from its filings, and the Radar")}
    ${row("reports", "Calendar and reports", "Past briefings, past days and Saturday reports")}
    ${row("settings", "Settings", "Notifications, watchlist, schedule, delivery log")}</div>`;
}

// News: the briefing, alerts and calendar under one tab, switched at the top.
function newsTabs(on) {
  const b = (go, label) => `<button data-go="${go}" class="${on === go ? "on" : ""}">${label}</button>`;
  return `<div class="newstabs">${b("today", "Today")}${b("alerts", "Alerts")}${b("reports", "Calendar")}</div>`;
}
