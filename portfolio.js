// Portfolio tab: Artu's real Trading 212 positions (read only) and the risk check run on them.
// The data rides inside the evening briefing, which arrives by encrypted web push (or an encrypted box),
// so it is only ever readable on this phone; the public app files hold none of it.
// Loaded before app.js, which supplies esc, bar, when and briefings. Information only: the app never trades.
const SLEEVE = { core: "Core", satellite: "Satellite" };
const CLASS = { global_equity: "World shares", euro_govt_3_7y: "Euro govt bonds", gold: "Gold", quality_stock: "Quality share",
  speculative_stock: "Speculative share", crypto: "Crypto", cash: "Cash" };
const STATUS = { ok: ["OK", "y"], warn: ["Warn", "u"], act: ["Act", "n"], "no data": ["n/a", "u"] };
let pfHide = false;
try { pfHide = localStorage.getItem("inv-pf-hide") === "1"; } catch (_) {}

function pfLatest() {
  const m = briefings().find((b) => b.doc && b.doc.portfolio);
  return m ? m.doc.portfolio : null;
}
const ppct = (x, d = 1) => x == null ? "n/a" : (x * 100).toFixed(d) + "%";
function pfMoney(x, cur) {
  if (x == null) return "n/a";
  if (pfHide) return "•••";
  return Number(x).toLocaleString("en-GB", { style: "currency", currency: cur || "EUR", maximumFractionDigits: Math.abs(x) < 100 ? 2 : 0 });
}

function gauge(loss, limit) {
  // 0 to 100%, the 30% limit marked; the fill turns red past the limit
  const w = Math.min(1, Math.max(0, loss || 0)), l = Math.min(1, limit);
  return `<div class="pg"><i class="${(loss || 0) > limit ? "over" : (loss || 0) > limit * 0.9 ? "near" : ""}" style="width:${(w * 100).toFixed(1)}%"></i>
    <b style="left:${(l * 100).toFixed(1)}%"></b></div>
    <div class="pg-l"><span>0%</span><span style="left:${(l * 100).toFixed(1)}%">limit ${ppct(limit, 0)}</span><span>100%</span></div>`;
}

