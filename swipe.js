// INV navigation feel (Artu, 2026-11-22): screens slide like a native iPhone app, and a swipe to the
// right goes back. A home-screen web app gets no swipe-back from iOS, so it is done here:
// - opening a story, a day, a company or a report slides the new screen in from the right;
// - Back, or a swipe from the left edge (or a clearly sideways swipe anywhere off a scrolling strip),
//   drags the screen away and shows the one you came from underneath, at the same scroll position;
// - tabs switch instantly, as on iOS. Vertical scrolling and taps are left alone: the swipe only starts
//   once the finger has moved clearly sideways, and nothing is blocked before that.
// Only how screens move changes here; what each screen shows is still built by app.js and friends.

const SLIDE_MS = 320, EASE = "cubic-bezier(.2,.8,.2,1)", PARALLAX = 0.3, SHADE = 0.18;
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let stack = [];          // screens behind the current one: { html, y, hash, full, month }
let busy = false;        // a slide is running; taps wait for it

const mainBack = () => view().querySelector(".bar > .back");
const here = () => ({ html: view().innerHTML, y: window.scrollY, hash: location.hash, full: !!today.full, month: calMonth });

function kind(el) {
  if (el.closest("nav.tabs")) return "tab";
  if (el === mainBack()) return "back";
  if (el.closest(".bar") || el.matches("[data-sort],[data-month]")) return "same";   // story ‹ ›, sort, month
  if (el.matches("[data-seg]")) return /^#ideas/.test(location.hash) ? "same" : "tab";
  if (el.matches("[data-go],[data-tab]")) return "tab";
  return "forward";
}

// A still copy of the screen behind, fixed in place at its old scroll position, with a light shade.
function underlay(entry) {
  const u = document.createElement("div");
  u.className = "under";
  u.setAttribute("aria-hidden", "true");
  u.inert = true;
  const page = document.createElement("div");
  page.className = "under-page";
  if (entry) page.innerHTML = entry.html;
  const shade = document.createElement("div");
  shade.className = "under-shade";
  u.append(page, shade);
  document.body.append(u);
  return { u, page, shade, y: entry ? entry.y : 0 };
}

function place(under, p) {             // p: 0 = new screen fully in, 1 = fully out to the right
  const w = window.innerWidth;
  view().style.transform = `translate3d(${Math.round(p * w)}px,0,0)`;
  if (under) {
    under.page.style.transform = `translate3d(${Math.round(-(1 - p) * PARALLAX * w)}px,${-under.y}px,0)`;
    under.shade.style.opacity = String(SHADE * (1 - p));
  }
}

function animate(under, from, to, ms) {
  return new Promise((done) => {
    if (still() || ms <= 0) { place(under, to); return done(); }
    const els = [view(), under && under.page, under && under.shade].filter(Boolean);
    place(under, from);
    void view().offsetWidth;
    els.forEach((e) => { e.style.transition = `transform ${ms}ms ${EASE}, opacity ${ms}ms ${EASE}`; });
    place(under, to);
    setTimeout(() => { els.forEach((e) => { e.style.transition = ""; }); done(); }, ms + 20);
  });
}

function settle(under) {
  view().style.transform = "";
  view().classList.remove("moving");
  if (under) under.u.remove();
}

// Go back one screen: to the one on the stack when there is one, else where the Back button points.
async function back(under, alreadyOut) {
  const entry = stack.pop();
  const b = mainBack();
  if (entry) {
    calMonth = entry.month;
    if (window.motion) motion.quiet(true);            // the screen you came back to appears as you left it (motion.js)
    try { await goHash(entry.hash, entry.full); } finally { if (window.motion) motion.quiet(false); }
    settle(null);                                     // a screen moved sideways cannot be scrolled, so put it back first
    window.scrollTo(0, entry.y);
  } else if (b) {
    await route(b);
  }
  settle(under);
  if (!entry && !alreadyOut && !still()) {          // nothing to show underneath: a short slide in from the left
    view().classList.add("moving");
    await animate(null, -PARALLAX, 0, 220);
    settle(null);
  }
}

