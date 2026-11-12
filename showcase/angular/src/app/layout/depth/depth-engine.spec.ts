import { DepthEngine, createDepthEngine } from './depth-engine';

/* The engine against a bare stage: three planes, a rail, and the page styles from
   styles/depth.scss (loaded by the test build). */
describe('createDepthEngine', () => {
  let root: HTMLElement;
  let engine: DepthEngine | undefined;
  let seen: number[];

  function plane(label: string, height: number): string {
    return `<div class="fsb-depth-layer" data-label="${label}"><div class="fsb-depth-fit">` +
      `<section><h2 data-di="0" style="height:${height}px;margin:0">${label}</h2></section></div></div>`;
  }

  function build(heights: number[]): void {
    root = document.createElement('div');
    root.innerHTML =
      `<div class="fsb-depth" data-depth-stage tabindex="0">${heights.map((h, i) => plane('P' + i, h)).join('')}</div>` +
      `<nav class="fsb-depth-rail">${heights.map((_, i) => `<button class="fsb-depth-go" data-depth-go="${i}"></button>`).join('')}</nav>`;
    document.body.appendChild(root);
    seen = [];
    engine = createDepthEngine(root, { onActive: (i) => seen.push(i) });
  }

  const layers = (): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('.fsb-depth-layer'));
  const rail = (): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('.fsb-depth-go'));

  async function settle(index: number): Promise<void> {
    const until = Date.now() + 4000;
    while (Date.now() < until) {
      if (seen[seen.length - 1] === index && !layers()[index].hasAttribute('inert')) {
        await new Promise((r) => setTimeout(r, 50));
        return;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    fail(`plane ${index} never became active (saw ${seen.join(',')})`);
  }

  afterEach(() => {
    engine?.destroy();
    engine = undefined;
    root?.remove();
  });

  it('starts on the first plane and keeps the others out of reach', () => {
    build([120, 120, 120]);
    expect(seen).toEqual([0]);
    expect(layers().map((l) => l.hasAttribute('inert'))).toEqual([false, true, true]);
    expect(layers()[1].getAttribute('aria-hidden')).toBe('true');
    expect(rail()[0].classList).toContain('is-active');
    expect(rail()[0].getAttribute('aria-current')).toBe('step');
    expect(root.querySelector('[data-depth-stage]')!.hasAttribute('data-depth-live')).toBeTrue();
  });

  it('moves to a plane and marks it on the rail', async () => {
    build([120, 120, 120]);
    engine!.go(2);
    await settle(2);
    expect(layers().map((l) => l.hasAttribute('inert'))).toEqual([true, true, false]);
    expect(rail()[2].classList).toContain('is-active');
    expect(rail()[0].classList).not.toContain('is-active');
  });

  it('follows a click on the rail', async () => {
    build([120, 120, 120]);
    rail()[1].click();
    await settle(1);
    expect(layers()[1].hasAttribute('inert')).toBeFalse();
  });

  it('lets a plane far taller than the window scroll instead of shrinking it', () => {
    build([120, window.innerHeight * 4, 120]);
    const tall = layers()[1];
    expect(tall.hasAttribute('data-scroll')).toBeTrue();
    expect((tall.firstElementChild as HTMLElement).style.transform).toBe('');
  });

  it('scales a slightly taller plane down to fit', () => {
    // About 0.9: below 1, and above the bar at which a plane would scroll instead.
    build([120, Math.round((window.innerHeight - 172) / 0.9), 120]);
    const fitted = layers()[1];
    expect(fitted.hasAttribute('data-scroll')).toBeFalse();
    expect((fitted.firstElementChild as HTMLElement).style.transform).toMatch(/^scale\(0\.\d+\)$/);
  });

  describe('touch', () => {
    const canTouch = typeof Touch === 'function' && typeof TouchEvent === 'function';

    // A finger on the page: the event starts on the first plane and bubbles to the document.
    function touch(type: string, points: readonly (readonly [number, number])[]): TouchEvent {
      const target = layers()[0];
      const touches = points.map(([x, y], identifier) => new Touch({ identifier, target, clientX: x, clientY: y }));
      const e = new TouchEvent(type, { touches, changedTouches: touches, cancelable: true, bubbles: true });
      target.dispatchEvent(e);
      return e;
    }
    // A drag of this many pixels moves the camera about 0.3 of a plane: past the
    // point where letting go moves on, short of the point where rounding would.
    const nearDrag = (): number => Math.round(root.querySelector<HTMLElement>('[data-depth-stage]')!.clientHeight * 0.15);

    beforeEach(() => {
      if (!canTouch) pending('This browser has no Touch constructor');
    });

    it('leaves a sideways swipe to the page', () => {
      build([120, 120, 120]);
      touch('touchstart', [[300, 400]]);
      const move = touch('touchmove', [[240, 394]]);
      touch('touchmove', [[180, 380]]);
      touch('touchend', []);
      expect(move.defaultPrevented).toBeFalse();
      expect(seen).toEqual([0]);
      expect(layers()[0].hasAttribute('inert')).toBeFalse();
    });

    it('still takes an upward swipe to the next plane', async () => {
      build([120, 120, 120]);
      touch('touchstart', [[300, 600]]);
      const move = touch('touchmove', [[300, 590]]);
      touch('touchmove', [[300, 590 - nearDrag()]]);
      touch('touchend', []);
      expect(move.defaultPrevented).toBeTrue();
      await settle(1);
    });

    it('finishes the swipe on a plane when a second finger lands', async () => {
      build([120, 120, 120]);
      touch('touchstart', [[300, 600]]);
      touch('touchmove', [[300, 590]]);
      touch('touchmove', [[300, 590 - nearDrag()]]);
      touch('touchstart', [[300, 590 - nearDrag()], [380, 500]]);
      touch('touchend', []);
      await settle(1);
    });
  });

  it('cleans up after itself', () => {
    build([120, 120]);
    engine!.destroy();
    engine = undefined;
    expect(root.querySelector('[data-depth-stage]')!.hasAttribute('data-depth-live')).toBeFalse();
  });
});
