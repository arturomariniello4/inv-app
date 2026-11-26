// Charts (Artu, 26 Nov 2026): the paper portfolio going up and down with the moves, the real Trading 212 account,
// and the price history of everything on Your moves, with INV's calls marked on it.
// The data (inv/charts.py) rides in the evening briefing's encrypted box, so only this phone can read it; nothing
// is fetched from anywhere else. Drawn here as plain SVG lines: touch and slide along a chart to read a day.
// Loaded before app.js, which supplies esc, cache, briefings and view; pfMoney comes from portfolio.js.
// Information only: the app never trades.
const CH_RANGES = [["1M", 31], ["3M", 92], ["6M", 183], ["1Y", 366], ["2Y", 9999]];
const chState = { pf: "paper", ranges: {} };
try { Object.assign(chState, JSON.parse(localStorage.getItem("inv-charts") || "{}")); } catch (_) {}
const chSave = () => { try { localStorage.setItem("inv-charts", JSON.stringify(chState)); } catch (_) {} };
const chData = new Map();                    // chart id -> what the touch layer needs

function chartsLatest() {
  const m = briefings().find((b) => b.doc && b.doc.charts);
  return m ? m.doc.charts : null;
}
const DAY = 86400000;
const chDay = (iso) => Date.parse(String(iso).slice(0, 10) + "T12:00:00Z");
const chTime = (s) => Date.parse(s.length > 10 ? s + ":00" : s + "T12:00:00");   // Luxembourg wall time
function chDate(t, withTime) {
  const d = new Date(t), thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", withTime ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
    : thisYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}
function chNum(x) {
  if (x == null) return "n/a";
  const a = Math.abs(x);
  return x.toLocaleString("en-GB", { maximumFractionDigits: a >= 1000 ? 0 : a >= 10 ? 2 : 3, minimumFractionDigits: a >= 1000 ? 0 : 2 });
}
const chCur = (c) => ({ USD: "$", EUR: "€", GBP: "£", GBp: "p", CHF: "CHF ", JPY: "¥" }[c] ?? (c ? c + " " : ""));
const chPrice = (x, cur) => cur === "GBp" ? chNum(x) + "p" : chCur(cur) + chNum(x);
const chPct = (x) => x == null || !isFinite(x) ? "" : (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(1) + "%";
const chEur = (x) => (x < 0 ? "−" : "+") + "€" + Math.abs(x).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// One line chart. series: [{name, ts [ms], ys, kind: "main"|"twin"}]; zero: draw the 0 line; marks: [[ms, label]].
function lineChart(id, series, o = {}) {
  const W = 340, H = o.h || 170, L = 4, R = 46, T = 12, B = 22;
  const all = series.flatMap((s) => s.ys).concat(o.zero ? [0] : []);
  const ts = series.flatMap((s) => s.ts);
  if (!ts.length) return "";
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1e-9) { const pad = Math.abs(hi) * 0.01 || 1; lo -= pad; hi += pad; }
  const padY = (hi - lo) * 0.08; lo -= padY; hi += padY;
  const t0 = Math.min(...ts), t1 = Math.max(...ts) === t0 ? t0 + DAY : Math.max(...ts);
  const X = (t) => L + (t - t0) / (t1 - t0) * (W - L - R), Y = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
  const path = (s) => s.ts.map((t, i) => (i ? "L" : "M") + X(t).toFixed(1) + "," + Y(s.ys[i]).toFixed(1)).join("");
  const fmt = o.fmt || chNum;
  const ticks = [hi - padY, (hi + lo) / 2, lo + padY];
  const grid = ticks.map((v) => `<line class="cg" x1="${L}" x2="${W - R + 4}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>
    <text class="cy" x="${W - R + 8}" y="${(Y(v) + 3.5).toFixed(1)}">${esc(fmt(v, true))}</text>`).join("");
  const zero = o.zero ? `<line class="cz" x1="${L}" x2="${W - R + 4}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>` : "";
  const main = series[0];
  const area = o.area !== false && main.ts.length > 1 ? `<path class="ca" d="${path(main)}L${X(main.ts.at(-1)).toFixed(1)},${(o.zero ? Y(0) : H - B).toFixed(1)}L${X(main.ts[0]).toFixed(1)},${(o.zero ? Y(0) : H - B).toFixed(1)}Z"/>` : "";
  const lines = series.slice().reverse().map((s) => s.ts.length > 1 ? `<path class="cl ${s.kind || "main"}" d="${path(s)}"/>`
    : `<circle class="cdot ${s.kind || "main"}" cx="${X(s.ts[0]).toFixed(1)}" cy="${Y(s.ys[0]).toFixed(1)}" r="3.5"/>`).join("");
  const near = (t) => { let k = 0; main.ts.forEach((x, i) => { if (Math.abs(x - t) < Math.abs(main.ts[k] - t)) k = i; }); return k; };
  const marks = (o.marks || []).filter(([t]) => t >= t0 - DAY && t <= t1 + DAY).map(([t, label, cls]) => {
    const k = near(t);
    return `<g class="cm ${cls || ""}"><circle cx="${X(main.ts[k]).toFixed(1)}" cy="${Y(main.ys[k]).toFixed(1)}" r="4.5"/></g>`;
  }).join("");
  const xl = `<text class="cx" x="${L}" y="${H - 6}">${esc(chDate(t0, o.withTime))}</text>
    <text class="cx" x="${W - R}" y="${H - 6}" text-anchor="end">${esc(chDate(t1, o.withTime))}</text>`;
  chData.set(id, { series, X, Y, W, H, T, B, fmt, withTime: o.withTime, marks: o.marks || [], note: o.note });
  return `<div class="chart" data-chart="${esc(id)}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || main.name)}">${grid}${zero}${area}${lines}${marks}${xl}
      <line class="ch-x hidden" y1="${T}" y2="${H - B}"/><circle class="ch-p hidden" r="5"/></svg>
    <div class="ctip hidden"></div></div>`;
}