async function navigate(el) {
  if (busy) return;
  if (window.motion) motion.finish();                 // no half-finished animation in the copy kept behind
  const k = kind(el);
  if (k === "tab") { stack = []; return route(el); }
  if (k === "same") return route(el);
  busy = true;
  try {
    if (k === "back") {
      const entry = stack[stack.length - 1];
      if (entry && !still()) {
        const under = underlay(entry);
        view().classList.add("moving");
        await animate(under, 0, 1, SLIDE_MS - 40);
        await back(under, true);
      } else await back(null, false);
      return;
    }
    const prev = here();
    await route(el);
    if (!mainBack()) { stack = []; return; }        // landed on a tab screen after all
    if (prev.hash === location.hash && prev.full === !!today.full) return;   // same screen re-drawn
    stack.push(prev);
    if (stack.length > 12) stack.shift();
    window.scrollTo(0, 0);
    if (still()) return;
    const under = underlay(prev);
    view().classList.add("moving");
    await animate(under, 1, 0, SLIDE_MS);
    settle(under);
  } finally { busy = false; }
}

// ---- The swipe ---------------------------------------------------------------------------------
const EDGE = 28;                 // px from the left edge where a swipe always means back
let drag = null;

function scrollsSideways(node) {
  for (let n = node; n && n !== document.body && n !== view(); n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
  }
  return false;
}

document.addEventListener("touchstart", (e) => {
  drag = null;
  if (busy || e.touches.length !== 1 || !mainBack()) return;
  const t = e.touches[0], edge = t.clientX <= EDGE;
  if (!edge && (scrollsSideways(e.target) || e.target.closest("input,textarea,select,summary,.chart"))) return;
  drag = { x0: t.clientX, y0: t.clientY, edge, on: false, pts: [[e.timeStamp, t.clientX]] };
}, { passive: true });

document.addEventListener("touchmove", (e) => {
  if (!drag) return;
  const t = e.touches[0], dx = t.clientX - drag.x0, dy = t.clientY - drag.y0;
  if (!drag.on) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    // Sideways and to the right, clearly more than up or down; anything else is a scroll and is left alone.
    if (!(dx > 0 && dx > Math.abs(dy) * (drag.edge ? 1 : 1.8))) { drag = null; return; }
    drag.on = true;
    drag.x0 = t.clientX;                              // no jump: the screen follows from here
    drag.under = underlay(stack[stack.length - 1]);
    if (window.motion) motion.pauseScroll();
    view().classList.add("moving");
  }
  e.preventDefault();                                 // the page does not scroll while it is being dragged
  const x = Math.max(0, t.clientX - drag.x0);
  drag.p = Math.min(1, x / window.innerWidth);
  drag.pts.push([e.timeStamp, t.clientX]);
  if (drag.pts.length > 6) drag.pts.shift();
  place(drag.under, drag.p);
}, { passive: false });

async function release(cancelled) {
  const d = drag;
  drag = null;
  if (!d || !d.on) return;
  if (window.motion) motion.resumeScroll();
  const [t0, x0] = d.pts[0], [t1, x1] = d.pts[d.pts.length - 1];
  const v = t1 > t0 ? (x1 - x0) / (t1 - t0) : 0;      // px per ms, positive = to the right
  const done = !cancelled && v > -0.1 && (d.p > 0.35 || v > 0.45);
  busy = true;
  try {
    if (done) {
      await animate(d.under, d.p, 1, Math.max(120, SLIDE_MS * (1 - d.p)));
      await back(d.under, true);
    } else {
      await animate(d.under, d.p, 0, Math.max(120, SLIDE_MS * d.p));
      settle(d.under);
    }
  } finally { busy = false; }
}
document.addEventListener("touchend", () => release(false), { passive: true });
document.addEventListener("touchcancel", () => release(true), { passive: true });
