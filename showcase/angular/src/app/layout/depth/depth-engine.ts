/* Depth engine: a page's sections sit on planes along the z axis, and scrolling
   moves the camera through them. The plane in focus flies past and blurs out while
   the next one comes forward out of the blur. A plane taller than the window is
   scaled down to fit it. On a wide window, one that would become too small to
   read scrolls inside itself instead, before the camera moves on; on a phone
   every plane is fitted, so a swipe always moves the camera.

   Everything here is style writes on nodes the template already rendered. The one
   thing it adds is a label over each rail entry, on phones that tick only for a
   tapped switch (labelEntries() below). The engine runs outside Angular's zone and
   reports the plane in focus through `onActive`, which is the only thing a page
   needs to react to.

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
     [data-depth-rigid]          a plane that keeps its own width when it is fitted
     [data-depth-grows]          content that opens on demand (an answer): its plane
                                 is fitted without it, keeps its size when it opens,
                                 and scrolls inside itself while it does not fit
     .fsb-depth-rail [data-depth-go="i"][data-depth-sec="j"]  the plane index; a
                                 finger sliding along it runs through the entries,
                                 and the rail carries [data-sliding] while it does */

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
  /** How much wider than the window the plane is laid out (0: not widened). */
  _w?: number;
  /** The window and height the width was last worked out for. */
  _key?: string;
  /** Content that opens on demand ([data-depth-grows]). */
  _grows?: HTMLElement[];
  /** When a click inside the plane last may have opened some of that content. */
  _armed?: number;
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
   On a wide window, text below MIN_SCALE_WIDE would stop being readable, so the
   plane scrolls inside itself instead.

   A phone has no room for two kinds of scrolling: every swipe there moves the
   camera. So a narrow plane is always fitted, and is laid out wider than the
   window first, because scaling shrinks width as well as height and a phone only
   runs out of height. The wider layout wraps less text, so the plane needs to
   shrink less. MIN_SCALE_NARROW only catches windows too short to show anything. */
const MIN_SCALE_WIDE = 0.6;
const MIN_SCALE_NARROW = 0.45;
const NARROW_MAX_WIDTH = 600;
/* A plane this close to full size is left at its own width. */
const WIDEN_BELOW = 0.97;
const FIT_EASE = 'transform .35s cubic-bezier(.16,1,.3,1)';
/* The length of the tick a phone gives when a swipe lands on another plane. */
const TICK_MS = 15;
/* Marks the label that makes a phone without vibration tick (labelEntries() below). */
const TAP_LABEL = 'data-depth-tick';

/* After a swipe snaps to a plane, wheel events that still arrive this soon belong
   to that swipe's momentum and are eaten. The snap itself comes 160ms after the
   last event, so together this matches the 400ms pause that starts a new swipe. */
const SWALLOW_MS = 240;

/* A finger that slides only a few pixels along the rail can still count as a tap,
   and the browser then clicks the entry it came down on. A click on the rail this
   soon after a slide is that one, and the slide has already gone where the finger
   was. */
const SLID_CLICK_MS = 350;

/* After a click inside a plane whose answers open on demand, an answer that opens
   within this long is scrolled into view. */
