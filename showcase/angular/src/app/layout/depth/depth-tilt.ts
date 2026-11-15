/* Tilt: buttons lean very slightly toward the pointer and lift off the page, the
   same language as the site index at the end of each page. The side under the
   pointer recedes and a soft sheen follows it. Eased in JS so leaving a button
   settles back smoothly. Pure style writes; the [data-tilt] rules in
   styles/_depth.scss do the drawing. */

export interface DepthTilt {
  destroy(): void;
}

interface TiltRecord {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  gx: number;
  gy: number;
  gz: number;
  gnx: number;
  gny: number;
  mx: number;
  my: number;
  down: boolean;
}

const LIFT = 10;
const TILT_VARS = ['--tilt-x', '--tilt-y', '--tilt-z', '--tilt-nx', '--tilt-ny'];

export function createDepthTilt(root: HTMLElement, selector: string): DepthTilt {
  const doc = root.ownerDocument;
  const win = (doc.defaultView || window) as Window & typeof globalThis;
  if (win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) return { destroy: () => undefined };
  let live: TiltRecord[] = [];
  let cur: TiltRecord | null = null;
  let raf = 0;

  function rec(el: HTMLElement): TiltRecord {
    const found = live.find((r) => r.el === el);
    if (found) return found;
    const r: TiltRecord = { el, x: 0, y: 0, z: 0, nx: 0, ny: 0, gx: 0, gy: 0, gz: 0, gnx: 0, gny: 0, mx: 8, my: 8, down: false };
    live.push(r);
    return r;
  }
  // The lean is capped so the near edge never rises more than ~9px off the page.
  const lim = (size: number, cap: number): number => Math.min(cap, Math.asin(Math.min(1, 9 / Math.max(size / 2, 1))) * 57.2958);
  function enter(el: HTMLElement): void {
    const r = rec(el);
    r.my = lim(el.offsetWidth || 100, 11);
    r.mx = lim(el.offsetHeight || 40, 9);
    r.gz = LIFT;
    r.down = false;
    el.setAttribute('data-tilt', '');
    cur = r;
    kick();
  }
  function leave(r: TiltRecord): void {
    r.gx = r.gy = r.gz = r.gnx = r.gny = 0;
    r.down = false;
    if (cur === r) cur = null;
    kick();
  }
  function aim(r: TiltRecord, cx: number, cy: number): void {
    const b = r.el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const nx = Math.max(-1, Math.min(1, ((cx - b.left) / b.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((cy - b.top) / b.height) * 2 - 1));
    const f = r.down ? 0.45 : 1;
    r.gnx = nx;
    r.gny = ny;
    r.gy = nx * r.my * f;
    r.gx = -ny * r.mx * f;
    r.gz = r.down ? -3 : LIFT;
    kick();
  }
  function kick(): void {
    if (!raf) raf = win.requestAnimationFrame(step);
  }
  function step(): void {
    raf = 0;
    const k = 0.17;
    let again = false;
    for (let i = live.length - 1; i >= 0; i--) {
      const r = live[i];
      const s = r.el.style;
      r.x += (r.gx - r.x) * k;
      r.y += (r.gy - r.y) * k;
      r.z += (r.gz - r.z) * k;
      r.nx += (r.gnx - r.nx) * k;
      r.ny += (r.gny - r.ny) * k;
      const settled = Math.abs(r.gx - r.x) < 0.02 && Math.abs(r.gy - r.y) < 0.02 && Math.abs(r.gz - r.z) < 0.04;
      if (settled && r !== cur && !r.gz) {
        TILT_VARS.forEach((n) => s.removeProperty(n));
        r.el.removeAttribute('data-tilt');
        live.splice(i, 1);
        continue;
      }
      s.setProperty('--tilt-x', r.x.toFixed(3));
      s.setProperty('--tilt-y', r.y.toFixed(3));
      s.setProperty('--tilt-z', r.z.toFixed(3));
      s.setProperty('--tilt-nx', r.nx.toFixed(3));
      s.setProperty('--tilt-ny', r.ny.toFixed(3));
      if (!settled) again = true;
    }
    if (again) kick();
  }
  function pick(target: EventTarget | null): HTMLElement | null {
    const t = (target as Element | null)?.closest?.<HTMLElement>(selector) ?? null;
    if (t && (!root.contains(t) || (t as HTMLButtonElement).disabled)) return null;
    return t;
  }
  // An overlay sitting on the button (a popover's hover bridge, say) should not drop the tilt.
  function inside(r: TiltRecord, cx: number, cy: number): boolean {
    const b = r.el.getBoundingClientRect();
    return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
  }
  function onMove(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    let t = pick(e.target);
    if (!t && cur && inside(cur, e.clientX, e.clientY)) t = cur.el;
    if (!cur || cur.el !== t) {
      if (cur) leave(cur);
      if (t) enter(t);
    }
    if (cur) aim(cur, e.clientX, e.clientY);
  }
  function onOut(e: PointerEvent): void {
    if (!cur) return;
    const to = e.relatedTarget;
    const t = to ? pick(to) : null;
    if (t === cur.el || (!t && to && inside(cur, e.clientX, e.clientY))) return;
    leave(cur);
  }
  function onDown(e: PointerEvent): void {
    if (cur && e.pointerType !== 'touch' && cur.el.contains(e.target as Node)) {
      cur.down = true;
      aim(cur, e.clientX, e.clientY);
    }
  }
  function onUp(e: PointerEvent): void {
    if (cur && cur.down) {
      cur.down = false;
      aim(cur, e.clientX, e.clientY);
    }
  }
  function onWheel(): void {
    if (cur) leave(cur);
  }
  root.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('pointerout', onOut, { passive: true });
  root.addEventListener('pointerdown', onDown, { passive: true });
  win.addEventListener('pointerup', onUp, { passive: true });
  root.addEventListener('wheel', onWheel, { passive: true });
  return {
    destroy(): void {
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerout', onOut);
      root.removeEventListener('pointerdown', onDown);
      win.removeEventListener('pointerup', onUp);
      root.removeEventListener('wheel', onWheel);
      if (raf) win.cancelAnimationFrame(raf);
      for (const r of live) {
        r.el.removeAttribute('data-tilt');
        TILT_VARS.forEach((n) => r.el.style.removeProperty(n));
      }
      live = [];
      cur = null;
    },
  };
}
