/* The closing plane floats toward the pointer on a desktop. A phone has no pointer,
   so there the same two numbers (--px and --py, each from -1 to 1) come from how
   the phone is tilted: lean it and the groups drift that way.

   Android browsers hand tilt to a page without asking. An iPhone asks first, and
   this never does: where a browser would have to ask, nothing is attached and the
   plane stays as still as it was. Pure style writes, like depth-tilt.ts. */

export interface DepthSway {
  destroy(): void;
}

/* The tilt, in degrees, that carries the floats to the end of their travel. */
const RANGE_DEG = 15;
/* How long the resting posture takes to follow the way the phone is now held, so
   the plane settles back to its centre however the phone ends up. */
const SETTLE_MS = 4000;
/* The styles ease every change over a second, so a dozen writes a second is plenty. */
const WRITE_EVERY_MS = 80;
/* A phone held perfectly still stops reporting, so settling also runs on a clock. */
const SETTLE_EVERY_MS = 250;

const TOUCH_FIRST = '(hover: none) and (pointer: coarse)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const clamp = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

/* Whether tilt arrives without a permission dialog. Browsers that can ask carry
   requestPermission; of those, only one that already counts the motion sensors as
   granted (Chrome, unless the visitor switched them off) delivers anything unasked.
   Safari does not know these permission names, so the query fails there. */
async function readableUnasked(win: Window): Promise<boolean> {
  const orientation = (win as Window & { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent;
  if (!orientation) return false;
  if (typeof orientation.requestPermission !== 'function') return true;
  const permissions = win.navigator.permissions;
  if (!permissions || typeof permissions.query !== 'function') return false;
  try {
    const states = await Promise.all(
      ['accelerometer', 'gyroscope'].map((name) => permissions.query({ name: name as unknown as PermissionName })),
    );
    return states.every((status) => status.state === 'granted');
  } catch {
    return false;
  }
}

/** Sways the element with the phone while its plane is the one in view. */
export function createDepthSway(el: HTMLElement): DepthSway {
  const none: DepthSway = { destroy: () => undefined };
  const win = el.ownerDocument.defaultView;
  const plane = el.closest<HTMLElement>('.fsb-depth-layer');
  if (!win || !plane) return none;
  const matches = (query: string): boolean => !!win.matchMedia?.(query).matches;
  if (!matches(TOUCH_FIRST) || matches(REDUCED_MOTION)) return none;
  // Browsers only give tilt to secure pages; elsewhere the event does not exist.
  if (win.isSecureContext === false || !('ondeviceorientation' in win)) return none;

  let alive = true;
  let unasked = false;
  let listening = false;
  let rested = false;
  let heldX = 0;
  let heldY = 0;
  let restX = 0;
  let restY = 0;
  let lastStep = 0;
  let lastWrite = 0;
  let settling = 0;
  let wroteX = 0;
  let wroteY = 0;

  function write(x: number, y: number): void {
    wroteX = x;
    wroteY = y;
    el.style.setProperty('--px', x.toFixed(3));
    el.style.setProperty('--py', y.toFixed(3));
  }

  function onTilt(e: DeviceOrientationEvent): void {
    if (e.beta == null || e.gamma == null) return;
    // beta (tipped forward or back) and gamma (leaned left or right) are measured
    // against the phone, not the screen: with the phone on its side the two swap.
    const turned = ((win!.screen?.orientation?.angle ?? 0) + 360) % 360;
    let x = e.gamma;
    let y = e.beta;
    if (turned === 90) {
      x = e.beta;
      y = -e.gamma;
    } else if (turned === 270) {
      x = -e.beta;
      y = e.gamma;
    } else if (turned === 180) {
      x = -e.gamma;
      y = -e.beta;
    }
    heldX = x;
    heldY = y;
    if (!rested) {
      rested = true;
      restX = x;
      restY = y;
      lastStep = win!.performance.now();
    }
    step();
  }

  // The resting posture follows the way the phone is held, and the floats sit as
  // far from their centre as the phone is from that posture.
  function step(): void {
    if (!rested) return;
    const now = win!.performance.now();
    const follow = 1 - Math.exp(-(now - lastStep) / SETTLE_MS);
    lastStep = now;
    restX += (heldX - restX) * follow;
    restY += (heldY - restY) * follow;
    const px = clamp((heldX - restX) / RANGE_DEG);
    const py = clamp((heldY - restY) / RANGE_DEG);
    if (now - lastWrite < WRITE_EVERY_MS) return;
    if (Math.abs(px - wroteX) < 0.01 && Math.abs(py - wroteY) < 0.01) return;
    lastWrite = now;
    write(px, py);
  }

  // The sensors run only while this plane is the one in view. The depth engine
  // marks every other plane inert, so that attribute is the signal.
  function sync(): void {
    const want = alive && unasked && !plane!.hasAttribute('inert');
    if (want === listening) return;
    listening = want;
    if (want) {
      rested = false;
      win!.addEventListener('deviceorientation', onTilt, { passive: true });
      settling = win!.setInterval(step, SETTLE_EVERY_MS);
    } else {
      win!.removeEventListener('deviceorientation', onTilt);
      win!.clearInterval(settling);
      if (wroteX || wroteY) write(0, 0);
    }
  }

  const observer = new win.MutationObserver(sync);
  observer.observe(plane, { attributes: true, attributeFilter: ['inert'] });
  void readableUnasked(win).then((ok) => {
    unasked = ok;
    sync();
  });

  return {
    destroy(): void {
      alive = false;
      observer.disconnect();
      sync();
    },
  };
}