const ARMED_MS = 900;

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
  // An iPhone cannot vibrate from script. The one haptic a page can cause there is
  // the tick of the native switch control, and only when a finger taps the switch or
  // a label for it. `placed` and `stretched` are set where the entry was positioned, or
  // widened, to hold its label.
  const tapTicks =
    typeof win.navigator.vibrate !== 'function' && 'switch' in win.HTMLInputElement.prototype && win.navigator.maxTouchPoints > 0;
  const tapLabels = new Map<HTMLElement, { label: HTMLLabelElement; placed: boolean; stretched: boolean }>();
  // How far the labels reach past their entries, as last written (placeLabels()).
  let tapInset = '';
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
  let eased = false;
  let wasNarrow: boolean | null = null;
  let sized = '';
  let widenT = 0;
  let lastTouch = -1e9;
  let gesturing = false;
  let scrolled = false;
  let idle = 0;
  // The finger being followed; `onRail` if it came down on the rail, `onEntry` if on
  // one of its buttons rather than the space around them.
  let touch: { x: number; y: number; mode: 'native' | 'depth' | 'rail' | null; onRail: boolean; onEntry: boolean } | null = null;
  // A finger sliding along the rail. The rail shows the entry under it (`pinned`),
  // and keeps showing it after the finger lifts, until the camera gets there.
  let sliding = false;
  let pinned: HTMLElement | null = null;
  let middles: number[] = [];
  let slidEnd = -1e9;
  // The entry the last slide along the rail went to, if it opened one (onClick()).
  let slidEntry: HTMLElement | null = null;
  // How tall each piece of on-demand content was at the last pass, to tell which
  // one is opening.
  const grownTo = new WeakMap<HTMLElement, number>();
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
  // Scrolls inside itself: laid out as a scrolling document, or holding an open
  // answer that does not fit its room.
  const flows = (L: DepthLayer | undefined): boolean => isScroll(L) || (!!L && L.hasAttribute('data-depth-over'));
  const css =(el: Element, pseudo?: string): CSSStyleDeclaration => win.getComputedStyle(el, pseudo);

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
  // transform inflates scrollHeight. A plane holding an open answer is drawn scaled
  // from its top, its box trimmed to that height by a negative margin.
  function maxScroll(L: DepthLayer): number {
    const f = L.firstElementChild as HTMLElement | null;
    const h = f ? f.offsetTop + f.offsetHeight + (parseFloat(f.style.marginBottom) || 0) + (parseFloat(css(L).paddingBottom) || 0) : L.scrollHeight;
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
  function grows(L: DepthLayer): HTMLElement[] {
    if (!L._grows || L._grows.some((g) => !g.isConnected)) L._grows = Array.from(L.querySelectorAll<HTMLElement>('[data-depth-grows]'));
    return L._grows;
  }
  // An element's laid-out height, unrounded and untouched by transforms.
  const exact = (el: HTMLElement): number => parseFloat(css(el).height) || el.offsetHeight;
  // The plane's height without what is open on demand: the height it is fitted at,
  // so opening an answer never changes its scale or width. Worked out from unrounded
  // heights: whole-pixel ones would make it wobble by a pixel while an answer opens.
  function restHeight(L: DepthLayer, fit: HTMLElement): number {
    const g = grows(L);
    if (!g.length) return fit.offsetHeight;
    let h = exact(fit);
    for (const el of g) h -= exact(el);
    return Math.round(h);
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
    labelEntries();
    railKey = '';
    markRail();
  }
  // On such a phone a tap on a rail entry lands on a see-through label for a hidden
  // switch, and the phone ticks as it does for a switch of its own. The label, not
  // the switch, is under the finger: a touch that starts on a switch belongs to the
  // switch, and a slide along the rail could not start there. A swipe is not a tap,
  // so a swipe between planes, or a slide along the rail, stays silent there.
  function labelEntries(): void {
    for (const [b, had] of Array.from(tapLabels)) if (!rail.includes(b) || had.label.parentElement !== b) unlabel(b);
    if (!tapTicks || !railEl) return;
    for (const b of rail) {
      if (tapLabels.has(b)) continue;
      const label = doc.createElement('label');
      label.setAttribute(TAP_LABEL, '');
      label.setAttribute('aria-hidden', 'true');
      label.style.position = 'absolute';
      const sw = doc.createElement('input');
      sw.type = 'checkbox';
      sw.setAttribute('switch', '');
      sw.setAttribute('aria-hidden', 'true');
      sw.tabIndex = -1;
      sw.style.position = 'absolute';
      sw.style.width = sw.style.height = '1px';
      sw.style.margin = '0';
      sw.style.opacity = '0';
      sw.style.visibility = 'hidden';
      label.appendChild(sw);
      // Positioned whatever the page's rules say now: the rule that positions an entry
      // on a phone held upright stops applying when it is turned sideways, and the
      // label would then be laid out against the whole rail.
      const placed = !b.style.position;
      if (placed) b.style.position = 'relative';
      // As wide as the rail: an entry narrower than the widest leaves bare rail beside it,
      // and a tap there opens it too (onTouchEnd()). The page holds an entry's content
      // against the screen edge, so nothing on screen moves, and the rail is no wider.
      const stretched = !b.style.alignSelf;
      if (stretched) b.style.alignSelf = 'stretch';
      b.appendChild(label);
      tapLabels.set(b, { label, placed, stretched });
    }
    tapInset = '';
    placeLabels();
  }
  // Out over the strip beside the buttons and half the gap between them: a tap there
  // opens the nearest entry, so it ticks as well. Both come from the rail's rules,
  // which change when a phone turns, so they are measured again with the window.
  function placeLabels(): void {
    if (!tapLabels.size || !railEl) return;
    const cs = win.getComputedStyle(railEl);
    const edge = parseFloat(cs.paddingRight) || 0;
    const gap = (parseFloat(cs.rowGap) || 0) / 2;
    const inset = `${-gap}px ${-edge}px ${-gap}px 0`;
    if (inset === tapInset) return;
    tapInset = inset;
    for (const had of tapLabels.values()) had.label.style.inset = inset;
  }
  function unlabel(b: HTMLElement): void {
    const had = tapLabels.get(b);
    if (!had) return;
    had.label.remove();
    if (had.placed) b.style.position = '';
    if (had.stretched) b.style.alignSelf = '';
    tapLabels.delete(b);
  }
  function markRail(): void {
    // The finger's entry stays marked until the camera has arrived there, or until
    // another gesture takes the camera.
    if (pinned && !sliding && (gesturing || (p === target && layers.every((L) => L._st == null)))) pinned = null;
    const a = clamp(Math.round(p), 0, N - 1);
    const L = layers[a];
    const sec = !pinned && isScroll(L) ? secAt(L) : -1;
    const key = pinned ? 'pin:' + rail.indexOf(pinned) : a + ':' + sec;
    if (key === railKey) return;
    railKey = key;
    for (const b of rail) {
      const gi = parseInt(b.getAttribute('data-depth-go') || '0', 10);
      const sj = b.getAttribute('data-depth-sec');
      const on = pinned ? b === pinned : gi === a && (sj === null || parseInt(sj, 10) === sec);
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
  // A box that scrolls clips what is inside it, so cards flying toward the camera
  // would be cut off at its edges: the box travels as one piece instead.
  const scrolls = (el: Element): boolean => /^(auto|scroll)$/.test(css(el).overflowX);
  function normalize(L: DepthLayer): void {
    if (isScroll(L) && !L._auto) return;
    const fit = L.firstElementChild as HTMLElement | null;
    if (!fit) return;
    for (const el of Array.from(L.querySelectorAll<HTMLElement>('[data-di]'))) {
      if (!el.hasAttribute('data-di')) continue;
      let top: HTMLElement | null = null;
      let a = el.parentElement;
      while (a && a !== fit && a !== L) {
        if (painted(a) || scrolls(a)) top = a;
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

  function setWide(L: DepthLayer, fit: HTMLElement, factor: number): void {
    const wide = factor > 1.001;
    L._w = wide ? factor : 0;
    const width = wide ? (factor * 100).toFixed(2) + '%' : '';
    if (fit.style.width !== width) {
      fit.style.width = width;
      fit.style.flexShrink = wide ? '0' : '';
    }
  }
  // Finds the width at which a narrow plane needs to shrink least: the largest
  // scale s for which the plane, laid out 1 / s times as wide as the window, is no
  // taller than the room once scaled.
  function solve(L: DepthLayer, fit: HTMLElement, room: number, W: number): void {
    const at = (factor: number): number => {
      setWide(L, fit, factor);
      return restHeight(L, fit);
    };
    const h1 = at(1);
    const plain = h1 > 0 ? Math.min(1, room / h1) : 1;
    let factor = 1;
    if (plain < WIDEN_BELOW) {
      let lo = plain;
      let hi = 1;
      for (let k = 0; k < 6; k++) {
        const mid = (lo + hi) / 2;
        if (at(1 / mid) * mid <= room + 0.5) lo = mid;
        else hi = mid;
      }
      // A picture or video that keeps its proportions grows taller as its plane
      // widens, and gains nothing: such a plane stays at its own width.
      const h = at(1 / lo);
      if (h > 0 && Math.min(lo, room / h) > plain + 0.005) factor = 1 / lo;
    }
    L._key = W + '|' + room + '|' + at(factor);
  }
  // Sets how wide each plane is laid out. Changing a plane's size inside the resize
  // observer that watches it would loop, so this only ever runs from a timer or at
  // the start, and layout() asks for it.
  function widen(): void {
    const H = stage!.clientHeight;
    const W = stage!.clientWidth;
    const narrow = W <= NARROW_MAX_WIDTH;
    const room = H - navHeight() - 84 - 24;
    sized = W + 'x' + H;
    const moved: HTMLElement[] = [];
    for (const L of layers) {
      const fit = L.firstElementChild as HTMLElement;
      const before = fit.style.width;
      if (narrow && !L.hasAttribute('data-full') && !isScroll(L) && !L.hasAttribute('data-depth-rigid')) solve(L, fit, room, W);
      else setWide(L, fit, 1);
      if (fit.style.width !== before) moved.push(fit);
    }
    // A plane that changed width takes its new scale at once: easing only the scale
    // would show the two out of step.
    for (const fit of moved) fit.style.transition = 'none';
    layout();
    if (moved.length) {
      stage!.getBoundingClientRect();
      for (const fit of moved) fit.style.transition = eased ? FIT_EASE : '';
    }
  }
  function askWiden(delay: number): void {
    win.clearTimeout(widenT);
    widenT = win.setTimeout(() => {
      if (alive) widen();
    }, delay);
  }
  // A plane whose answers open on demand keeps the scale it has with all of them
  // closed. It is drawn scaled from its top, with its box trimmed to the height it
  // shows, so once an open answer no longer fits the room the plane can scroll inside
  // itself ([data-depth-over]) without anything on screen moving as it switches.
  function hold(L: DepthLayer, fit: HTMLElement, s: number, room: number): void {
    const fitted = !L.hasAttribute('data-full') && !isScroll(L);
    const h = exact(fit);
    const origin = fitted ? '50% 0' : '';
    const trim = fitted && s < 1 ? (-h * (1 - s)).toFixed(2) + 'px' : '';
    if (fit.style.transformOrigin !== origin) fit.style.transformOrigin = origin;
    if (fit.style.marginBottom !== trim) fit.style.marginBottom = trim;
    const over = fitted && h * s > room + 0.5;
    if (over !== L.hasAttribute('data-depth-over')) {
      if (over) L.setAttribute('data-depth-over', '');
      else {
        L.removeAttribute('data-depth-over');
        L._st = null;
      }
    }
    // The answer that has opened since the last pass, if a click just opened it.
    let opening: HTMLElement | null = null;
    for (const g of grows(L)) {
      const gh = g.offsetHeight;
      if (gh > (grownTo.get(g) || 0) + 0.5) opening = g;
      grownTo.set(g, gh);
    }
    if (over && opening && L._armed && win.performance.now() - L._armed < ARMED_MS) keepInView(L, opening, s);
  }
  // Glides a plane that scrolls inside itself until an answer that is opening shows
  // in full, without scrolling its question out at the top. Worked out from layout,
  // scaled from the top of the plane, not from where things are drawn: elements still
  // arriving with the plane are not where they will rest.
  function keepInView(L: DepthLayer, el: HTMLElement, s: number): void {
    const f0 = offIn(L.firstElementChild as HTMLElement, L);
    const drawn = (y: number): number => f0 + (y - f0) * s;
    const top = drawn(offIn(el.parentElement || el, L));
    const bottom = drawn(offIn(el, L) + exact(el));
    const cs = css(L);
    const viewTop = parseFloat(cs.paddingTop) || 0;
    // A little inside the room, clear of the fade below it (and of the rounding in
    // whole-pixel offsets).
    const viewBottom = L.clientHeight - (parseFloat(cs.paddingBottom) || 0) - 8;
    let st = curScroll(L);
    if (bottom - st > viewBottom) st = bottom - viewBottom;
    st = clamp(Math.min(st, top - viewTop), 0, maxScroll(L));
    if (Math.abs(st - curScroll(L)) > 0.5) {
      L._st = st;
      kick();
    }
  }

  function layout(): void {
    // The rail's rules change with the window too.
    placeLabels();
    const H = stage!.clientHeight;
    const W = stage!.clientWidth;
    const narrow = W <= NARROW_MAX_WIDTH;
    const minScale = narrow ? MIN_SCALE_NARROW : MIN_SCALE_WIDE;
    // The same room a fitted plane gets from its CSS padding (nav above, nav cue
    // below), so a plane that switched to scrolling can switch back.
    const room = H - navHeight() - 84 - 24;
    // Which boxes scroll sideways depends on the width, so the travelling elements
    // are worked out again when a window crosses between narrow and wide.
    let changed = wasNarrow !== null && wasNarrow !== narrow;
    wasNarrow = narrow;
    let stale = false;
    for (const L of layers) {
      const fit = L.firstElementChild as HTMLElement;
      let s = 1;
      if (!L.hasAttribute('data-full') && (!isScroll(L) || L._auto)) {
        const h = restHeight(L, fit);
        const widens = narrow && !L._auto && !L.hasAttribute('data-depth-rigid');
        const settled = widens ? L._key === W + '|' + room + '|' + h : !L._w;
        if (!settled) stale = true;
        // A widened plane is exactly as wide as the window once scaled by 1 / _w.
        s = h > 0 ? Math.min(1, room / h, 1 / (L._w || 1)) : 1;
        // A plane whose width is still to be worked out may yet fit: it is asked first.
        const auto = s < minScale && (settled || !!L._auto);
        if (auto !== !!L._auto) {
          L._auto = auto;
          if (auto) L.setAttribute('data-scroll', '');
          else {
            L.removeAttribute('data-scroll');
            L.scrollTop = 0;
            L._st = null;
          }
          if (L._w) stale = true;
          changed = true;
        }
        if (auto) s = 1;
      } else if (L._w) stale = true;
      const tf = s < 0.999 ? 'scale(' + s.toFixed(4) + ')' : '';
      if (fit.style.transform !== tf) fit.style.transform = tf;
      L._s = s;
      if (grows(L).length) hold(L, fit, s < 0.999 ? s : 1, room);
    }
    // A turned or resized window is refitted at once; a plane whose content is
    // still changing height (an answer opening) waits until it has stopped.
    if (stale) askWiden(sized === W + 'x' + H ? 120 : 0);
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
        eased = true;
        for (const L of layers) (L.firstElementChild as HTMLElement).style.transition = FIT_EASE;
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
      if (j === anchor || !flows(L) || L._st != null) return;
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
  // A phone ticks when a swipe or tap lands on another plane. Browsers that cannot
  // vibrate have no such function (an iPhone ticks for a tap on a rail entry
  // instead: labelEntries()); Chrome ignores the call, and warns in the console,
  // until the page has been tapped once.
  function tick(): void {
    if (win.performance.now() - lastTouch > 1000) return;
    const nav = win.navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } };
    if (typeof nav.vibrate !== 'function' || nav.userActivation?.hasBeenActive === false) return;
    try {
      nav.vibrate(TICK_MS);
    } catch {
      // The tick is a nicety.
    }
  }
  function go(i: number): void {
    // Anything but the slide itself that moves the camera takes the rail back.
    if (!sliding) pinned = null;
    const from = anchor;
    anchor = clamp(Math.round(i), 0, N - 1);
    if (anchor !== from) tick();
    // Arriving at a scrolling plane from above starts at its top, from below at its end.
    const L = layers[anchor];
    if (flows(L) && anchor !== from) {
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
    if (flows(L)) {
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
    if (!gesturing && flows(L)) {
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
    if ((down || up) && flows(L) && canScroll(L, down ? 1 : -1)) {
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
  // Opens what a rail entry points at: a plane, or a section of a plane that scrolls.
  function openEntry(b: HTMLElement): void {
    if (!sliding) pinned = null;
    const gi = parseInt(b.getAttribute('data-depth-go') || '0', 10) || 0;
    const sj = b.getAttribute('data-depth-sec');
    if (sj === null) {
      go(gi);
      return;
    }
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
  }
  // The middle of each rail entry, as a height on the screen.
  const railMiddles = (): number[] =>
    rail.map((b) => {
      const r = b.getBoundingClientRect();
      return r.top + r.height / 2;
    });
  function entryAt(y: number, mids: readonly number[]): HTMLElement | null {
    let k = -1;
    for (let j = 0; j < mids.length; j++) if (k < 0 || Math.abs(mids[j] - y) < Math.abs(mids[k] - y)) k = j;
    return k < 0 ? null : rail[k];
  }
  // A finger sliding along the rail runs through its entries, the way a phone's A-Z
  // index runs through contacts: the entry nearest the finger opens as it gets there,
  // with a tick for each. The rail stays put while it slides, so it is measured once.
  function startSlide(): void {
    sliding = true;
    slidEntry = null;
    middles = railMiddles();
    pinned = rail.find((b) => b.classList.contains('is-active')) || null;
    railEl?.setAttribute('data-sliding', '');
  }
  function slideTo(y: number): void {
    lastTouch = win.performance.now();
    const b = entryAt(y, middles);
    if (!b || b === pinned) return;
    pinned = b;
    const from = anchor;
    openEntry(b);
    slidEntry = b;
    // go() ticks when the plane changes; another section of the same plane ticks here.
    if (anchor === from) tick();
    markRail();
  }
  function endSlide(): void {
    sliding = false;
    slidEnd = win.performance.now();
    railEl?.removeAttribute('data-sliding');
    markRail();
  }
  function onTouchStart(e: TouchEvent): void {
    lastTouch = win.performance.now();
    // A touch already being followed means another finger landed: finish that
    // swipe on a plane before letting it go, or the camera stays between two. A
    // slide along the rail is already on one, and stops where it is.
    if (touch?.mode === 'depth') settle();
    if (sliding) endSlide();
    if (e.touches.length !== 1 || owns(e)) {
      touch = null;
      return;
    }
    const t = e.target as Element | null;
    const bar = t?.closest?.('.fsb-depth-rail');
    const onRail = !!bar && root.contains(bar);
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, mode: null, onRail, onEntry: onRail && !!t?.closest?.('[data-depth-go]') };
  }
  function onTouchMove(e: TouchEvent): void {
    if (!touch) return;
    let dy = touch.y - e.touches[0].clientY;
    if (!touch.mode) {
      const dx = touch.x - e.touches[0].clientX;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      if (touch.onRail) {
        // Up or down the rail runs through it. A sideways swipe from it is not ours:
        // it is how a phone goes back, from the edge of the screen.
        touch.mode = Math.abs(dx) > Math.abs(dy) ? 'native' : 'rail';
        if (touch.mode === 'rail') startSlide();
      } else {
        const L = layers[Math.round(target)];
        // A sideways swipe belongs to whatever scrolls sideways under it, as with the wheel.
        touch.mode = Math.abs(dx) > Math.abs(dy) || (flows(L) && canScroll(L, dy)) ? 'native' : 'depth';
        if (touch.mode === 'depth') {
          anchor = Math.round(target);
          gesturing = true;
          touch.y = e.touches[0].clientY;
          dy = 0;
        }
      }
    }
    if (touch.mode === 'native') return;
    e.preventDefault();
    if (touch.mode === 'rail') {
      slideTo(e.touches[0].clientY);
      return;
    }
    target = clamp(anchor + dy / (stage!.clientHeight * 0.5), Math.max(-0.15, anchor - 1), Math.min(N - 0.85, anchor + 1));
    kick();
  }
  function onTouchEnd(e: TouchEvent): void {
    lastTouch = win.performance.now();
    if (!touch) return;
    const t = touch;
    touch = null;
    if (t.mode === 'depth') settle();
    else if (t.mode === 'rail') endSlide();
    // A tap on the rail beside its buttons (at the screen edge, between two ticks)
    // opens the entry nearest to it; a tap on a button is its click.
    else if (!t.mode && t.onRail && !t.onEntry && e.type === 'touchend') {
      const b = entryAt(t.y, railMiddles());
      if (b) openEntry(b);
    }
  }
  function onClick(e: MouseEvent): void {
    const t = e.target as Element | null;
    // A label over a rail entry hands its click on to the switch inside it, which is
    // what makes the phone tick. The switch's click is that hand-over, not a second tap.
    const viaLabel = t?.closest?.(`[${TAP_LABEL}]`) || null;
    if (viaLabel && t !== viaLabel) return;
    // A click in a plane whose answers open on demand may open one: it is then
    // scrolled into view as it opens.
    const L = t?.closest?.<DepthLayer>('.fsb-depth-layer');
    if (L && layers.includes(L) && grows(L).length) L._armed = win.performance.now();
    const b = t?.closest?.<HTMLElement>('[data-depth-go]');
    if (!b || !root.contains(b)) return;
    // Cancelling a label's click stops it reaching the switch, and the tick with it.
    // That is right for a click that moves nothing: one on the entry the camera is
    // already on, or the click a short slide leaves behind on the entry the finger came
    // down on. That click is a tap after all when the slide went to that same entry:
    // the finger drifted a little, and the slide opened the entry under it.
    const stray = win.performance.now() - slidEnd < SLID_CLICK_MS;
    const quiet = !viaLabel || (stray ? b !== slidEntry : b.classList.contains('is-active'));
    if (quiet) e.preventDefault();
    if (stray) return;
    openEntry(b);
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
  widen();
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
      win.clearTimeout(widenT);
      win.clearTimeout(idle);
      win.cancelAnimationFrame(raf);
      mo?.disconnect();
      win.removeEventListener('load', rescan);
      cueEl?.style.removeProperty('--cue');
      railEl?.removeAttribute('data-sliding');
      for (const b of Array.from(tapLabels.keys())) unlabel(b);
      stage.removeAttribute('data-depth-live');
    },
  };
}
