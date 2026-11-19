// Ideas tab (Layer 8): companies ranked from their filings. The data arrives once a day by encrypted push
// (kind "ideas") and is laid out here. Loaded before app.js, which supplies esc, safeUrl, bar and go.
// Information only: the strongest label is "Worth a deep dive"; you decide and place any order.
const FAM = [["quality", "Quality"], ["strength", "Strength"], ["growth", "Growth"], ["value", "Value"], ["owners", "Owners"]];
const LABEL = { worth_a_deep_dive: ["Worth a deep dive", "go"], watch: ["Watch", "watch"], screened_out: ["Screened out", "out"] };
let ideasSeg = "must", ideasSort = "rank";
try { ideasSeg = localStorage.getItem("inv-ideas-seg") || "must"; } catch (_) {}

const pct = (x, d = 1) => x == null ? "n/a" : (x * 100).toFixed(d) + "%";
const num = (x, d = 2) => x == null ? "n/a" : Number(x).toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d });
function money(x) {
  if (x == null) return "n/a";
  return Math.abs(x) >= 1e9 ? (x / 1e9).toFixed(1) + "bn" : Math.round(x / 1e6) + "m";
}
function labelTag(lab) { const [t, c] = LABEL[lab] || [lab, ""]; return `<span class="tag ${c}">${esc(t)}</span>`; }
function moveTag(mv) {
  if (mv === "new") return '<span class="mv new">new</span>';
  if (!mv) return '<span class="mv">±0</span>';
  return mv > 0 ? `<span class="mv up">▲${mv}</span>` : `<span class="mv down">▼${-mv}</span>`;
}

function radar(c, size) {
  const r = size / 2 - (size > 120 ? 52 : 6), cx = size / 2, cy = size / 2;
  const pt = (i, f) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return [cx + r * f * Math.cos(a), cy + r * f * Math.sin(a)]; };
  const ring = (f) => FAM.map((_, i) => pt(i, f).map((v) => v.toFixed(1)).join(",")).join(" ");
  const shape = FAM.map(([k], i) => pt(i, Math.max(0.04, ((c.g[k] || [])[0] ?? 0) / 100)).map((v) => v.toFixed(1)).join(",")).join(" ");
  const labels = size > 120 ? FAM.map(([k, name], i) => { const [x, y] = pt(i, 1.25); return `<text x="${x.toFixed(0)}" y="${(y + 4).toFixed(0)}" text-anchor="middle">${name} ${esc((c.g[k] || [])[1] || "–")}</text>`; }).join("") : "";
  const tone = c.lab === "worth_a_deep_dive" ? "var(--up)" : c.lab === "watch" ? "var(--accent)" : "var(--muted)";
  return `<svg class="radar" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Score shape: ${FAM.map(([k, n]) => n + " " + ((c.g[k] || [])[1] || "none")).join(", ")}">
    <polygon points="${ring(1)}" fill="none" stroke="var(--line)"/><polygon points="${ring(0.5)}" fill="none" stroke="var(--line)"/>
    <polygon points="${shape}" fill="${tone}" fill-opacity=".22" stroke="${tone}" stroke-width="1.6"/>${labels}</svg>`;
}

// The company's own logo on the list (its score shape is on the company page); the shape when no logo is
// bundled or the image fails to load (e.g. offline before it was ever cached).
function mark(c) {
  const f = typeof LOGOS !== "undefined" && LOGOS[c.t];
  if (!f) return radar(c, 64);
  return `<div class="logo"><img src="logos/${esc(f)}" alt="${esc(c.name)} logo" loading="lazy"
    onerror="this.parentNode.outerHTML=this.parentNode.querySelector('template').innerHTML">
    <template>${radar(c, 64)}</template></div>`;
}

function heldTag(c) { return c.held ? '<span class="held">You hold it</span>' : ""; }

function gradeChips(c) {
  return `<div class="grades">${FAM.map(([k, n]) => { const [s, g] = c.g[k] || []; return `<div class="g${esc(g || "x")}"><b>${esc(g || "–")}</b>${n}${s == null ? "" : `<i>${s}</i>`}</div>`; }).join("")}</div>`;
}

