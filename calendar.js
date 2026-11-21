// INV calendar (Artu, 2026-11-21): Today shows only what is new; every earlier day is kept here.
// A month grid marks the days with a briefing, alerts or a Saturday report; tapping a day shows
// what happened that day: the snapshot (mood and headlines), the alerts, the Ideas headline and
// the reports. Everything comes from the messages stored on this phone. Nothing here trades.

let calMonth = "";
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function messageDay(m) {
  if ((m.kind === "briefing" || m.kind === "ideas") && m.doc && m.doc.date) return m.doc.date;
  return localDay(m.received);
}

function byDay() {
  const days = {};
  const add = (m) => {
    const d = messageDay(m);
    if (!d) return;
    (days[d] = days[d] || { briefing: [], alert: [], ideas: [], weekly: [] })[m.kind]?.push(m);
  };
  [...briefings(), ...alerts(), ...weeklies(), ...cache.filter((m) => m.kind === "ideas")].forEach(add);
  return days;
}

function moodBlock(md) {
  if (!md) return "";
  const tiles = `<div class="tiles">${md.tiles.map((t) => `<div class="tile${t.big ? " big" : ""}"><span>${esc(t.name)}</span>
      <b class="${/^[-−]/.test(t.change) ? "down" : /^\+/.test(t.change) ? "up" : ""}">${esc(t.change)}</b></div>`).join("")}</div>`;
  return `<section class="mood"><span class="mchip ${esc(md.tone)}">${esc(md.label)}</span><h1>${esc(md.line)}</h1>${tiles}</section>`;
}

function dayTitle(d) {
  const dt = new Date(d + "T12:00:00");
  return isNaN(dt) ? d : dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function daySummary(e) {
  const b = e.briefing.find((m) => m.doc);
  const s = b && b.doc.snapshot;
  if (s && s.mood) return s.mood.line;
  if (s && s.lines[0]) return s.lines[0].headline;
  if (b && b.doc.lead) return b.doc.lead.headline;
  if (e.alert[0]) return (e.alert[0].doc && e.alert[0].doc.headline) || e.alert[0].body || e.alert[0].title;
  if (e.weekly[0]) return e.weekly[0].title;
  if (e.ideas[0] && e.ideas[0].doc && e.ideas[0].doc.snap) return e.ideas[0].doc.snap.head;
  return "Ideas list";
}

function calendarView() {
  const days = byDay(), keys = Object.keys(days).sort();
  const now = new Date(), thisMonth = ymd(now).slice(0, 7), todayKey = ymd(now);
  const month = calMonth || thisMonth;
  const [y, mo] = month.split("-").map(Number);
  const first = new Date(y, mo - 1, 1), count = new Date(y, mo, 0).getDate();
  const lead = (first.getDay() + 6) % 7;                                   // Monday first
  const earliest = (keys[0] || thisMonth).slice(0, 7);
  const shift = (n) => { const d = new Date(y, mo - 1 + n, 1); return ymd(d).slice(0, 7); };
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="d"></span>');
  for (let d = 1; d <= count; d++) {
    const key = `${month}-${pad2(d)}`, e = days[key];
    const cls = `d${key === todayKey ? " today" : ""}`;
    if (!e) { cells.push(`<span class="${cls}">${d}</span>`); continue; }
    const dots = (e.briefing.length ? "<i></i>" : "") + (e.alert.length ? '<i class="a"></i>' : "") + (e.weekly.length ? '<i class="w"></i>' : "");
    cells.push(`<button class="${cls}" data-day="${key}"><span>${d}</span><span class="dots">${dots}</span></button>`);
  }
  const title = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const recent = keys.slice().reverse().slice(0, 10).map((k) => {
    const e = days[k], n = e.alert.length;
    const meta = [e.briefing.length ? "Briefing" : "", n ? `${n} alert${n > 1 ? "s" : ""}` : "", e.weekly.length ? "Saturday report" : "",
      e.ideas.length ? "Ideas" : ""].filter(Boolean).join(" · ");
    return `<button class="dayline" data-day="${k}"><span><div class="kicker">${esc(k === todayKey ? "Today" : dayTitle(k))}</div>
      <div class="t">${esc(daySummary(e))}</div><div class="m">${esc(meta)}</div></span><span class="chev">›</span></button>`;
  }).join("");
  view().innerHTML = bar("Calendar") + `<div class="cal">
    <div class="cal-h"><button data-month="${shift(-1)}" ${month <= earliest ? "disabled" : ""}>‹</button><b>${esc(title)}</b>
      <button data-month="${shift(1)}" ${month >= thisMonth ? "disabled" : ""}>›</button></div>
    <div class="grid">${["M", "T", "W", "T", "F", "S", "S"].map((w) => `<span class="wd">${w}</span>`).join("")}${cells.join("")}</div>
    <div class="legend"><span><i></i>Briefing</span><span><i class="a"></i>Alerts</span><span><i class="w"></i>Saturday report</span></div>
  </div>
  <section class="sec"><div class="sec-h"><h3>Recent days</h3></div>${recent || '<p class="muted">Each day you receive something appears here.</p>'}</section>`;
}

function dayView(key) {
  const e = byDay()[key];
  const head = bar(dayTitle(key), "reports");
  if (!e) { view().innerHTML = head + '<p class="note">Nothing arrived on this day.</p>'; return; }
  const out = [];
  const b = e.briefing.find((m) => m.doc) || e.briefing[0];
  if (b && b.doc && b.doc.snapshot) {
    const s = b.doc.snapshot;
    out.push(moodBlock(s.mood));
    out.push(`<section class="sec"><div class="sec-h"><h3>What happened</h3><button data-open="${esc(b.id)}">Full briefing ›</button></div>
      ${s.lines.map((l, i) => snapLine(l, i, b.id)).join("")}</section>`);
    if ((s.attention || []).length) out.push(`<div class="abox on"><h4>Needed your attention</h4>${s.attention.map((a) => `<p>${esc(a)}</p>`).join("")}</div>`);
  } else if (b) {
    const lead = b.doc && b.doc.lead;
    out.push(`<section class="sec"><div class="sec-h"><h3>Evening briefing</h3></div><button class="row" data-open="${esc(b.id)}"><span>
      <div class="t">${esc(lead ? lead.headline : b.title)}</div><div class="muted">${esc(b.doc ? b.doc.notification : b.body)}</div></span><span class="chev">›</span></button></section>`);
  }
  if (e.alert.length) out.push(`<section class="sec"><div class="sec-h"><h3>Alerts</h3></div>${alertRows(e.alert)}</section>`);
  const idea = e.ideas.find((m) => m.doc && m.doc.snap);
  if (idea) out.push(`<section class="sec"><div class="sec-h"><h3>Midday ideas</h3></div><p class="stand" style="margin:8px 0">${esc(idea.doc.snap.head)}.</p>
    <p class="muted">${esc(idea.doc.snap.line)}</p></section>`);
  if (e.weekly.length) out.push(`<section class="sec"><div class="sec-h"><h3>Saturday report</h3></div>${e.weekly.map((w) => `<button class="row" data-open="${esc(w.id)}"><span>
    <div class="t">${esc(w.title)}</div><div class="muted">${esc(w.body)}</div></span><span class="chev">›</span></button>`).join("")}</section>`);
  view().innerHTML = head + out.join("") + '<p class="last">Information only. You decide and place every order.</p>';
}