function portfolioView() {
  const p = pfLatest();
  const charts = typeof pfChartBox === "function" ? pfChartBox() + pricesList() : "";   // charts.js
  if (!p) {
    view().innerHTML = bar("Portfolio") + charts + `<div class="empty"><h2>No positions yet</h2>
      <p class="muted">Your Trading 212 positions arrive with the next evening briefing, once the read-only link has taken a snapshot.
      The risk check then runs on what you really hold instead of the example portfolio.</p></div>`;
    return;
  }
  const cur = p.cur || "EUR", st = p.stress || {}, sat = p.sat || {};
  const over = (st.loss || 0) > st.limit;
  const names = st.names || {};
  const scen = Object.entries(st.by || {}).map(([k, v]) => `<div class="kv"><span>${esc(names[k] || k)}</span>
    <span class="${v > st.limit ? "down" : ""}">−${ppct(v)}</span></div>`).join("");
  const pos = (p.pos || []).map((r) => `<div class="prow">
      <div><b>${esc(r.n)}</b> <span class="tk">${esc(r.t)}</span>
        <div class="pm">${r.ns ? '<span class="rtag lo">Not sorted yet</span>' : ""}<span class="rtag ${r.sl === "satellite" ? "lo" : "me"}">${esc(SLEEVE[r.sl] || r.pot || "–")}</span>${esc(CLASS[r.c] || r.c || "")}${r.pot && r.pot !== "growth" ? " · " + esc(r.pot) + " pot" : ""}</div></div>
      <div class="pv2"><b>${pfMoney(r.v, cur)}</b><span>${r.w != null ? ppct(r.w) + " of growth" : ""}</span></div></div>`).join("")
    || '<p class="muted">No open positions.</p>';
  const mix = Object.entries(p.mix || {});
  const mixbar = mix.map(([k, v], i) => `<i class="c${i % 5}" style="width:${(v * 100).toFixed(1)}%"></i>`).join("");
  const mixkey = mix.map(([k, v], i) => `<span><i class="c${i % 5}"></i>${esc(CLASS[k] || k)} ${ppct(v, 0)}</span>`).join("");
  const checks = (p.m || []).map((m) => { const [t, c] = STATUS[m.st] || [m.st, "u"];
    return `<div class="chk"><span class="dot ${c}">${c === "y" ? "✓" : c === "n" ? "!" : "–"}</span>
      <div><div class="q">${esc(m.l)}</div>${m.d ? `<div class="a">${esc(m.d)}</div>` : ""}</div>
      <div class="v">${m.v == null ? "n/a" : ppct(m.v, m.k === "cost" ? 2 : 1)}<br><span class="a">${esc(t)}</span></div></div>`; }).join("");
  const pots = p.pots || {};
  view().innerHTML = bar("Portfolio") + `
    <p class="sub">${esc(p.acct === "demo" ? "Trading 212 practice account" : "Trading 212")} · read only · as of ${esc(when(p.at))}</p>
    ${p.stale ? '<div class="banner">This snapshot is more than 3 days old: the link may have stopped. Check the hourly run.</div>' : ""}
    <button class="phero" data-pf-hide>
      <span class="kicker">Account value</span><b>${pfMoney(p.total, cur)}</b>
      <span class="muted">Cash ${pfMoney(p.cash, cur)} · tap to ${pfHide ? "show" : "hide"} amounts</span></button>
    ${charts}
    <div class="isec"><h4>Stress check <span>growth pot, worse scenario</span></h4>
      <div class="box pbox ${over ? "over" : ""}">
        <div class="pbig"><b class="${over ? "down" : ""}">−${ppct(st.loss)}</b><span>${over
          ? `above your ${ppct(st.limit, 0)} limit: new buys that add risk are blocked or resized`
          : `within your ${ppct(st.limit, 0)} limit`}</span></div>
        ${gauge(st.loss, st.limit)}
        ${scen}
        ${st.verified ? "" : '<p class="muted">Planning shocks are first estimates, not yet checked against historical data.</p>'}
      </div></div>
    <div class="isec"><h4>Satellite <span>ceiling ${ppct(sat.ceiling, 0)}</span></h4>
      <div class="box">
        <div class="kv"><span>Held in satellite now</span><span class="${(sat.used || 0) > sat.ceiling ? "down" : ""}">${ppct(sat.used)}</span></div>
        <div class="kv"><span>Room the stress budget allows</span><span>${ppct(sat.room)}</span></div>
        <div class="kv"><span>Room left for new satellite buys</span><span>${ppct(sat.left)}</span></div>
      </div></div>
    <div class="isec"><h4>Mix of the growth pot <span>${pfMoney(p.growth, cur)}</span></h4>
      <div class="pmix">${mixbar}</div><div class="pkey">${mixkey}</div></div>
    ${(p.ns || []).length ? `<div class="banner">Not sorted into a pot yet: ${esc(p.ns.join(", "))}. Counted as speculative shares until you add them to the broker map.</div>` : ""}
    <div class="isec"><h4>Positions <span>${(p.pos || []).length}</span></h4><div class="box">${pos}</div></div>
    <div class="isec"><h4>Pots <span>account value split</span></h4><div class="box">
      ${["emergency", "deposit", "growth"].map((k) => `<div class="kv"><span>${k[0].toUpperCase() + k.slice(1)}</span><span>${pfMoney(pots[k], cur)}</span></div>`).join("")}
      </div></div>
    <div class="isec"><h4>Risk dashboard <span>look-through</span></h4><div class="box">${checks}</div></div>
    <p class="last">Read only: the Trading 212 key cannot place orders and the app never trades. Positions are sent
      encrypted with the evening briefing and kept only on this phone.</p>`;
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-pf-hide]")) return;
  pfHide = !pfHide;
  try { localStorage.setItem("inv-pf-hide", pfHide ? "1" : "0"); } catch (_) {}
  portfolioView();
});
