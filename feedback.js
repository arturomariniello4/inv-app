// Useful / Noise taps on alerts and briefing stories. A tap is saved on this phone at once
// (localStorage). With a feedback key set in Settings (a GitHub fine-grained token that may only
// write issues in the private inv repository), queued taps are posted as one comment on the issue
// "INV feedback"; the hourly run reads them into the alert log and the Saturday report counts them.
// Without the key, taps stay on this phone. Taps measure usefulness; the app never trades.
const FB = { taps: "inv-fb-taps", queue: "inv-fb-queue", token: "inv-fb-token", issue: "inv-fb-issue", last: "inv-fb-last" };
const FB_TITLE = "INV feedback";

function fbRead(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (_) { return d; } }
function fbWrite(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
const fbTap = (id) => (fbRead(FB.taps, {})[id] || {}).tap || "";

// The two buttons under an alert or a story card. `what` is "alert" or "story".
function feedbackBlock(id, headline, what) {
  const t = fbTap(id), key = !!fbRead(FB.token, "");
  const note = t ? (t === "useful" ? "Marked useful" : "Marked noise") + (key ? (fbQueued(id) ? " · sending…" : " · sent to your Saturday report") : " · saved on this phone")
    : `Your taps tune the importance bar and show up in the Saturday report.`;
  return `<div class="fb" data-fb-box="${esc(id)}" data-fb-h="${esc(headline || "")}">
    <h3>Was this ${what} worth it?</h3>
    <div class="fb-row"><button class="fb-b${t === "useful" ? " on up" : ""}" data-fb="useful" aria-pressed="${t === "useful"}">👍 Useful</button>
      <button class="fb-b${t === "noise" ? " on down" : ""}" data-fb="noise" aria-pressed="${t === "noise"}">👎 Noise</button></div>
    <p class="muted">${esc(note)}</p></div>`;
}
const fbQueued = (id) => fbRead(FB.queue, []).some((q) => q.id === id);

function fbMark(id, tap, headline) {
  const taps = fbRead(FB.taps, {});
  if ((taps[id] || {}).tap === tap) return false;          // same tap again: nothing new
  const at = new Date().toISOString();
  taps[id] = { tap, at, h: headline };
  fbWrite(FB.taps, taps);
  fbWrite(FB.queue, [...fbRead(FB.queue, []), { id, tap, at, h: (headline || "").slice(0, 200) }]);
  return true;
}

function fbRefresh(id) {
  document.querySelectorAll(".fb").forEach((box) => {
    if (box.dataset.fbBox !== id) return;
    const what = /^story:/.test(id) ? "story" : "alert";
    box.outerHTML = feedbackBlock(id, box.dataset.fbH, what);
  });
}

// Post the queued taps as one comment. Kept on the phone and tried again on the next tap or app start if it fails.
async function fbSync() {
  const token = fbRead(FB.token, ""), queue = fbRead(FB.queue, []);
  const repo = (window.INV_CONFIG || {}).feedbackRepo;
  if (!token || !repo || !queue.length || fbSync.busy) return;
  fbSync.busy = true;
  const api = `https://api.github.com/repos/${repo}`;
  const h = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json" };
  try {
    let n = fbRead(FB.issue, 0);
    if (!n) {
      const r = await fetch(`${api}/issues?state=all&per_page=100`, { headers: h });
      if (!r.ok) throw new Error("GitHub " + r.status);
      const found = (await r.json()).find((i) => i.title === FB_TITLE && !i.pull_request);
      if (found) n = found.number;
      else {
        const c = await fetch(`${api}/issues`, { method: "POST", headers: h, body: JSON.stringify({ title: FB_TITLE,
          body: "Useful / Noise taps from the INV app arrive here as comments. The hourly run reads them into the alert log. Information only: the app never trades." }) });
        if (!c.ok) throw new Error("GitHub " + c.status);
        n = (await c.json()).number;
      }
      fbWrite(FB.issue, n);
    }
    const body = "Taps from the INV app.\n\n```json\n" + JSON.stringify(queue) + "\n```";
    const r = await fetch(`${api}/issues/${n}/comments`, { method: "POST", headers: h, body: JSON.stringify({ body }) });
    if (r.status === 404 || r.status === 410) fbWrite(FB.issue, 0);   // the issue was deleted: find or make it next time
    if (!r.ok) throw new Error("GitHub " + r.status);
    fbWrite(FB.queue, fbRead(FB.queue, []).slice(queue.length));     // taps made while sending stay queued
    fbWrite(FB.last, { at: new Date().toISOString(), ok: true, n: queue.length });
  } catch (e) {
    fbWrite(FB.last, { at: new Date().toISOString(), ok: false, error: String(e.message || e).slice(0, 120) });
  } finally {
    fbSync.busy = false;
    queue.forEach((q) => fbRefresh(q.id));
    const s = document.getElementById("fb-settings");
    if (s) s.innerHTML = feedbackSettings();
  }
}

// Settings: how many taps, the key, and whether the last send worked.
function feedbackSettings() {
  const taps = Object.values(fbRead(FB.taps, {})), q = fbRead(FB.queue, []), last = fbRead(FB.last, null), key = fbRead(FB.token, "");
  const u = taps.filter((t) => t.tap === "useful").length;
  return `<div class="kv"><span>On this phone</span><span>${u} useful · ${taps.length - u} noise</span></div>
    <div class="kv"><span>Waiting to send</span><span>${q.length}</span></div>
    ${last ? `<div class="kv"><span>Last send</span><span>${esc(when(last.at))} · ${last.ok ? "ok" : esc(last.error || "failed")}</span></div>` : ""}
    <p>${key ? "Feedback key set: taps reach the Saturday report within the hour."
      : "Without a key, taps stay on this phone. To send them to the Saturday report, make a GitHub fine-grained token with access to the inv repository only and the permission Issues: read and write, then paste it here. It is kept only on this phone."}</p>
    <input id="fb-key" type="password" autocomplete="off" placeholder="${key ? "Key saved (paste to replace)" : "github_pat_…"}">
    <button id="fb-save" class="btn">${key ? "Replace key" : "Save key"}</button>${key ? `<button id="fb-clear" class="btn ghost">Remove key</button>` : ""}`;
}

function wireFeedbackSettings() {
  document.addEventListener("click", (e) => {
    if (e.target.id === "fb-save") {
      const v = (document.getElementById("fb-key").value || "").trim();
      if (!v) return;
      fbWrite(FB.token, v);
      fbWrite(FB.issue, 0);
      document.getElementById("fb-settings").innerHTML = feedbackSettings();
      fbSync();
    } else if (e.target.id === "fb-clear") {
      try { localStorage.removeItem(FB.token); } catch (_) {}
      document.getElementById("fb-settings").innerHTML = feedbackSettings();
    }
  });
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-fb]");
  if (!b) return;
  e.stopPropagation();
  const box = b.closest("[data-fb-box]");
  if (fbMark(box.dataset.fbBox, b.dataset.fb, box.dataset.fbH)) {
    fbRefresh(box.dataset.fbBox);
    fbSync();
  }
}, true);
wireFeedbackSettings();
window.addEventListener("load", () => setTimeout(fbSync, 1500));
document.addEventListener("visibilitychange", () => { if (!document.hidden) fbSync(); });
