/* Depth engine: a page's sections sit on planes along the z axis, and scrolling
   moves the camera through them. The plane in focus flies past and blurs out while
   the next one comes forward out of the blur. A plane taller than the window
   scrolls inside itself before the camera moves on.

   Everything here is style writes on nodes the template already rendered; no DOM is
   created. The engine runs outside Angular's zone and reports the plane in focus
   through `onActive`, which is the only thing a page needs to react to.

   Markup contract (see the pages that use it):
     [data-depth-stage]          the stage; holds every .fsb-depth-layer
     .fsb-depth-layer            one plane. [data-full] fills the window,
                                 [data-scroll] scrolls inside itself
     .fsb-depth-fit              the plane's only child; scaled down to fit
     [data-di="0.35"]            an element that travels with its plane; the value
                                 delays it, so a plane arrives in a stagger
     [data-dfade]                travels by fading only
     [data-depth-ambient="a,b"]  a backdrop shown while planes a..b are in view
     [data-depth-anchor]         section starts inside a scrolling plane
     [data-depth-own]            gestures that start here belong to the element
     .fsb-depth-rail [data-depth-go="i"][data-depth-sec="j"]  the plane index */

export interface DepthEngine {
  readonly root: HTMLElement;
  go(index: number): void;
  /** Re-reads the rail buttons, for rails rendered after the engine started. */
  refreshRail(): void;
  destroy(): void;
}

export interface DepthEngineOptions {
  onActive?: (index: number) => void;
}

interface DepthLayer extends HTMLElement {
  _s?: number;
  _on?: boolean | null;
  _st?: number | null;
  _anch?: HTMLElement[];
  _auto?: boolean;
}

interface DepthItem {
  el: HTMLElement;
  i: number;
  k: number;
  fade: boolean;
  p: number;
  last: string;
}

interface Ambient {
  el: HTMLElement;
  a: number;
  b: number;
  o: number;
}

/* Planes are scaled down to fit the window, which is the approved desktop look.
   Below these factors the text would stop being readable, so the plane scrolls
   inside itself instead: phones need the higher bar because their type is already
   small. */
const MIN_SCALE_WIDE = 0.6;
const MIN_SCALE_NARROW = 0.86;
const NARROW_MAX_WIDTH = 600;

/* After a swipe snaps to a plane, wheel events that still arrive this soon belong
   to that swipe's momentum and are eaten. The snap itself comes 160ms after the
   last event, so together this matches the 400ms pause that starts a new swipe. */
const SWALLOW_MS = 240;

