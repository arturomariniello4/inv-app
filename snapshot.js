// INV snapshot (Artu, 2026-11-21): a big headline first, detail only once opened.
// Layer 1 is the Today screen: the day's mood from the markets, 3-5 numbered lines (one per story),
// what needs attention, what changed since the last look and the Ideas headline.
// Layer 2 is a story card (tap a line). Layer 3 is every report and the full briefing.
// Built only from the briefing the phone received; nothing here trades.

function sinceLastLook() {
  // The time of the previous visit stays fixed for this session, so going back to Today shows the same list.
  let since = "";
  try {
    since = sessionStorage.getItem("inv-since");
    if (since === null) {
      since = localStorage.getItem("inv-today-seen") || "";
      sessionStorage.setItem("inv-since", since);
    }
    localStorage.setItem("inv-today-seen", new Date().toISOString());
  } catch (_) { since = ""; }
  return since;
}

function sinceBox(latestId) {
  const since = sinceLastLook();
  if (!since) return "";
  const fresh = cache.filter((m) => (m.received || "") > since && m.id !== latestId);
  const al = fresh.filter((m) => m.kind === "alert"), id = fresh.filter((m) => m.kind === "ideas"), wk = fresh.filter((m) => m.kind === "weekly");
  const bits = [];
  if (al.length) bits.push(`${al.length} alert${al.length > 1 ? "s" : ""}`);
  if (id.length) bits.push("new Ideas list");
  if (wk.length) bits.push("Saturday report");
  const at = new Date(since);
  const label = isNaN(at) ? "" : at.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return `<div class="sbox"><h4>Since ${esc(label)}</h4>${bits.length ? esc(bits.join(" · ")) : "Nothing new arrived."}</div>`;
}

function ideasBox() {
  const m = cache.find((x) => x.kind === "ideas" && x.doc);
  const s = m && m.doc.snap;
  if (!s) return `<div class="sbox"><h4>Ideas</h4>The ranked list arrives at 11:45.</div>`;
  return `<button class="sbox" data-go="ideas"><h4>Ideas · Radar</h4>${esc(s.head.split(";")[0])}.<span class="muted"> ${esc(s.line.replace(/^.*?\. /, ""))}</span></button>`;
}

const DOTS = { High: "●●●", Medium: "●●○", Low: "●○○", Unverified: "○○○" };

function snapLine(l, i, mid) {
  const meta = [l.pot, l.kicker, l.reports > 1 ? `${l.reports} reports` : (l.outlets || [])[0], l.sure].filter(Boolean);
  return `<button class="sline" data-story="${mid ? esc(mid) + "|" : ""}${i}"><span class="n">${i + 1}</span><span><span class="t">${esc(l.headline)}</span>
    <span class="m"><b>${esc(meta[0])}</b>${meta.slice(1).map((x) => " · " + esc(x)).join("")}</span></span><span class="chev">›</span></button>`;
}

function snapshotPage(latest) {
  const doc = latest.doc, s = doc.snapshot, md = s.mood;
  const tiles = md ? `<div class="tiles">${md.tiles.map((t) => `<div class="tile${t.big ? " big" : ""}"><span>${esc(t.name)}</span>
      <b class="${/^[-−]/.test(t.change) ? "down" : /^\+/.test(t.change) ? "up" : ""}">${esc(t.change)}</b></div>`).join("")}</div>` : "";
  const att = (s.attention || []).length ? s.attention.map((a) => `<p>${esc(a)}</p>`).join("") : "<p>Nothing needs you tonight.</p>";
  return `<header class="smast"><b>INV</b><span>${esc(doc.dateline)} · ${esc(doc.time)}</span></header>${setupBanner()}
    <section class="mood">
      ${md ? `<span class="mchip ${esc(md.tone)}">${esc(md.label)}</span><h1>${esc(md.line)}</h1>${tiles}`
           : `<h1>${esc(s.lines[0] ? s.lines[0].headline : "A quiet day")}</h1><p class="muted">No market figures came in for this briefing.</p>`}
    </section>
    <section class="sec"><div class="sec-h"><h3>What happened</h3><button data-full="1">All ${s.stories} stories ›</button></div>
      ${s.lines.map((l, i) => snapLine(l, i)).join("") || '<p class="muted">Nothing passed the importance bar today.</p>'}</section>
    <div class="abox${(s.attention || []).length ? " on" : ""}"><h4>Needs your attention</h4>${att}</div>
    <div class="duo">${sinceBox(latest.id)}${ideasBox()}</div>
    <button class="full" data-full="1">Read the full briefing ›</button>
    <p class="last">${esc(doc.last_line || "Information only. You decide and place every order.")}</p>`;
}

function storyCard(latest, i) {
  const doc = latest.doc, lines = doc.snapshot.lines, l = lines[i];
  if (!l) return go("today");
  const isLatest = briefings().find((m) => m.doc && m.doc.snapshot) === latest;
  const ref = (k) => isLatest ? `${k}` : `${esc(latest.id)}|${k}`;
  const back = isLatest ? `<button class="back" data-go="today">‹ Today</button>` : `<button class="back" data-day="${esc(doc.date)}">‹ ${esc(doc.dateline)}</button>`;
  const nav = `<div class="bar">${back}
    <span class="muted">${i > 0 ? `<button class="back" data-story="${ref(i - 1)}">‹</button> ` : ""}${i + 1} of ${lines.length}${i < lines.length - 1 ? ` <button class="back" data-story="${ref(i + 1)}">›</button>` : ""}</span></div>`;
  const block = (h, t) => t ? `<div class="blk"><h3>${h}</h3><p>${esc(t)}</p></div>` : "";
  const cases = l.up || l.down ? `<div class="blk case"><b class="up">Up case</b><span>${esc(l.up)}</span><b class="down">Down case</b><span>${esc(l.down)}</span></div>` : "";
  const how = l.reports > 1 ? `${l.reports} reports from ${(l.outlets || []).join(", ")}.` : `${(l.outlets || [""])[0]}.`;
  const reports = (l.all || []).map((r) => `<li><a href="${esc(safeUrl(r.u))}" target="_blank" rel="noopener">${esc(r.h)}</a> <span class="muted">${esc(r.by)}</span></li>`).join("");
  view().innerHTML = nav + `<article class="acard">
    <div class="kicker">${esc([l.kicker, l.pot].filter(Boolean).join(" · "))}</div>
    <h2>${esc(l.full || l.headline)}</h2>
    ${l.standfirst ? `<p class="stand">${esc(l.standfirst)}</p>` : ""}
    ${block("Why it matters to you", l.why)}${cases}
    <div class="blk"><h3>How sure</h3><p class="conf"><span class="dots">${DOTS[l.sure] || ""}</span><span><b>${esc(l.sure || "")}.</b> ${esc(how)}</span></p></div>
    <details class="fold"><summary>${(l.all || []).length > 1 ? `The ${(l.all || []).length} latest reports` : "Source"}</summary><ul>${reports}</ul></details>
    ${(doc.markets || []).length ? `<details class="fold"><summary>Market numbers</summary>${ticker(doc.markets)}</details>` : ""}
    <p class="last">Information only. You decide and place every order.</p></article>`;
  window.scrollTo(0, 0);
}