function chLegend(series) {
  if (series.length < 2) return "";
  return `<div class="clegend">${series.map((s) => `<span><i class="${s.kind || "main"}"></i>${esc(s.name)}</span>`).join("")}</div>`;
}
function chChips(id, ranges, on) {
  return `<div class="cchips">${ranges.map(([k]) => `<button data-crange="${esc(id)}|${k}" class="${k === on ? "on" : ""}">${k}</button>`).join("")}</div>`;
}

// ---- Touch: slide along a chart to read a day ---------------------------------------------------
function chScrub(el, clientX) {
  const d = chData.get(el.dataset.chart);
  if (!d) return;
  const svg = el.querySelector("svg"), r = svg.getBoundingClientRect();
  const x = (clientX - r.left) / r.width * d.W;
  const main = d.series[0];
  let k = 0;
  main.ts.forEach((t, i) => { if (Math.abs(d.X(t) - x) < Math.abs(d.X(main.ts[k]) - x)) k = i; });
  const t = main.ts[k], px = d.X(t), py = d.Y(main.ys[k]);
  const line = svg.querySelector(".ch-x"), dot = svg.querySelector(".ch-p"), tip = el.querySelector(".ctip");
  line.setAttribute("x1", px); line.setAttribute("x2", px); dot.setAttribute("cx", px); dot.setAttribute("cy", py);
  const rows = d.series.map((s) => {
    let j = 0; s.ts.forEach((u, i) => { if (Math.abs(u - t) < Math.abs(s.ts[j] - t)) j = i; });
    return `<div><i class="${s.kind || "main"}"></i>${esc(s.name)} <b>${esc(d.fmt(s.ys[j]))}</b></div>`;
  }).join("");
  const calls = d.marks.filter(([u]) => Math.abs(u - t) < DAY * (main.ts.length > 200 ? 4 : 1)).map(([, label]) => `<div class="cc">${esc(label)}</div>`).join("");
  tip.innerHTML = `<div class="cd">${esc(chDate(t, d.withTime))}</div>${rows}${d.note ? d.note(k) : ""}${calls}`;
  [line, dot, tip].forEach((n) => n.classList.remove("hidden"));
  const left = px / d.W * r.width;
  tip.style.left = Math.max(0, Math.min(r.width - tip.offsetWidth, left - tip.offsetWidth / 2)) + "px";
}
function chEnd(el) {
  el.querySelectorAll(".ch-x,.ch-p,.ctip").forEach((n) => n.classList.add("hidden"));
}
document.addEventListener("pointerdown", (e) => {
  const el = e.target.closest(".chart");
  if (!el) return;
  chScrub(el, e.clientX);
  const move = (ev) => chScrub(el, ev.clientX);
  const up = () => { chEnd(el); removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); };
  addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-crange],[data-cpf]");
  if (!b) return;
  if (b.dataset.cpf) chState.pf = b.dataset.cpf;
  else { const [id, k] = b.dataset.crange.split("|"); chState.ranges[id] = k; }
  chSave();
  const box = b.closest("[data-cbox]");
  if (box) box.outerHTML = box.dataset.cbox === "pf" ? pfChartBox() : priceBox(box.dataset.cbox);
});

