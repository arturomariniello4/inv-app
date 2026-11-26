// INV motion (Artu, 2026-11-25): the app felt cheap; this makes it move like a finished iPhone app.
// It only changes how screens appear and respond to a touch, never what they show.
// - GSAP (vendor/gsap-*.min.js) runs every animation.
// - Lenis (vendor/lenis-*.min.js) smooths scrolling: glides to the top when you tap the tab you are on,
//   smooths mouse and trackpad scrolling, and (Settings > Motion > Glide scrolling) can take over finger
//   scrolling too. iOS's own finger scrolling is already smooth, so that one is off unless turned on.
// - Four effects from React Bits (github.com/DavidHDev/react-bits), rewritten here in plain JavaScript because
//   this app has no React: AnimatedList (cards rise in one after another), CountUp (figures count up),
//   BlurText (the screen's headline comes into focus word by word) and SpotlightCard (a card lights up and
//   presses in under the finger).
// "Reduce Motion" in iOS settings turns all of it off. Loaded after app.js and swipe.js.
(() => {
  const g = window.gsap;
  const still = () => !g || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === "1"; } catch (_) { return d; } };

  // ---- Lenis ------------------------------------------------------------------------------------
  let lenis = null;
  function startLenis() {
    if (lenis) { lenis.destroy(); lenis = null; }
    if (still() || !window.Lenis) return;
    lenis = new Lenis({
      autoRaf: true, lerp: 0.12, smoothWheel: true,
      syncTouch: pref("inv-glide", false), syncTouchLerp: 0.09, touchInertiaMultiplier: 30,
      allowNestedScroll: true,
      // sideways strips (market ticker, tables) and the swipe-back keep their own touch handling
      prevent: (node) => !!(node.closest && node.closest(".ticker,.box.flush,.stt,textarea,input,[data-lenis-prevent]")),
    });
  }
  startLenis();

  // A new screen starts where the app put it, never mid-glide from the old one.
  function settleScroll() { if (lenis) lenis.scrollTo(window.scrollY, { immediate: true, force: true }); }

  // ---- Which renders get the entrance ------------------------------------------------------------
  // A new screen, a tab or a tap animates in. Going back (swipe.js marks it), and the same screen re-drawn
  // because new data arrived in the background, appear as they are, so nothing jumps while you read.
  let quiet = false, lastHash = null, tapAt = 0;
  document.addEventListener("click", (e) => { if (e.target.closest(NAV)) tapAt = Date.now(); }, true);

  const ITEMS = [".mood-box", ".paper", ".msec-h", ".mrow", ".mbox", ".mtitle", ".chg", ".newstabs", ".mood", ".tiles .tile",
    ".sline", ".abox", ".duo > *", ".full", ".lead", ".item", ".row", ".group", ".phero", ".isec", ".box", ".card", ".rrow",
    ".dayline", ".cal", ".banner", ".empty", ".acard > *", ".grades", ".hero2", ".note2", ".seg3", ".rhead", ".idsnap", ".sec"].join(",");
  const HEADS = ".mhead h1, .mood h1, .mtitle h1, .acard h2, .lead h2, .hero2 h2, .rhead h2, .idsnap h2, .empty h2, .bar h1";
  const FIGURES = ".phero b, .pbig b, .tile b, .grades b, .rk b";
  const BARS = ".pg i, .meter i, .pmix i, .cbar i.f, .stt td i";
  const CHIPS = ".mrow .mv, .mtitle .mv, .mchip";

  function entrance() {
    const root = view();
    if (!root) return;
    g.killTweensOf(root.querySelectorAll("*"));
    const fold = window.innerHeight + 40;
    const seen = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < fold; };
    // AnimatedList: what is on screen rises in one after another; what is below the fold is simply there.
    let items = [...root.querySelectorAll(ITEMS)].filter((el) => !el.parentElement.closest(ITEMS) || el.matches(".tiles .tile, .duo > *, .acard > *"));
    items = items.filter(seen).slice(0, 16);
    if (items.length) g.from(items, { opacity: 0, y: 18, duration: 0.55, ease: "power3.out", stagger: 0.045, clearProps: "opacity,transform" });
    // Move chips pop in just after their card.
    const chips = [...root.querySelectorAll(CHIPS)].filter(seen).slice(0, 10);
    if (chips.length) g.from(chips, { scale: 0.6, opacity: 0, duration: 0.5, ease: "back.out(2.2)", stagger: 0.05, delay: 0.12, clearProps: "opacity,transform" });
    const head = root.querySelector(HEADS);
    if (head && seen(head)) blurText(head);
    root.querySelectorAll(FIGURES).forEach((el) => { if (seen(el)) countUp(el); });
    const bars = [...root.querySelectorAll(BARS)].filter(seen);
    if (bars.length) g.from(bars, { scaleX: 0, transformOrigin: "0% 50%", duration: 0.9, ease: "power3.out", stagger: 0.03, delay: 0.15, clearProps: "transform" });
    drawLines(root);
  }

  // Chart lines (charts.js) draw themselves from left to right when their screen opens.
  function drawLines(root) {
    [...root.querySelectorAll(".chart .cl.main, .spark path")].filter((el) => el.getBoundingClientRect().top < window.innerHeight + 40).forEach((el, i) => {
      const n = el.getTotalLength ? el.getTotalLength() : 0;
      if (!n) return;
      g.fromTo(el, { strokeDasharray: n, strokeDashoffset: n }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut", delay: 0.15 + Math.min(i, 8) * 0.04,
        clearProps: "strokeDasharray,strokeDashoffset" });
    });
  }

  // BlurText: the headline sharpens word by word, then goes back to plain text.
  function blurText(el) {
    if ([...el.childNodes].some((n) => n.nodeType !== 3)) {         // has markup inside: blur the whole line
      g.from(el, { opacity: 0, filter: "blur(10px)", y: 8, duration: 0.6, ease: "power2.out", clearProps: "opacity,filter,transform" });
      return;
    }
    const text = el.textContent;
    el.textContent = "";
    const words = text.split(/(\s+)/).map((w) => {
      if (/^\s+$/.test(w) || !w) return document.createTextNode(w);
      const s = document.createElement("span");
      s.style.display = "inline-block";
      s.textContent = w;
      return s;
    });
    el.append(...words);
    const spans = words.filter((w) => w.nodeType === 1);
    g.from(spans, { opacity: 0, filter: "blur(10px)", y: 10, duration: 0.6, ease: "power2.out", stagger: 0.06,
      onComplete: () => { if (el.isConnected) el.textContent = text; } });
  }

  // CountUp: the first number in a figure counts up from zero, keeping its sign, decimals and separators.
  const NUM = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/;
  function countUp(el) {
    if (el.children.length) return;
    const text = el.textContent, m = text.match(NUM);
    if (!m) return;
    const target = parseFloat((m[1] + (m[2] || "")).replace(/,/g, ""));
    if (!isFinite(target) || target === 0) return;
    const dec = m[2] ? m[2].length - 1 : 0, commas = m[1].includes(",");
    const pre = text.slice(0, m.index), post = text.slice(m.index + m[0].length);
    const fmt = (v) => commas ? v.toLocaleString("en-GB", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec);
    const o = { v: 0 };
    el.textContent = pre + fmt(0) + post;
    g.to(o, { v: target, duration: 1.1, ease: "power3.out", delay: 0.1,
      onUpdate: () => { if (el.isConnected) el.textContent = pre + fmt(o.v) + post; },
      onComplete: () => { if (el.isConnected) el.textContent = text; } });
  }

  // Every time a screen is drawn into #view.
  new MutationObserver(() => {
    const h = location.hash, fresh = h !== lastHash || Date.now() - tapAt < 1500;
    lastHash = h;
    settleScroll();
    if (quiet || !fresh || still()) return;
    requestAnimationFrame(entrance);          // after swipe.js has placed the screen and its scroll, before it is painted
  }).observe(document.getElementById("view"), { childList: true });

  // ---- SpotlightCard: a touch lights the card where the finger is and presses it in ----------------
  const PRESS = ".mrow,.card,.row,.sline,.sbox,.abox,.dayline,.fb-b,.btn,.full,.rrow,.phero,.grid button.d,.newstabs button,.seg3 button,.back";
  let pressed = null;
  function release() {
    const el = pressed;
    pressed = null;
    if (!el) return;
    el.classList.remove("lit");
    g.to(el, { scale: 1, duration: 0.45, ease: "back.out(3)", clearProps: "transform" });
  }
  document.addEventListener("pointerdown", (e) => {
    if (still()) return;
    const el = e.target.closest(PRESS);
    if (!el) return;
    pressed = el;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
    el.classList.add("lit");
    g.to(el, { scale: el.matches(".back,.newstabs button,.seg3 button") ? 0.94 : 0.975, duration: 0.14, ease: "power2.out" });
  }, { passive: true });
  ["pointerup", "pointercancel", "pointerleave", "scroll"].forEach((t) => document.addEventListener(t, release, { passive: true, capture: true }));

  // ---- Tab bar: a sliding marker under the tab you are on; tap the same tab again to glide to the top ----
  const nav = document.querySelector("nav.tabs");
  const mark = document.createElement("i");
  mark.className = "tab-mark";
  nav.append(mark);
  function moveMark(instant) {
    const on = nav.querySelector("button.on");
    if (!on) { g ? g.to(mark, { opacity: 0, duration: 0.2 }) : (mark.style.opacity = 0); return; }
    const x = on.offsetLeft + on.offsetWidth / 2 - mark.offsetWidth / 2;
    if (!g || instant || still()) { mark.style.transform = `translateX(${x}px)`; mark.style.opacity = 1; return; }
    g.to(mark, { x, opacity: 1, duration: 0.5, ease: "elastic.out(1, 0.75)" });
  }
  new MutationObserver(() => moveMark(false)).observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  addEventListener("resize", () => moveMark(true));
  requestAnimationFrame(() => moveMark(true));

  nav.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    if (g && !still()) g.fromTo(b.querySelector("svg"), { scale: 0.8 }, { scale: 1, duration: 0.5, ease: "back.out(3)", clearProps: "transform" });
    if (b.classList.contains("on") && !location.hash.includes("/") && window.scrollY > 4) {   // already here: glide up
      e.stopImmediatePropagation();
      if (lenis) lenis.scrollTo(0, { duration: 0.8, easing: (t) => 1 - Math.pow(1 - t, 4) });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, true);

  // ---- Hooks for swipe.js and the Settings screen ------------------------------------------------
  window.motion = {
    quiet(on) { quiet = on; },
    finish() { if (g) g.globalTimeline.getChildren(true, true, false).forEach((t) => t.progress(1)); },   // before a screen is copied
    pauseScroll() { if (lenis) lenis.stop(); },
    resumeScroll() { if (lenis) { lenis.start(); settleScroll(); } },
    settings() {
      const glide = pref("inv-glide", false);
      return `<div class="kv"><span>Glide scrolling<br><span class="muted">Lenis takes over finger scrolling: softer, a little slower to stop</span></span>
        <span><button class="btn" id="glide" style="margin:0">${glide ? "On" : "Off"}</button></span></div>`;
    },
    wire() {
      const b = document.getElementById("glide");
      if (!b) return;
      b.addEventListener("click", () => {
        const on = !pref("inv-glide", false);
        try { localStorage.setItem("inv-glide", on ? "1" : "0"); } catch (_) {}
        b.textContent = on ? "On" : "Off";
        startLenis();
      });
    },
  };
})();