function meters(c) {
  const m = (label, v, cls) => `<div class="meter"><span>${label}</span><div><i class="${cls}" style="width:${v ?? 0}%"></i></div><b>${v ?? "–"}</b></div>`;
  return `<div class="meters">${m("Heat", c.h, "heat")}${m("Strength", c.s, "str")}</div>`;
}

function drivers(c) {
  if (!(c.dr || []).length) return "";
  const s = { "+": ["p", "+"], "-": ["n", "−"], o: ["o", "•"] };
  return `<ul class="dr">${c.dr.map(([sign, text, url]) => `<li><b class="${(s[sign] || s.o)[0]}">${(s[sign] || s.o)[1]}</b><span>${url ? `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text)}</span></li>`).join("")}</ul>`;
}

function card(c, opts = {}) {
  return `<div class="card idea" role="button" tabindex="0" data-idea="${esc(c.t)}">
    <div class="top">${mark(c)}<div>
      <div class="rk">${c.r ? `<b>#${c.r}</b>${moveTag(c.mv)}` : ""}${labelTag(c.lab)}</div>
      <h3>${esc(c.name)} <span class="tk">${esc(c.t)}</span>${heldTag(c)}</h3>
      <div class="muted">${esc(c.role)}${c.sec ? " · " + esc(c.sec) : ""} · return ${pct(c.er.b)} vs ${pct(c.hur, 0)} bar</div></div></div>
    ${opts.gap ? `<p class="gap"><b>But:</b> ${esc(c.gap)}</p>` : meters(c) + drivers(c)}
  </div>`;
}

function fastList(cos) {
  const key = { rank: (c) => c.r || 1e4, heat: (c) => -(c.h || 0), strength: (c) => -(c.s || 0), ret: (c) => -((c.er.b ?? -1) - c.hur), t: (c) => c.t };
  const rows = [...cos].sort((a, b) => { const x = key[ideasSort](a), y = key[ideasSort](b); return x < y ? -1 : x > y ? 1 : 0; });
  const th = (k, label) => `<th><button data-sort="${k}" class="${ideasSort === k ? "on" : ""}">${label}</button></th>`;
  return `<div class="box flush"><table class="fast"><thead><tr>${th("t", "Company")}<th>Q S G V O</th>${th("ret", "Return")}${th("heat", "Heat")}${th("strength", "Str")}</tr></thead><tbody>
    ${rows.map((c) => `<tr data-idea="${esc(c.t)}"><td>${typeof LOGOS !== "undefined" && LOGOS[c.t] ? `<img class="tlogo" src="logos/${esc(LOGOS[c.t])}" alt="" loading="lazy" onerror="this.remove()">` : ""}<b>${esc(c.t)}</b>${c.held ? ' <span class="held">held</span>' : ""} <span class="dotl ${(LABEL[c.lab] || [])[1] || ""}"></span></td>
      <td class="lt">${FAM.map(([k]) => `<span class="g${esc((c.g[k] || [])[1] || "x")}">${esc((c.g[k] || [])[1] || "–")}</span>`).join("")}</td>
      <td class="${c.er.b != null && c.er.b >= c.hur ? "up" : ""}">${pct(c.er.b)}</td><td>${c.h ?? "–"}</td><td>${c.s ?? "–"}</td></tr>`).join("")}
    </tbody></table></div><p class="muted fine">Return: expected yearly return in the base case; green when it clears your bar (8% core, 15% satellite). Tap a column to sort.</p>`;
}

function raisesBlock(doc) {
  if (!(doc.raises || []).length) return "";
  return `<section class="isec"><h4>Private companies raising money <span>SEC Form D, last 30 days</span></h4><div class="box"><ul class="ev">
    ${doc.raises.map((r) => `<li><span><b>${esc(r.name)}</b><br><span class="muted">${esc(r.ind)}${r.where ? " · " + esc(r.where) : ""}${r.people.length ? " · " + esc(r.people.join(", ")) : ""}</span></span>
      <span class="r"><b>${money(r.sold || r.offered)} $</b>${r.sold ? "" : " offered"}<br><a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">Filing</a></span></li>`).join("")}
    </ul></div><p class="muted fine">Official notices only, no rumours. Private shares are not something you can buy here; they show where money is going.</p></section>`;
}

function trackBlock(doc) {
  const t = doc.track || {};
  const body = t.outcomes ? `<div class="kv"><span>Rankings scored after 12 months</span><span>${t.outcomes}</span></div>
      <div class="kv"><span>Top 10 beat the world ETF</span><span>${pct(t.top10_beat_share, 0)}</span></div>
      <div class="kv"><span>Top 10, average lead over the ETF</span><span>${pct(t.top10_avg_excess)}</span></div>
      <div class="kv"><span>Forecast error (Brier, lower is better)</span><span>${t.brier ?? "n/a"}</span></div>`
    : `<p class="muted">Every ranking is saved before its outcome is known and checked against the world ETF after 3, 6 and 12 months. The first 12-month results arrive in November 2027.</p>`;
  return `<section class="isec"><h4>Track record <span>${t.enough_to_trust ? "enough results to judge" : "too few results to trust yet"}</span></h4><div class="box">${body}</div></section>`;
}

function ideasDoc(cache) {
  const m = cache.find((x) => x.kind === "ideas" && x.doc);
  return m ? m.doc : null;
}

function ideasView(cache) {
  const doc = ideasDoc(cache);
  if (!doc) {
    view().innerHTML = bar("Ideas") + `<div class="empty"><h2>Your ranked list arrives with the midday read</h2>
      <p class="muted">Every day at about 11:45, the companies on your watchlist are ranked from their official filings: what is worth reading now, and what is strong but held back by one weak point. Tap a company for its grades, value range and statements.</p></div>`;
    return;
  }
  const by = Object.fromEntries(doc.co.map((c) => [c.t, c]));
  const worth = doc.co.filter((c) => c.lab === "worth_a_deep_dive").length;
  const seg = (k, label, n) => `<button data-seg="${k}" class="${ideasSeg === k ? "on" : ""}">${label}${n != null ? ` <i>${n}</i>` : ""}</button>`;
  let body;
  if (ideasSeg === "but") {
    const list = doc.but.map((t) => by[t]).filter(Boolean);
    body = `<p class="lede">Strong businesses with exactly one weak point. Each could become great if that point improves.</p>`
      + (list.length ? list.map((c) => card(c, { gap: true })).join("") : '<p class="muted pad">None today.</p>');
  } else if (ideasSeg === "all") {
    body = fastList(doc.co);
  } else {
    const list = doc.must.map((t) => by[t]).filter(Boolean);
    body = `<p class="lede">Solid companies ranked by how much has just happened that is worth reading. Heat fades by half every two weeks.</p>`
      + (list.length ? list.map((c) => card(c)).join("") : '<p class="muted pad">Nothing reaches the bar today.</p>');
  }
  view().innerHTML = bar("Ideas") + `<p class="sub">${esc(doc.date)} · ${worth} worth a deep dive · ${doc.co.length} companies</p>
    <div class="seg3">${seg("must", "Must read", doc.must.length)}${seg("but", "Attractive, but…", doc.but.length)}${seg("all", "All")}</div>
    ${body}${raisesBlock(doc)}${trackBlock(doc)}
    ${doc.cut ? `<p class="muted fine">${doc.cut} screened-out companies were left out to fit the phone; the Saturday report lists them.</p>` : ""}
    <p class="last">Information only. The strongest label is “worth a deep dive”, never “buy”. You decide and place every order.</p>`;
}

function valueBar(c) {
  const d = c.d, v = d.vr || {};
  if (d.px == null || v.c == null) return `<p class="muted">${esc(d.note || "No value range yet: the price or the cash figures are missing.")}</p>`;
  const top = Math.max(d.px, v.u ?? v.b ?? v.c) * 1.25, lo = 0;
  const x = (p) => Math.max(0, Math.min(100, (p - lo) / (top - lo) * 100)).toFixed(1);
  const seg = (a, b, cls) => `<span class="${cls}" style="left:${x(a)}%;width:${(x(b) - x(a)).toFixed(1)}%"></span>`;
  const where = d.px < v.c ? "below the whole range: even the cautious case clears your bar"
    : v.b != null && d.px < v.b ? "inside the range: the base case clears your bar"
    : v.u == null || d.px < v.u ? "above the base value: only the upbeat case clears your bar" : "above the whole range: no case clears your bar";
  return `<div class="pv"><div class="pvbar">${seg(0, v.c, "z1")}${v.b != null ? seg(v.c, v.b, "z2") : ""}${seg(v.b ?? v.c, v.u ?? top, "z3")}${v.u != null ? seg(v.u, top, "z4") : ""}<i style="left:${x(d.px)}%"></i></div>
    <div class="lab"><span>Cautious ${num(v.c)}</span><span>Base ${v.b == null ? "no limit" : num(v.b)}</span><span>Upbeat ${v.u == null ? "no limit" : num(v.u)}</span></div>
    <p>Price <b>${num(d.px)} ${esc(d.cur)}</b> (${esc(d.asof)}) is ${where}.</p></div>`;
}

function cases(c) {
  const d = c.d, plus = (c.dr || []).filter((x) => x[0] === "+").map((x) => x[1]);
  const minus = (c.dr || []).filter((x) => x[0] === "-").map((x) => x[1]).concat(c.gap ? [c.gap] : [], c.flags || []);
  const up = [`If sales grow ${pct(d.gr.u)} a year: about ${pct(c.er.u)} a year for you`].concat(plus);
  const down = [`If growth slows to ${pct(d.gr.c)}: about ${pct(c.er.c)} a year`].concat(d.ig != null ? [`The price already assumes ${pct(d.ig, 0)} growth for ten years`] : [], minus);
  const li = (a) => a.slice(0, 4).map((t) => `<li>${esc(t)}</li>`).join("");
  return `<div class="rr"><div><h5 class="up">Bull case</h5><ul class="plain">${li(up)}</ul></div><div><h5 class="down">Bear case</h5><ul class="plain">${li(down)}</ul></div></div>`;
}

function checks(c) {
  const icon = { pass: ["y", "✓"], fail: ["n", "✕"], unknown: ["u", "?"] };
  return `<div class="checks">${c.d.chk.map(([id, q, a, v, need]) => { const [cls, ch] = icon[a] || icon.unknown;
    return `<div class="chk"><span class="dot ${cls}">${ch}</span><span><div class="q">${esc(q)}</div><div class="a">${a === "unknown" ? "Check by hand" : a === "pass" ? "Yes" : "Not yet"} · needs ${esc(need)}</div></span><span class="v">${esc(v)}</span></div>`; }).join("")}</div>`;
}

function statementsBlock(st) {
  if (!st) return '<p class="muted">No yearly figures yet.</p>';
  const max = Math.max(1, ...st.rows.flatMap((r) => r[1].map((v) => Math.abs(v || 0))));
  return `<div class="stt"><table><thead><tr><th>${esc(st.cur)} m</th>${st.y.map((y) => `<th>${esc(y)}</th>`).join("")}</tr></thead><tbody>
    ${st.rows.map(([label, vals]) => `<tr><td>${esc(label)}</td>${vals.map((v) => `<td><i style="height:${v == null ? 0 : Math.max(2, Math.abs(v) / max * 22).toFixed(0)}px" class="${v < 0 ? "neg" : ""}"></i>${v == null ? "–" : Math.round(v).toLocaleString("en-GB")}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div>`;
}

function ideaDetail(cache, ticker) {
  const doc = ideasDoc(cache), c = doc && doc.co.find((x) => x.t === ticker);
  if (!c) return ideasView(cache);
  const head = `${bar(c.t, "ideas")}<div class="hero2">${radar(c, 220)}<div>
      <div class="rk">${c.r ? `<b>#${c.r} must read</b>${moveTag(c.mv)}` : ""}${labelTag(c.lab)}</div>
      <h2>${esc(c.name)}</h2>${heldTag(c)}<div class="muted">${esc(c.t)} · ${esc(c.role)}${c.sec ? " · " + esc(c.sec) : ""} · ${esc(c.conf)} confidence</div></div></div>
    ${gradeChips(c)}<div class="note2"><b>Our view.</b> ${esc(c.verdict)}</div>${meters(c)}`;
  if (!c.d) {
    view().innerHTML = head + `<p class="muted pad">The full detail did not fit today's push; it is in the Saturday report.</p>`;
    return window.scrollTo(0, 0);
  }
  const d = c.d, r = d.rules || {};
  const ev = (d.ev || []).length ? `<ul class="ev">${d.ev.map(([date, kind, text, url, red]) => `<li><span>${red ? '<b class="down">Warning:</b> ' : ""}${esc(text)}<br><span class="muted">${esc(date)} · ${esc(kind.replace("_", " "))}</span></span><a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">Filing</a></li>`).join("")}</ul>`
    : '<p class="muted">No filings in the last four months that move the ranking.</p>';
  view().innerHTML = head + `
    <section class="isec"><h4>Price and value range <span>at your ${pct(c.hur, 0)} bar</span></h4><div class="box">${valueBar(c)}</div></section>
    <section class="isec"><h4>Bull and bear case</h4><div class="box">${cases(c)}</div></section>
    <section class="isec"><h4>Screen, in plain words <span>Stage 1 of your checklist</span></h4><div class="box">${checks(c)}</div></section>
    <section class="isec"><h4>Key figures</h4><div class="box">${(d.m || []).map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("") || '<p class="muted">Not enough figures yet.</p>'}
      ${d.cy != null ? `<div class="kv"><span>Cash yield (${esc(d.yk)})</span><span>${pct(d.cy)}</span></div>` : ""}
      ${d.sy != null ? `<div class="kv"><span>Dividends and buybacks yield</span><span>${pct(d.sy)}</span></div>` : ""}
      ${d.mv_eur ? `<div class="kv"><span>Market value</span><span>${money(d.mv_eur)} €</span></div>` : ""}</div></section>
    <section class="isec"><h4>Events and people <span>official filings</span></h4><div class="box">${ev}</div></section>
    <section class="isec"><h4>Statements <span>yearly</span></h4><div class="box">${statementsBlock(d.st)}</div></section>
    <section class="isec"><h4>What your rules allow</h4><div class="box">
      <div class="kv"><span>First buy if you go ahead</span><span>${pct(r.first_buy, 0)} of the portfolio</span></div>
      <div class="kv"><span>Stress budget allows now</span><span>${pct(r.allowed, 1)}</span></div>
      ${r.sat != null ? `<div class="kv"><span>Satellite room left</span><span>${pct(r.sat, 1)}</span></div>` : ""}
      ${r.note ? `<p class="muted">${esc(r.note)}</p>` : ""}
      <p class="muted">Next step is Stage 2 of your checklist: read the annual report, write your own bull and bear case, then decide. No first-day IPO buys; paper trading first.</p></div></section>
    ${(c.flags || []).length ? `<section class="isec"><h4>Warning signs</h4><div class="box"><ul class="plain">${c.flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div></section>` : ""}
    <p class="by">Source: ${esc(d.src)}. Prices: Stooq or Yahoo Finance. Grades compare against the other companies in your list.</p>
    <p class="last">Information only. You decide and place every order.</p>`;
  window.scrollTo(0, 0);
}

function setIdeasSeg(k) { ideasSeg = k; try { localStorage.setItem("inv-ideas-seg", k); } catch (_) {} }
function setIdeasSort(k) { ideasSort = k; }