// ---- The Portfolio tab: paper portfolio or real account -----------------------------------------
function pfChartBox() {
  const c = chartsLatest();
  if (!c || (!c.pp && !c.rl)) return "";
  const which = chState.pf === "real" && c.rl ? "real" : c.pp ? "paper" : "real";
  const seg = c.pp && c.rl ? `<div class="cseg"><button data-cpf="paper" class="${which === "paper" ? "on" : ""}">Paper portfolio</button>
    <button data-cpf="real" class="${which === "real" ? "on" : ""}">Trading 212</button></div>` : "";
  let body = "";
  if (which === "paper") {
    const p = c.pp, ts = p.d.map(chDay), last = p.v.length - 1;
    const gain = p.v.map((v, i) => +(v - p.in[i]).toFixed(2)), wgain = p.w.map((v, i) => +(v - p.in[i]).toFixed(2));
    const series = [{ name: "Your moves", ts, ys: gain, kind: "main" }, { name: "World ETF instead", ts, ys: wgain, kind: "twin" }];
    const marks = (p.ev || []).map(([d, s, n]) => [chDay(d), (s === "B" ? "Bought " : "Sold ") + n, s === "S" ? "sell" : "buy"]);
    const vs = gain[last] - wgain[last];
    const days = Math.round((ts[last] - ts[0]) / DAY);
    body = `<div class="chead"><span class="kicker">Paper portfolio · gain or loss</span>
        <b class="${gain[last] >= 0 ? "up" : "down"}">${chEur(gain[last])}</b>
        <span class="muted">${esc(chPct(gain[last] / p.in[last]))} on €${chNum(p.in[last])} of paper money ·
          <span class="${vs >= 0 ? "up" : "down"}">${chEur(vs)} vs the World ETF</span></span></div>
      ${lineChart("pp", series, { zero: true, area: false, fmt: (v) => chEur(v), marks, label: "Paper portfolio gain or loss",
        note: (k) => `<div class="cn">Value €${chNum(p.v[k])} · put in €${chNum(p.in[k])}</div>` })}
      ${chLegend(series)}
      <p class="muted">Since ${esc(chDate(ts[0]))}, when paper trading began${days ? ` (${days} day${days === 1 ? "" : "s"})` : ""}: there is no history before that.
        Each Buy puts €${chNum(p.per || 1000)} of paper money in (half for a first step of two), at the price the moves engine saw;
        a Sell turns it into cash. "World ETF instead" puts the same money in the World ETF on the same days.
        Prices in each fund's own currency. Dots are the buys and sells.</p>`;
  } else {
    const r = c.rl, all = r.t.map(chTime);
    const rk = chState.ranges.rl || "1W", from = rk === "1W" ? all.at(-1) - 7 * DAY : -Infinity;
    const keep = all.map((t, i) => i).filter((i) => all[i] >= from);
    const ts = keep.map((i) => all[i]), ys = keep.map((i) => r.v[i]);
    const ch = ys.length > 1 ? ys.at(-1) - ys[0] : 0;
    const money = (v) => typeof pfMoney === "function" ? pfMoney(v, "EUR") : "€" + chNum(v);
    body = `<div class="chead"><span class="kicker">Trading 212 · account value</span><b>${money(r.v.at(-1))}</b>
        <span class="muted"><span class="${ch >= 0 ? "up" : "down"}">${typeof pfHide !== "undefined" && pfHide ? "" : chEur(ch)} ${esc(chPct(ys[0] ? ch / ys[0] : null))}</span>
          over ${rk === "1W" ? "the last week" : "all the snapshots"}</span></div>
      ${chChips("rl", [["1W"], ["All"]], rk)}
      ${lineChart("rl", [{ name: "Account value", ts, ys }], { withTime: true, fmt: (v) => money(v), label: "Trading 212 account value" })}
      <p class="muted">From the read-only snapshots, about every 2 hours for the last week and one a day before.
        Deposits and withdrawals show as jumps. First snapshot ${esc(chDate(all[0]))}.</p>`;
  }
  return `<div class="isec cbox" data-cbox="pf">${seg}<div class="box">${body}</div></div>`;
}