export function createDepthEngine(root: HTMLElement, options: DepthEngineOptions = {}): DepthEngine {
  const doc = root.ownerDocument;
  const win = (doc.defaultView || window) as Window & typeof globalThis;
  const stage = root.querySelector<HTMLElement>('[data-depth-stage]');
  const noop: DepthEngine = { root, go: () => undefined, refreshRail: () => undefined, destroy: () => undefined };
  if (!stage) return noop;

  const layers = Array.from(stage.querySelectorAll<DepthLayer>('.fsb-depth-layer'));
  const N = layers.length;
  if (!N) return noop;
  let railEl: HTMLElement | null = null;
  let rail: HTMLElement[] = [];
  let railKey = '';
  let cueEl: HTMLElement | null = null;
  let cueLast = -1;
  const reduce = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const P = 1200;
  const BASE = reduce ? 0.3 : 0.12;
  let items: DepthItem[] = [];
  let parents: HTMLElement[] = [];
  let p = 0;
  let target = 0;
  let anchor = 0;
  let active = -1;
  let running = false;
  let raf = 0;
  let lastT = 0;
  let laidOut = false;
  let gesturing = false;
  let scrolled = false;
  let idle = 0;
  let touch: { x: number; y: number; mode: 'native' | 'depth' | null } | null = null;
  let edgeT = 0;
  let lastAbs = 0;
  let steady = 0;
  let swallow = false;
  let swallowEnd = 0;
  let lastEvt = 0;
  // Shape of the current swipe's deltas: how far it peaked, whether it has ebbed
  // (its momentum tail), and the run of rising or falling steps since.
  let peak = 0;
  let ebbed = false;
  // A fresh swipe has landed on the momentum of the one that opened this gesture.
  let carry = false;
  let rising = 0;
  let riseFrom = 0;
  let falling = 0;
  const ambients: Ambient[] = Array.from(stage.querySelectorAll<HTMLElement>('[data-depth-ambient]')).map((el) => {
    const r = (el.getAttribute('data-depth-ambient') || '0,0').split(',');
    return { el, a: parseFloat(r[0]), b: parseFloat(r[1]), o: -1 };
  });

  const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
  const isScroll = (L: DepthLayer | undefined): boolean => !!L && L.hasAttribute('data-scroll');
  const css = (el: Element, pseudo?: string): CSSStyleDeclaration => win.getComputedStyle(el, pseudo);

  function splitList(s: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    for (const c of s) {
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === ',' && depth === 0) {
        out.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  // Measured from layout, not scrollHeight: while a plane is mid-flight its 3D
  // transform inflates scrollHeight.
  function maxScroll(L: DepthLayer): number {
    const f = L.firstElementChild as HTMLElement | null;
    const h = f ? f.offsetTop + f.offsetHeight + (parseFloat(css(L).paddingBottom) || 0) : L.scrollHeight;
    return Math.max(0, Math.min(L.scrollHeight, h) - L.clientHeight);
  }
  const curScroll = (L: DepthLayer): number => (L._st != null ? L._st : L.scrollTop);
  const canScroll = (L: DepthLayer, dir: number): boolean => {
    const c = curScroll(L);
    return dir > 0 ? c < maxScroll(L) - 2 : c > 2;
  };
  // Scrolling inside a long plane is eased by the same frame loop, so wheel,
  // trackpad and keys all glide.
  function scrollBy(L: DepthLayer, dy: number): void {
    L._st = clamp(curScroll(L) + dy, 0, maxScroll(L));
    kick();
  }
  // Offsets inside a scrolling plane, measured from the plane's scroll origin.
  function offIn(el: HTMLElement | null, L: DepthLayer): number {
    let y = 0;
    while (el && el !== L) {
      y += el.offsetTop;
      const op = el.offsetParent as HTMLElement | null;
      if (op !== L && !(op && L.contains(op))) break;
      el = op;
    }
    return y;
  }
  const padTop = (L: DepthLayer): number => parseFloat(css(L).paddingTop) || 0;
  function anchors(L: DepthLayer): HTMLElement[] {
    if (!L._anch) L._anch = Array.from(L.querySelectorAll<HTMLElement>('[data-depth-anchor]'));
    return L._anch;
  }
  const topOf = (el: HTMLElement, L: DepthLayer): number => clamp(offIn(el, L) - padTop(L) - 8, 0, maxScroll(L));
  function secTop(L: DepthLayer, j: number): number {
    const a = anchors(L)[j];
    return a ? topOf(a, L) : 0;
  }
  function secAt(L: DepthLayer): number {
    const A = anchors(L);
    if (!A.length) return -1;
    if (L.scrollTop >= maxScroll(L) - 2) return A.length - 1;
    const line = L.scrollTop + padTop(L) + (L.clientHeight - padTop(L)) * 0.3;
    let s = 0;
    for (let j = 0; j < A.length; j++) {
      if (offIn(A[j], L) <= line) s = j;
      else break;
    }
    return s;
  }

  function refreshRail(): void {
    railEl = root.querySelector<HTMLElement>('.fsb-depth-rail');
    rail = Array.from(root.querySelectorAll<HTMLElement>('.fsb-depth-rail [data-depth-go]'));
    if (railEl) {
      if (rail.length > 9) railEl.setAttribute('data-dense', rail.length > 16 ? 'xl' : '');
      else railEl.removeAttribute('data-dense');
    }
    railKey = '';
    markRail();
  }
  function markRail(): void {
    const a = clamp(Math.round(p), 0, N - 1);
    const L = layers[a];
    const sec = isScroll(L) ? secAt(L) : -1;
    const key = a + ':' + sec;
    if (key === railKey) return;
    railKey = key;
    for (const b of rail) {
      const gi = parseInt(b.getAttribute('data-depth-go') || '0', 10);
      const sj = b.getAttribute('data-depth-sec');
      const on = gi === a && (sj === null || parseInt(sj, 10) === sec);
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    }
  }

  // Everything visible on a plane has to travel with it. An element with its own
  // paint that contains moving items moves as one piece instead, and visible
  // content no item covers (text, images, painted boxes) becomes an item of its own.
  function seen(c: string | null | undefined): boolean {
    const t = String(c || '').split(' ').join('');
    return !!t && t !== 'transparent' && !(t.slice(0, 5) === 'rgba(' && t.slice(-3) === ',0)');
  }
  function boxPaint(cs: CSSStyleDeclaration): boolean {
    if (seen(cs.backgroundColor) || (cs.backgroundImage && cs.backgroundImage !== 'none') || (cs.boxShadow && cs.boxShadow !== 'none')) return true;
    return (['Top', 'Right', 'Bottom', 'Left'] as const).some((sd) => {
      const w = cs.getPropertyValue(`border-${sd.toLowerCase()}-width`);
      const st = cs.getPropertyValue(`border-${sd.toLowerCase()}-style`);
      const col = cs.getPropertyValue(`border-${sd.toLowerCase()}-color`);
      return parseFloat(w) > 0 && st !== 'none' && seen(col);
    });
  }
  function painted(el: Element): boolean {
    const cs = css(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (boxPaint(cs)) return true;
    return ['::before', '::after'].some((ps) => {
      const c = css(el, ps);
      return !!c.content && c.content !== 'none' && c.content !== 'normal' && (c.content !== '""' || boxPaint(c));
    });
  }
  const kOf = (el: Element): number => parseFloat(el.getAttribute('data-di') || '') || 0;
  function normalize(L: DepthLayer): void {
    if (isScroll(L) && !L._auto) return;
    const fit = L.firstElementChild as HTMLElement | null;
    if (!fit) return;
    for (const el of Array.from(L.querySelectorAll<HTMLElement>('[data-di]'))) {
      if (!el.hasAttribute('data-di')) continue;
      let top: HTMLElement | null = null;
      let a = el.parentElement;
      while (a && a !== fit && a !== L) {
        if (painted(a)) top = a;
        a = a.parentElement;
      }
      if (!top) continue;
      const inner = Array.from(top.querySelectorAll<HTMLElement>('[data-di]'));
      const k = inner.reduce((m, d) => Math.min(m, kOf(d)), 9);
      inner.forEach((d) => d.removeAttribute('data-di'));
      top.setAttribute('data-di', String(k === 9 ? 0 : k));
    }
    const found: HTMLElement[] = [];
    const w = doc.createTreeWalker(fit, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && (n as Element).hasAttribute('data-di') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    while (w.nextNode()) {
      const n = w.currentNode;
      let el: HTMLElement | null = null;
      if (n.nodeType === 3) {
        const parent = n.parentElement;
        if (!(n as Text).data.trim() || !parent || !parent.getClientRects().length) continue;
        el = parent;
        while (el.parentElement && el.parentElement !== fit && css(el).display === 'inline' && !el.parentElement.querySelector('[data-di]')) el = el.parentElement;
        if (el === fit || el.querySelector('[data-di]')) continue;
      } else {
        const e = n as HTMLElement;
        if (e !== fit && e.getClientRects().length && (/^(IMG|svg|VIDEO|CANVAS|IFRAME)$/.test(e.tagName) || painted(e)) && !e.querySelector('[data-di]')) el = e;
      }
      if (el && !found.includes(el)) found.push(el);
    }
    found
      .filter((el) => !found.some((o) => o !== el && o.contains(el)))
      .forEach((el) => el.setAttribute('data-di', '0.15'));
  }
  // Keep an element's own hover transitions and drop the ones that would smear the
  // depth motion. Read from the stylesheet each time (inline values cleared first),
  // so a stylesheet that lands late still counts.
  function strip(el: HTMLElement): void {
    const st = el.style;
    st.transitionProperty = '';
    st.transitionDuration = '';
    st.transitionTimingFunction = '';
    st.transitionDelay = '';
    const cs = css(el);
    const props = splitList(cs.transitionProperty);
    const durs = splitList(cs.transitionDuration);
    const fns = splitList(cs.transitionTimingFunction);
    const dels = splitList(cs.transitionDelay);
    const P2: string[] = [];
    const D2: string[] = [];
    const F2: string[] = [];
    const L2: string[] = [];
    props.forEach((pr, j) => {
      const list = pr === 'all' ? ['color', 'background-color', 'border-color', 'box-shadow', 'transform'] : [pr];
      for (const x of list) {
        if (x === 'opacity' || x === 'filter' || x === 'translate' || x === 'visibility' || x === 'none') continue;
        P2.push(x);
        D2.push(durs[j % durs.length] || '0s');
        F2.push(fns[j % fns.length] || 'ease');
        L2.push(dels[j % dels.length] || '0s');
      }
    });
    st.transitionProperty = P2.length ? P2.join(', ') : 'none';
    if (P2.length) {
      st.transitionDuration = D2.join(', ');
      st.transitionTimingFunction = F2.join(', ');
      st.transitionDelay = L2.join(', ');
    }
  }
  function unstyle(el: HTMLElement): void {
    const st = el.style;
    st.translate = '';
    st.opacity = '';
    st.filter = '';
    st.visibility = '';
    st.willChange = '';
    st.transitionProperty = '';
    st.transitionDuration = '';
    st.transitionTimingFunction = '';
    st.transitionDelay = '';
  }
  // Which elements travel is decided from what is painted, so it is decided again
  // once late stylesheets arrive: a box that only gets its background later must
  // move with its plane too.
  function collect(): void {
    layers.forEach(normalize);
    items = items.filter((it) => {
      if (it.el.isConnected && it.el.hasAttribute('data-di')) return true;
      unstyle(it.el);
      return false;
    });
    layers.forEach((L, i) => {
      for (const el of Array.from(L.querySelectorAll<HTMLElement>('[data-di]'))) {
        if (items.some((it) => it.el === el)) continue;
        items.push({ el, i, k: parseFloat(el.getAttribute('data-di') || '') || 0, fade: el.hasAttribute('data-dfade'), p, last: '' });
      }
    });
    const next: HTMLElement[] = [];
    for (const it of items) {
      strip(it.el);
      it.last = '';
      const par = it.el.parentElement;
      if (par && !next.includes(par)) next.push(par);
    }
    for (const par of parents) {
      if (!next.includes(par)) {
        par.style.perspective = '';
        par.style.perspectiveOrigin = '';
      }
    }
    parents = next;
  }

  function navHeight(): number {
    return parseFloat(css(stage!).getPropertyValue('--nav-height')) || 64;
  }

  function layout(): void {
    const H = stage!.clientHeight;
    const W = stage!.clientWidth;
    const minScale = W <= NARROW_MAX_WIDTH ? MIN_SCALE_NARROW : MIN_SCALE_WIDE;
    // The same room a fitted plane gets from its CSS padding (nav above, nav cue
    // below), so a plane that switched to scrolling can switch back.
    const room = H - navHeight() - 84 - 24;
    let changed = false;
    for (const L of layers) {
      const fit = L.firstElementChild as HTMLElement;
      let s = 1;
      if (!L.hasAttribute('data-full') && (!isScroll(L) || L._auto)) {
        const h = fit.offsetHeight;
        s = h > 0 ? Math.min(1, room / h) : 1;
        const auto = s < minScale;
        if (auto !== !!L._auto) {
          L._auto = auto;
          if (auto) L.setAttribute('data-scroll', '');
          else {
            L.removeAttribute('data-scroll');
            L.scrollTop = 0;
            L._st = null;
          }
          changed = true;
        }
        if (auto) s = 1;
      }
      const tf = s < 0.999 ? 'scale(' + s.toFixed(4) + ')' : '';
      if (fit.style.transform !== tf) fit.style.transform = tf;
      L._s = s;
    }
    if (changed) collect();
    const sr = stage!.getBoundingClientRect();
    const cx = sr.left + W / 2;
    const cy = sr.top + H / 2;
    for (const par of parents) {
      const L = par.closest<DepthLayer>('.fsb-depth-layer');
      const s = (L && L._s) || 1;
      par.style.perspective = (P / s).toFixed(1) + 'px';
      if (par === L) {
        par.style.perspectiveOrigin = '50% 50%';
        continue;
      }
      const r = par.getBoundingClientRect();
      par.style.perspectiveOrigin = ((cx - r.left) / s).toFixed(1) + 'px ' + ((cy - r.top) / s).toFixed(1) + 'px';
    }
    for (const it of items) {
      it.last = '';
      apply(it);
    }
    if (!laidOut) {
      laidOut = true;
      timers.push(win.setTimeout(() => {
        for (const L of layers) (L.firstElementChild as HTMLElement).style.transition = 'transform .35s cubic-bezier(.16,1,.3,1)';
      }, 600));
    }
  }

  function apply(it: DepthItem): void {
    const d = it.i - it.p;
    const s = layers[it.i]._s || 1;
    let z = 0;
    let o = 1;
    let b = 0;
    if (it.fade) o = clamp(1 - Math.abs(d) * 1.25, 0, 1);
    else if (reduce) o = clamp(1 - Math.abs(d) * 1.6, 0, 1);
    else if (d >= 0) {
      z = -d * 900;
      o = d < 1 ? 1 - d * 0.91 : Math.max(0, 0.09 - (d - 1) * 0.18);
      b = Math.min(d * 12, 16);
    } else {
      z = Math.min(-d * 700, 650);
      o = Math.max(0, 1 + d * 1.9);
      b = Math.min(-d * 16, 12);
    }
    const rest = Math.abs(d) < 0.0005;
    const key = rest ? 'rest' : z.toFixed(1) + '|' + o.toFixed(3) + '|' + b.toFixed(2);
    if (key === it.last) return;
    it.last = key;
    const st = it.el.style;
    if (rest) {
      st.translate = '';
      st.opacity = '';
      st.filter = '';
      st.visibility = '';
      st.willChange = '';
      return;
    }
    st.willChange = 'translate, opacity, filter';
    st.translate = z ? '0 0 ' + (z / s).toFixed(1) + 'px' : '';
    st.opacity = o.toFixed(3);
    st.filter = b > 0.05 ? 'blur(' + b.toFixed(2) + 'px)' : '';
    st.visibility = o < 0.004 ? 'hidden' : '';
  }

  function cue(): HTMLElement | null {
    if (!cueEl || !cueEl.isConnected) cueEl = doc.querySelector<HTMLElement>('.fsb-navcue');
    return cueEl;
  }

  function sync(): void {
    layers.forEach((L, i) => {
      const on = Math.abs(i - p) < 0.5;
      if (L._on === on) return;
      L._on = on;
      L.style.pointerEvents = on ? 'auto' : 'none';
      if (on) {
        L.removeAttribute('inert');
        L.removeAttribute('aria-hidden');
      } else {
        L.setAttribute('inert', '');
        L.setAttribute('aria-hidden', 'true');
      }
    });
    const a = clamp(Math.round(p), 0, N - 1);
    if (a !== active) {
      active = a;
      options.onActive?.(a);
    }
    markRail();
    for (const am of ambients) {
      const d = p < am.a ? am.a - p : p > am.b ? p - am.b : 0;
      const o = Math.round(clamp(1 - d / 0.5, 0, 1) * 1000) / 1000;
      if (o !== am.o) {
        am.o = o;
        am.el.style.opacity = String(o);
      }
    }
    const c = cue();
    if (c) {
      const f = p - Math.floor(p);
      let v = reduce ? 0 : Math.sin(Math.PI * f);
      if (Math.abs(target - p) < 0.0005) v = 0;
      v = Math.round(v * 1000) / 1000;
      if (v !== cueLast) {
        cueLast = v;
        c.style.setProperty('--cue', String(v));
      }
    }
  }

  function frame(t: number): void {
    const dt = clamp(t - lastT, 0, 64) || 16.67;
    lastT = t;
    let moving = false;
    const a0 = 1 - Math.pow(1 - BASE, dt / 16.67);
    p += (target - p) * a0;
    if (Math.abs(target - p) < 0.0005) p = target;
    else moving = true;
    for (const L of layers) {
      if (L._st == null) continue;
      L._st = clamp(L._st, 0, maxScroll(L));
      const cur = L.scrollTop;
      const nx = cur + (L._st - cur) * (1 - Math.pow(1 - 0.2, dt / 16.67));
      if (Math.abs(L._st - nx) < 1) {
        L.scrollTop = L._st;
        L._st = null;
        continue;
      }
      L.scrollTop = nx;
      // Scroll positions snap to device pixels: if this step did not move, finish the glide.
      if (L.scrollTop === cur) {
        L.scrollTop = L._st;
        L._st = null;
        continue;
      }
      moving = true;
    }
    for (const it of items) {
      const r = reduce ? BASE : BASE / (1 + it.k * 0.9);
      const a = 1 - Math.pow(1 - r, dt / 16.67);
      it.p += (target - it.p) * a;
      if (Math.abs(target - it.p) < 0.0005) it.p = target;
      else moving = true;
      apply(it);
    }
    sync();
    if (moving) raf = win.requestAnimationFrame(frame);
    else {
      running = false;
      park();
    }
  }
  function park(): void {
    layers.forEach((L, j) => {
      if (j === anchor || !isScroll(L) || L._st != null) return;
      const want = j < anchor ? maxScroll(L) : 0;
      if (Math.abs(L.scrollTop - want) > 1) L.scrollTop = want;
    });
  }
  function kick(): void {
    if (running) return;
    running = true;
    lastT = win.performance.now();
    raf = win.requestAnimationFrame(frame);
  }
  function go(i: number): void {
    const from = anchor;
    anchor = clamp(Math.round(i), 0, N - 1);
    // Arriving at a scrolling plane from above starts at its top, from below at its end.
    const L = layers[anchor];
    if (isScroll(L) && anchor !== from) {
      L._st = null;
      L.scrollTop = anchor > from ? 0 : maxScroll(L);
    }
    target = anchor;
    kick();
  }
  // Ends a gesture on a plane. After a pause the stragglers that follow are eaten;
  // when a fresh swipe is what ended it, that swipe is new input and goes through.
  function settle(eat = true): void {
    gesturing = false;
    carry = false;
    swallow = eat;
    if (eat) swallowEnd = win.performance.now() + SWALLOW_MS;
    const delta = target - anchor;
    go(Math.abs(delta) < 0.1 ? anchor : anchor + (delta > 0 ? 1 : -1));
  }
  function onIdle(): void {
    if (gesturing) settle();
  }
  // Jump straight to the plane holding an element, for #fragment links.
  function reveal(el: HTMLElement): void {
    const L = el.closest<DepthLayer>('.fsb-depth-layer');
    const i = L ? layers.indexOf(L) : -1;
    if (!L || i < 0) return;
    anchor = target = p = i;
    for (const it of items) it.p = i;
    if (isScroll(L)) {
      L._st = null;
      L.scrollTop = topOf(el, L);
    }
    for (const it of items) apply(it);
    sync();
    park();
  }
  function revealHash(): void {
    const raw = (win.location.hash || '').slice(1);
    let id = raw;
    try {
      id = decodeURIComponent(raw);
    } catch {
      // Not valid percent-encoding (a link ending in "#100%"): no element has that id.
    }
    if (!id) return;
    const el = doc.getElementById(id);
    if (el && stage!.contains(el)) reveal(el);
  }

  const owns = (e: Event): boolean => {
    const t = e.target as Element | null;
    return !!(t && t.closest && t.closest('[data-depth-own]'));
  };
  function onWheel(e: WheelEvent): void {
    if (e.ctrlKey || (e.metaKey && owns(e))) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? stage!.clientHeight : 1);
    if (Math.abs(e.deltaX) > Math.abs(dy)) return;
    win.clearTimeout(idle);
    idle = win.setTimeout(onIdle, 160);
    const ad = Math.abs(dy);
    const prev = lastAbs;
    const now = win.performance.now();
    const gap = now - lastEvt;
    lastAbs = ad;
    lastEvt = now;
    // One physical swipe is a push plus its momentum tail: the deltas climb, then
    // only ebb. A new push follows a pause, makes them jump, or (a fresh swipe landing
    // on a tail that is still running) makes them climb again after they have ebbed.
    // A slow drag whose speed wavers climbs again after ebbing too, so that shape
    // alone never moves a plane: see where the gesture rolls over below.
    if (ad < prev) {
      falling++;
      rising = 0;
    } else if (ad > prev) {
      if (!rising) riseFrom = prev;
      rising++;
      falling = 0;
    }
    if (falling >= 3 || ad <= peak * 0.4) ebbed = true;
    const fresh = gap >= 400 || ad > prev * 1.5 + 4 || (ebbed && rising >= 2 && ad - riseFrom >= 2);
    const cont = !fresh;
    if (fresh) {
      // Only a swipe that follows an ebbed one counts as landing on an open gesture:
      // a push that jumps while it is still building is the same swipe.
      if (gesturing && ebbed) carry = true;
      peak = ad;
      ebbed = false;
      falling = 0;
      rising = 0;
      scrolled = false;
      edgeT = 0;
      steady = 0;
      swallow = false;
    } else peak = Math.max(peak, ad);
    // The last swipe's momentum can keep its gesture open, and a gesture never goes
    // past one plane. Once a fresh swipe has landed on it, the gesture rolls over when
    // the camera reaches that plane, and the swipe carries on from there (to the next
    // plane, or scrolling inside this one). Momentum alone stays where it stopped, and
    // a drag moves one plane for each plane of travel however its speed wavers.
    if (carry && gesturing && Math.abs(target - anchor) >= 0.999) settle(false);
    const L = layers[Math.round(target)];
    // The rest of the swipe that just changed planes is eaten, so it cannot scroll or
    // skip the next one. Only its stragglers, though: they arrive right after the snap
    // and keep decaying. Anything later, or growing again, is new input, so a wheel
    // rolled on or a fresh swipe is never held for more than a moment.
    if (swallow && !gesturing) {
      if (cont && now < swallowEnd && ad <= prev + 1) {
        e.preventDefault();
        return;
      }
      swallow = false;
      scrolled = false;
      edgeT = 0;
      steady = 0;
    }
    if (!gesturing && isScroll(L)) {
      if (canScroll(L, dy)) {
        scrolled = true;
        edgeT = 0;
        steady = 0;
        e.preventDefault();
        scrollBy(L, dy);
        return;
      }
      // Reached the edge inside this swipe: hold while it runs out, so reading to the
      // end never flings you past it. A new push carries on to the next plane, and so
      // does a steady one held for a moment (a mouse wheel rolled on, a deliberate drag).
      if (scrolled) {
        if (!edgeT) edgeT = now;
        steady = ad >= prev * 0.97 ? steady + 1 : 0;
        if (!(now - edgeT > 600 && steady >= 3)) {
          e.preventDefault();
          return;
        }
        scrolled = false;
        edgeT = 0;
        steady = 0;
      }
    }
    e.preventDefault();
    if (!gesturing) {
      gesturing = true;
      anchor = Math.round(target);
    }
    target = clamp(target + dy / (stage!.clientHeight * 0.75), Math.max(-0.15, anchor - 1), Math.min(N - 0.85, anchor + 1));
    kick();
  }
  function onKey(e: KeyboardEvent): void {
    const tg = e.target as HTMLElement | null;
    const tag = tg && tg.tagName;
    if ((tag && /^(INPUT|TEXTAREA|SELECT)$/.test(tag)) || (tg && tg.isContentEditable) || e.altKey || e.ctrlKey || e.metaKey) return;
    // A key aimed at something outside the page (an open overlay) is not ours.
    if (tg && tg !== doc.body && !root.contains(tg) && !tg.closest('nav.nav')) return;
    const interactive = !!tag && /^(BUTTON|A|SUMMARY)$/.test(tag);
    const k = e.key;
    const now = Math.round(target);
    const L = layers[now];
    const down = k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !interactive && !e.shiftKey);
    const up = k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && !interactive && e.shiftKey);
    if ((down || up) && isScroll(L) && canScroll(L, down ? 1 : -1)) {
      const step = k === 'ArrowDown' || k === 'ArrowUp' ? 90 : L.clientHeight * 0.8;
      scrollBy(L, down ? step : -step);
    } else if (down) go(now + 1);
    else if (up) go(now - 1);
    else if (k === 'Home') go(0);
    else if (k === 'End') {
      // A closing plane that scrolls: End means the very end of it.
      const LN = layers[N - 1];
      if (!isScroll(LN)) go(N - 1);
      else if (now === N - 1) scrollBy(LN, maxScroll(LN));
      else {
        go(N - 1);
        LN._st = null;
        LN.scrollTop = maxScroll(LN);
      }
    } else return;
    e.preventDefault();
  }
  function onTouchStart(e: TouchEvent): void {
    // A touch already being followed means another finger landed: finish that
    // swipe on a plane before letting it go, or the camera stays between two.
    if (touch?.mode === 'depth') settle();
    if (e.touches.length !== 1 || owns(e)) {
      touch = null;
      return;
    }
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, mode: null };
  }
  function onTouchMove(e: TouchEvent): void {
    if (!touch) return;
    let dy = touch.y - e.touches[0].clientY;
    if (!touch.mode) {
      const dx = touch.x - e.touches[0].clientX;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      const L = layers[Math.round(target)];
      // A sideways swipe belongs to whatever scrolls sideways under it, as with the wheel.
      touch.mode = Math.abs(dx) > Math.abs(dy) || (isScroll(L) && canScroll(L, dy)) ? 'native' : 'depth';
      if (touch.mode === 'depth') {
        anchor = Math.round(target);
        gesturing = true;
        touch.y = e.touches[0].clientY;
        dy = 0;
      }
    }
    if (touch.mode === 'native') return;
    e.preventDefault();
    target = clamp(anchor + dy / (stage!.clientHeight * 0.5), Math.max(-0.15, anchor - 1), Math.min(N - 0.85, anchor + 1));
    kick();
  }
  function onTouchEnd(): void {
    if (!touch) return;
    const m = touch.mode;
    touch = null;
    if (m === 'depth') settle();
  }
  function onClick(e: MouseEvent): void {
    const b = (e.target as Element | null)?.closest?.<HTMLElement>('[data-depth-go]');
    if (!b || !root.contains(b)) return;
    e.preventDefault();
    const gi = parseInt(b.getAttribute('data-depth-go') || '0', 10) || 0;
    const sj = b.getAttribute('data-depth-sec');
    if (sj !== null) {
      const L = layers[gi];
      const y = secTop(L, parseInt(sj, 10) || 0);
      // Already reading this plane: glide to the section. Arriving from another plane: open at it.
      if (anchor === gi && Math.abs(target - gi) < 0.01) {
        L._st = y;
        kick();
      } else {
        go(gi);
        L._st = null;
        L.scrollTop = y;
      }
    } else go(gi);
    try {
      stage!.focus({ preventScroll: true });
    } catch {
      // Focus is a convenience.
    }
  }

  const timers: number[] = [];
  let alive = true;
  let rescanT = 0;
  function rescan(): void {
    win.clearTimeout(rescanT);
    rescanT = win.setTimeout(() => {
      if (!alive) return;
      collect();
      layout();
      kick();
    }, 50);
  }
  function watchLink(l: HTMLLinkElement): void {
    if (!l.sheet) l.addEventListener('load', rescan);
  }

  for (const L of layers) {
    L._s = 1;
    L._on = null;
  }
  collect();

  doc.addEventListener('wheel', onWheel, { passive: false });
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('touchstart', onTouchStart, { passive: true });
  doc.addEventListener('touchmove', onTouchMove, { passive: false });
  doc.addEventListener('touchend', onTouchEnd);
  doc.addEventListener('touchcancel', onTouchEnd);
  root.addEventListener('click', onClick);
  win.addEventListener('hashchange', revealHash);
  const onLayerScroll = (): void => markRail();
  for (const L of layers) L.addEventListener('scroll', onLayerScroll, { passive: true });
  const ro = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => layout()) : null;
  if (ro) {
    ro.observe(stage);
    for (const L of layers) ro.observe(L.firstElementChild as Element);
  } else win.addEventListener('resize', layout);
  // Stylesheets and fonts can land after the first pass: look again when they do.
  doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]').forEach(watchLink);
  const mo = typeof win.MutationObserver === 'function'
    ? new win.MutationObserver((ms) => {
        for (const m of ms) {
          m.addedNodes.forEach((n) => {
            if (n.nodeName === 'LINK') {
              watchLink(n as HTMLLinkElement);
              rescan();
            } else if (n.nodeName === 'STYLE') rescan();
          });
        }
      })
    : null;
  mo?.observe(doc.head || doc.documentElement, { childList: true, subtree: true });
  if (doc.readyState !== 'complete') win.addEventListener('load', rescan);
  timers.push(win.setTimeout(rescan, 400), win.setTimeout(rescan, 1500), win.setTimeout(rescan, 4000));
  doc.fonts?.ready.then(rescan).catch(() => undefined);
  layout();
  refreshRail();
  sync();
  revealHash();
  stage.setAttribute('data-depth-live', '');

  return {
    root,
    go,
    refreshRail,
    destroy(): void {
      doc.removeEventListener('wheel', onWheel);
      doc.removeEventListener('keydown', onKey);
      doc.removeEventListener('touchstart', onTouchStart);
      doc.removeEventListener('touchmove', onTouchMove);
      doc.removeEventListener('touchend', onTouchEnd);
      doc.removeEventListener('touchcancel', onTouchEnd);
      root.removeEventListener('click', onClick);
      win.removeEventListener('hashchange', revealHash);
      for (const L of layers) L.removeEventListener('scroll', onLayerScroll);
      if (ro) ro.disconnect();
      else win.removeEventListener('resize', layout);
      alive = false;
      timers.forEach((t) => win.clearTimeout(t));
      win.clearTimeout(rescanT);
      win.clearTimeout(idle);
      win.cancelAnimationFrame(raf);
      mo?.disconnect();
      win.removeEventListener('load', rescan);
      cueEl?.style.removeProperty('--cue');
      stage.removeAttribute('data-depth-live');
    },
  };
}