// Small price rows for the Portfolio tab: everything on Your moves, last 3 months, tap for the move card.
function spark(xs, ys) {
  if (ys.length < 2) return "";
  const lo = Math.min(...ys), hi = Math.max(...ys), w = 64, h = 22;
  const d = ys.map((y, i) => (i ? "L" : "M") + (i / (ys.length - 1) * w).toFixed(1) + "," + (h - 2 - (y - lo) / ((hi - lo) || 1) * (h - 4)).toFixed(1)).join("");
  return `<svg class="spark ${ys.at(-1) >= ys[0] ? "up" : "down"}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}"/></svg>`;
}
function chAsset(a) {
  const d0 = chDay(a.d0);
  return { ts: a.x.map((x) => d0 + x * DAY), ys: a.y };
}
function pricesList() {
  const c = chartsLatest();
  if (!c || !(c.a || []).length) return "";
  const rows = c.a.map((a) => {
    const { ts, ys } = chAsset(a), from = ts.at(-1) - 92 * DAY;
    const k = ts.findIndex((t) => t >= from), chg = ys.at(-1) / ys[k] - 1;
    return `<button class="crow" data-move="${esc(a.i)}"><span><b>${esc(a.n)}</b>${a.tk ? ` <span class="tk">${esc(a.tk)}</span>` : ""}</span>
      ${spark(ts.slice(k), ys.slice(k))}<span class="cv"><b>${esc(chPrice(ys.at(-1), a.cur))}</b><span class="${chg >= 0 ? "up" : "down"}">${esc(chPct(chg))} 3M</span></span></button>`;
  }).join("");
  return `<div class="isec"><h4>Prices <span>last 3 months · tap for the chart</span></h4><div class="box">${rows}</div></div>`;
}

// ---- The price chart on a move card -------------------------------------------------------------
function priceBox(id) {
  const c = chartsLatest(), a = c && (c.a || []).find((x) => x.i === id);
  if (!a) return "";
  const { ts, ys } = chAsset(a), rk = chState.ranges[id] || chState.ranges.price || "6M";
  const days = (CH_RANGES.find(([k]) => k === rk) || CH_RANGES[2])[1], from = ts.at(-1) - days * DAY;
  const keep = ts.map((t, i) => i).filter((i) => ts[i] >= from);
  const kt = keep.map((i) => ts[i]), ky = keep.map((i) => ys[i]);
  const chg = ky.at(-1) / ky[0] - 1, hi = Math.max(...ky), lo = Math.min(...ky);
  const marks = (a.ev || []).map(([d, mv]) => [chDay(d), "INV said " + mv, /SELL|TRIM/.test(mv) ? "sell" : /BUY/.test(mv) ? "buy" : "wait"]);
  const span = Math.round((ts.at(-1) - ts[0]) / DAY);
  const ranges = CH_RANGES.filter(([, n], i) => i === 0 || n <= span + 40 || CH_RANGES[i - 1][1] < span);
  const calls = marks.filter(([t]) => t >= kt[0] - DAY).map(([t, l]) => `${chDate(t)}: ${l.replace("INV said ", "")}`).join(" · ");
  return `<div class="mbox cbox" data-cbox="${esc(id)}"><h3>Price · ${esc(a.sym || a.tk || "")}${a.cur ? " · " + esc(a.cur) : ""}</h3>
    <div class="chead sm"><b>${esc(chPrice(ky.at(-1), a.cur))}</b>
      <span class="${chg >= 0 ? "up" : "down"}">${esc(chPct(chg))}</span> <span class="muted">over ${rk === "2Y" ? "2 years" : rk}</span></div>
    ${chChips(id, ranges, rk)}
    ${lineChart("p-" + id, [{ name: a.n, ts: kt, ys: ky }], { fmt: (v) => chPrice(v, a.cur), marks, label: a.n + " price" })}
    <div class="kv"><span>Range high · low</span><span>${esc(chPrice(hi, a.cur))} · ${esc(chPrice(lo, a.cur))}</span></div>
    ${calls ? `<div class="kv"><span>INV's calls (dots)</span><span>${esc(calls)}</span></div>` : ""}
    <p class="muted">Daily closes, adjusted for splits and dividends${days > 92 ? "; one a week before the last 3 months" : ""}.
      Updated with each evening briefing. Price only: the move above weighs much more than this line.</p></div>`;
}
