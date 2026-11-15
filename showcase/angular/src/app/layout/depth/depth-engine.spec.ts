import { DepthEngine, createDepthEngine } from './depth-engine';

/* The engine against a bare stage: three planes, a rail, and the page styles from
   styles/depth.scss (loaded by the test build). */
describe('createDepthEngine', () => {
  let root: HTMLElement;
  let engine: DepthEngine | undefined;
  let seen: number[];

  // A plane is a box of a fixed height, or any markup of its own.
  type PlaneSpec = number | { html: string; attrs?: string };

  function plane(label: string, spec: PlaneSpec): string {
    const inner = typeof spec === 'number'
      ? `<section><h2 data-di="0" style="height:${spec}px;margin:0">${label}</h2></section>`
      : spec.html;
    const attrs = typeof spec === 'number' ? '' : spec.attrs || '';
    return `<div class="fsb-depth-layer" data-label="${label}" ${attrs}><div class="fsb-depth-fit">${inner}</div></div>`;
  }

  // The rail laid out as the real one is, since its component styles are not loaded
  // here: a column of entries at the right edge, with a strip of its own beside them.
  const RAIL_STYLE = 'display:flex;flex-direction:column;padding-right:6px;position:fixed;right:0;top:80px';
  const entry = (layer: number, sec?: number): string =>
    `<button class="fsb-depth-go" data-depth-go="${layer}"${sec === undefined ? '' : ` data-depth-sec="${sec}"`}` +
    ' style="display:block;height:40px;margin:0;padding:0;width:30px"></button>';

  // `width` narrows the stage to a phone's, whatever the test window's size.
  function build(planes: PlaneSpec[], width?: number): void {
    root = document.createElement('div');
    const narrow = width ? ` style="right:auto;width:${width}px"` : '';
    root.innerHTML =
      `<div class="fsb-depth" data-depth-stage tabindex="0"${narrow}>${planes.map((h, i) => plane('P' + i, h)).join('')}</div>` +
      `<nav class="fsb-depth-rail" style="${RAIL_STYLE}">${planes.map((_, i) => entry(i)).join('')}</nav>`;
    document.body.appendChild(root);
    seen = [];
    engine = createDepthEngine(root, { onActive: (i) => seen.push(i) });
  }

  // The height a fitted plane has to itself: the window less the nav and the nav cue.
  // The stage fills the window, so this holds before a stage is built too.
  const room = (): number =>
    window.innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 64) - 108;
  const fitOf = (index: number): HTMLElement => layers()[index].firstElementChild as HTMLElement;
  const scaleOf = (index: number): number => parseFloat((fitOf(index).style.transform.match(/scale\(([^)]+)\)/) || ['', '1'])[1]);

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

  describe('on a narrow window', () => {
    const PHONE = 400;
    // Running text that would be `times` the room tall at the phone's width: how
    // tall it is depends on how wide it is laid out.
    function prose(times: number): string {
      const words = Math.round((times * PHONE * room()) / (5 * 9.6 * 24));
      return `<p data-di="0" style="font:16px/24px monospace;margin:0">${'word '.repeat(words)}</p>`;
    }

    it('fits a plane that a wide window would scroll', () => {
      const tall = Math.round((window.innerHeight - 172) / 0.5);
      build([120, tall, 120], PHONE);
      expect(layers()[1].hasAttribute('data-scroll')).toBeFalse();
      expect(scaleOf(1)).toBeLessThan(0.6);
      expect(scaleOf(1)).toBeGreaterThan(0.45);
    });

    it('lays a plane out wider than the window so it shrinks less', () => {
      // Shrunk at the window's own width this would be about 0.42 of its size.
      build([120, { html: prose(2.4) }, 120], PHONE);
      const fit = fitOf(1);
      const scale = scaleOf(1);
      expect(layers()[1].hasAttribute('data-scroll')).toBeFalse();
      expect(parseFloat(fit.style.width)).toBeGreaterThan(110);
      expect(scale).toBeGreaterThan(0.5);
      expect(fit.offsetWidth * scale).toBeCloseTo(PHONE, -1);
      expect(fit.offsetHeight * scale).toBeLessThanOrEqual(room() + 1);
    });

    it('lays a box of a fixed height out just wide enough to fill the window', () => {
      // Widening gains it nothing: it keeps its scale, and spans the window.
      build([120, Math.round(room() / 0.7), 120], PHONE);
      const fit = fitOf(1);
      const scale = scaleOf(1);
      expect(scale).toBeCloseTo(0.7, 1);
      expect(parseFloat(fit.style.width)).toBeGreaterThan(130);
      expect(fit.offsetWidth * scale).toBeCloseTo(PHONE, -1);
    });

    it('keeps a picture that grows with its width at its own width', () => {
      // A box that keeps its proportions, 1 / 0.7 times the room tall at the phone's width.
      const side = Math.round(room() / 0.7);
      build([120, { html: `<div data-di="0" style="aspect-ratio:${PHONE} / ${side};background:#333;width:100%"></div>` }, 120], PHONE);
      expect(fitOf(1).style.width).toBe('');
      expect(scaleOf(1)).toBeCloseTo(0.7, 1);
    });

    it('keeps a rigid plane at its own width', () => {
      build([120, { html: prose(1.5), attrs: 'data-depth-rigid' }, 120], PHONE);
      expect(fitOf(1).style.width).toBe('');
      expect(scaleOf(1)).toBeLessThan(0.75);
    });

    // Resolves once the browser has drawn `n` more frames, so what is read is what
    // was on screen.
    const frames = (n: number): Promise<void> =>
      new Promise((resolve) => {
        const step = (k: number): void => {
          if (k <= 0) resolve();
          else requestAnimationFrame(() => setTimeout(() => step(k - 1)));
        };
        step(n);
      });

    it('lays a plane out again as soon as its content grows', async () => {
      build([120, { html: `<div class="more">${prose(0.8)}</div>` }, 120], PHONE);
      const fit = fitOf(1);
      expect(fit.style.width).toBe('');
      root.querySelector('.more')!.insertAdjacentHTML('beforeend', prose(1.6));
      await frames(4);
      const scale = scaleOf(1);
      expect(parseFloat(fit.style.width)).toBeGreaterThan(110);
      expect(fit.offsetWidth * scale).toBeCloseTo(PHONE, -1);
      expect(fit.offsetHeight * scale).toBeLessThanOrEqual(room() + 1);
    });

    it('keeps a plane fitted on every frame while its content opens, and leaves it there', async () => {
      // The way a support answer opens: a grid row eased from nothing to its content,
      // under rows that a wider layout would not make any shorter (the questions).
      const opens =
        '<div class="opens" style="display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s linear">' +
        `<div style="min-height:0;overflow:hidden">${prose(1.5)}</div></div>`;
      build([120, { html: `<div style="height:${Math.round(room() / 0.9)}px"></div>${opens}` }, 120], PHONE);
      // By now the plane's own scale would be eased.
      await new Promise((r) => setTimeout(r, 700));
      const fit = fitOf(1);
      const drawn = (): number => {
        const m = getComputedStyle(fit).transform;
        return m === 'none' ? 1 : new DOMMatrix(m).a;
      };
      root.querySelector<HTMLElement>('.opens')!.style.gridTemplateRows = '1fr';
      let tallest = 0;
      let narrowest = Infinity;
      const start = performance.now();
      // From the third frame on: the first ones show the row barely started.
      for (let n = 1; performance.now() - start < 450; n++) {
        await frames(1);
        if (n < 3) continue;
        const s = drawn();
        tallest = Math.max(tallest, fit.offsetHeight * s);
        narrowest = Math.min(narrowest, fit.offsetWidth * s);
      }
      expect(tallest).toBeLessThanOrEqual(room() + 2);
      // Fitted or shrunk, it spans the window: no frame switches it from its own
      // width to a wider layout.
      expect(narrowest).toBeGreaterThan(PHONE - 2);
      expect(parseFloat(fit.style.width)).toBeGreaterThan(110);
      const width = fit.style.width;
      const transform = fit.style.transform;
      await new Promise((r) => setTimeout(r, 300));
      expect(fit.style.width).toBe(width);
      expect(fit.style.transform).toBe(transform);
    });
  });

  describe('a row that scrolls sideways', () => {
    const card = (di: string): string => `<div data-di="${di}" style="background:#333;flex:0 0 80%;height:60px">card</div>`;
    const row = (style: string): string => `<div class="row" style="display:flex;${style}">${card('0.2')}${card('0.4')}</div>`;

    it('travels as one piece, so its cards are not cut off as they fly', () => {
      build([120, { html: row('overflow-x:auto') }, 120]);
      const el = root.querySelector<HTMLElement>('.row')!;
      expect(el.getAttribute('data-di')).toBe('0.2');
      expect(el.querySelectorAll('[data-di]').length).toBe(0);
    });

    it('is left alone when it does not scroll', () => {
      build([120, { html: row('') }, 120]);
      const el = root.querySelector<HTMLElement>('.row')!;
      expect(el.hasAttribute('data-di')).toBeFalse();
      expect(el.querySelectorAll('[data-di]').length).toBe(2);
    });
  });

  describe('touch', () => {
    const canTouch = typeof Touch === 'function' && typeof TouchEvent === 'function';

    // A finger on the page: the event starts on the first plane (or `target`) and
    // bubbles to the document. A touch's events all go to where it came down.
    function touch(type: string, points: readonly (readonly [number, number])[], target: Element = layers()[0]): TouchEvent {
      const touches = points.map(([x, y], identifier) => new Touch({ identifier, target, clientX: x, clientY: y }));
      const e = new TouchEvent(type, { touches, changedTouches: touches, cancelable: true, bubbles: true });
      target.dispatchEvent(e);
      return e;
    }
    // A drag of this many pixels moves the camera about 0.3 of a plane: past the
    // point where letting go moves on, short of the point where rounding would.
    const nearDrag = (): number => Math.round(root.querySelector<HTMLElement>('[data-depth-stage]')!.clientHeight * 0.15);

    const bar = (): HTMLElement => root.querySelector<HTMLElement>('.fsb-depth-rail')!;
    const marked = (): number => rail().findIndex((b) => b.classList.contains('is-active'));
    // The middle of a rail entry, where a finger on it rests.
    function mid(i: number): [number, number] {
      const r = rail()[i].getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    }
    // A finger comes down on entry `from`, slides a few pixels to get going, then to
    // the middle of each entry in `to` in turn, and lifts.
    function slide(from: number, to: readonly number[]): void {
      const start = rail()[from];
      const [x, y] = mid(from);
      touch('touchstart', [[x, y]], start);
      touch('touchmove', [[x, y + (to[0] < from ? -6 : 6)]], start);
      for (const i of to) touch('touchmove', [[x, mid(i)[1]]], start);
      touch('touchend', [], start);
    }
    // A plane that scrolls through three sections, a screen each, with a rail entry
    // for each section and none for the planes around it.
    function buildSections(): void {
      const h = window.innerHeight;
      const sections = [0, 1, 2].map((j) => `<section data-depth-anchor style="height:${h}px;margin:0">S${j}</section>`).join('');
      build([120, { html: sections, attrs: 'data-scroll' }, 120]);
      bar().innerHTML = [0, 1, 2].map((j) => entry(1, j)).join('');
      engine!.refreshRail();
    }
    async function until(done: () => boolean, ms = 3000): Promise<void> {
      const end = Date.now() + ms;
      while (Date.now() < end && !done()) await new Promise((r) => setTimeout(r, 30));
    }

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

    describe('along the rail', () => {
      it('runs through the planes as a finger slides down it, and back up', async () => {
        build([120, 120, 120, 120, 120]);
        const start = rail()[0];
        const [x, y] = mid(0);
        touch('touchstart', [[x, y]], start);
        const first = touch('touchmove', [[x, y + 6]], start);
        expect(first.defaultPrevented).toBeTrue();
        expect(bar().hasAttribute('data-sliding')).toBeTrue();
        touch('touchmove', [[x, mid(1)[1]]], start);
        expect(marked()).toBe(1);
        touch('touchmove', [[x, mid(3)[1]]], start);
        expect(marked()).toBe(3);
        touch('touchend', [], start);
        expect(bar().hasAttribute('data-sliding')).toBeFalse();
        await settle(3);

        slide(3, [2, 1]);
        await settle(1);
        expect(marked()).toBe(1);
      });

      it('keeps following the finger once it drifts off the rail', async () => {
        build([120, 120, 120, 120, 120]);
        const start = rail()[0];
        const [x, y] = mid(0);
        touch('touchstart', [[x, y]], start);
        touch('touchmove', [[x, y + 6]], start);
        touch('touchmove', [[x - 240, mid(4)[1]]], start);
        expect(marked()).toBe(4);
        touch('touchend', [], start);
        await settle(4);
      });

      it('keeps the entry where the finger lifted marked while the camera catches up', async () => {
        build([120, 120, 120, 120, 120]);
        slide(0, [4]);
        // The camera has hardly left the first plane, and would pass 2 and 3 on the rail.
        expect(layers()[4].hasAttribute('inert')).toBeTrue();
        expect(marked()).toBe(4);
        await new Promise((r) => setTimeout(r, 150));
        expect(marked()).toBe(4);
        await settle(4);
        expect(marked()).toBe(4);
      });

      it('leaves a sideways swipe from the rail alone', () => {
        // That is how a phone goes back, from the edge of the screen.
        build([120, 120, 120]);
        const start = rail()[1];
        const [x, y] = mid(1);
        touch('touchstart', [[x, y]], start);
        const move = touch('touchmove', [[x - 12, y + 2]], start);
        touch('touchmove', [[x - 60, y + 5]], start);
        touch('touchend', [], start);
        expect(move.defaultPrevented).toBeFalse();
        expect(bar().hasAttribute('data-sliding')).toBeFalse();
        expect(seen).toEqual([0]);
        expect(marked()).toBe(0);
      });

      it('ignores the click a short slide can still send, then takes taps again', async () => {
        build([120, 120, 120]);
        // From the foot of the first entry a few pixels into the second: short enough
        // for a browser to still count it as a tap on the first.
        const start = rail()[0];
        const foot = start.getBoundingClientRect().bottom;
        const x = mid(0)[0];
        touch('touchstart', [[x, foot - 1]], start);
        touch('touchmove', [[x, foot + 4]], start);
        touch('touchend', [], start);
        start.click();
        await settle(1);
        await new Promise((r) => setTimeout(r, 400));
        expect(seen[seen.length - 1]).toBe(1);
        rail()[2].click();
        await settle(2);
      });

      it('opens the entry nearest a tap beside its buttons', async () => {
        build([120, 120, 120]);
        const edge = bar().getBoundingClientRect().right - 2;
        // A touch the phone takes back is not a tap.
        touch('touchstart', [[edge, mid(1)[1]]], bar());
        touch('touchcancel', [], bar());
        expect(seen).toEqual([0]);
        touch('touchstart', [[edge, mid(2)[1]]], bar());
        touch('touchend', [], bar());
        await settle(2);
      });

      it('runs through the sections of a plane that scrolls', async () => {
        buildSections();
        slide(0, [1, 2]);
        await settle(1);
        await until(() => layers()[1].scrollTop > window.innerHeight * 1.5);
        expect(layers()[1].scrollTop).toBeGreaterThan(window.innerHeight * 1.5);
        expect(marked()).toBe(2);
      });
    });

    describe('haptics', () => {
      let vibrate: jasmine.Spy;
      const tapped = (yes: boolean): void => {
        spyOnProperty(Navigator.prototype, 'userActivation', 'get').and.returnValue({ hasBeenActive: yes, isActive: yes } as UserActivation);
      };
      function swipe(distance: number): void {
        touch('touchstart', [[300, 600]]);
        touch('touchmove', [[300, 590]]);
        touch('touchmove', [[300, 590 - distance]]);
        touch('touchend', []);
      }

      beforeEach(() => {
        if (typeof navigator.vibrate !== 'function') pending('This browser cannot vibrate');
        vibrate = spyOn(Navigator.prototype, 'vibrate').and.returnValue(true);
      });

      it('ticks once when a swipe lands on another plane', async () => {
        tapped(true);
        build([120, 120, 120]);
        swipe(nearDrag());
        expect(vibrate).toHaveBeenCalledTimes(1);
        await settle(1);
        expect(vibrate).toHaveBeenCalledTimes(1);
      });

      it('stays quiet when a swipe settles back where it started', () => {
        tapped(true);
        build([120, 120, 120]);
        swipe(3);
        expect(seen).toEqual([0]);
        expect(vibrate).not.toHaveBeenCalled();
      });

      it('stays quiet until the page has been tapped', async () => {
        tapped(false);
        build([120, 120, 120]);
        swipe(nearDrag());
        await settle(1);
        expect(vibrate).not.toHaveBeenCalled();
      });

      it('stays quiet for a wheel or a key', async () => {
        tapped(true);
        build([120, 120, 120]);
        engine!.go(1);
        await settle(1);
        expect(vibrate).not.toHaveBeenCalled();
      });

      it('ticks once for each entry a finger slides past on the rail', async () => {
        tapped(true);
        build([120, 120, 120, 120, 120]);
        const start = rail()[0];
        const [x, y] = mid(0);
        touch('touchstart', [[x, y]], start);
        touch('touchmove', [[x, y + 6]], start);
        // Still on the entry it came down on.
        expect(vibrate).not.toHaveBeenCalled();
        for (let i = 1; i <= 4; i++) touch('touchmove', [[x, mid(i)[1]]], start);
        touch('touchend', [], start);
        expect(vibrate).toHaveBeenCalledTimes(4);
        await settle(4);
        expect(vibrate).toHaveBeenCalledTimes(4);
      });

      it('ticks for each section a finger slides past in a plane that scrolls', async () => {
        tapped(true);
        buildSections();
        // Into the plane (one tick), then two more of its sections.
        slide(0, [1, 2]);
        expect(vibrate).toHaveBeenCalledTimes(3);
        await settle(1);
        expect(vibrate).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('wheel', () => {
    // A wheel notch or trackpad step, dispatched on the stage and bubbling to the document.
    function wheel(deltaY: number): void {
      root.querySelector('[data-depth-stage]')!.dispatchEvent(new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true }));
    }
    const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    const activeIndex = (): number => layers().findIndex((l) => !l.hasAttribute('inert'));
    async function burst(deltas: readonly number[]): Promise<void> {
      for (const d of deltas) {
        wheel(d);
        await pause(16);
      }
    }

    it('keeps moving while a mouse wheel is rolled on', async () => {
      build([120, 120, 120]);
      for (let i = 0; i < 10 && activeIndex() < 2; i++) {
        wheel(120);
        await pause(250);
      }
      await settle(2);
      expect(activeIndex()).toBe(2);
    }, 10000);

    it('scrolls a plane that scrolls inside itself while the wheel rolls on', async () => {
      build([120, window.innerHeight * 8, 120]);
      for (let i = 0; i < 8; i++) {
        wheel(120);
        await pause(250);
      }
      expect(activeIndex()).toBe(1);
      expect(layers()[1].scrollTop).toBeGreaterThan(0);
    }, 10000);

    // A trackpad swipe begun right after the snap ramps up gently, never in one jump.
    it('takes a fresh swipe that starts right after a plane snaps into place', async () => {
      build([120, 120, 120]);
      wheel(120);
      await pause(200);
      await burst([10, 14, 19, 25, 32, 40, 50, 62]);
      await settle(2);
      expect(activeIndex()).toBe(2);
    }, 10000);

    // Trackpad swipes: a push that climbs, then a momentum tail that ebbs.
    const swipe = (peak: number, until = 1): number[] => {
      const steps = [2, 4, 8, 14, 20, peak];
      for (let d = peak * 0.93; d >= until; d *= 0.93) steps.push(Math.round(d));
      return steps;
    };

    it('takes a swipe that lands on the last one\'s momentum before it has died out', async () => {
      build([120, 120, 120]);
      await burst(swipe(28, 3));
      await burst(swipe(28));
      await settle(2);
      expect(activeIndex()).toBe(2);
    }, 10000);

    // The push jumps from 20 to 45 on the way up, which must not split it in two.
    it('moves one plane for one swipe, however long its momentum runs', async () => {
      build([120, 120, 120]);
      await burst(swipe(45, 0.5).map((d) => Math.max(1, d)));
      await settle(1);
      await pause(400);
      expect(activeIndex()).toBe(1);
      expect(seen).not.toContain(2);
    }, 10000);

    it('still eats the momentum of the swipe that changed planes', async () => {
      build([120, 120, 120]);
      wheel(120);
      await pause(200);
      await burst([100, 80, 60, 40, 20]);
      await settle(1);
      await pause(500);
      expect(activeIndex()).toBe(1);
      expect(seen).not.toContain(2);
    }, 10000);

    // A slow drag with the fingers down throughout: its speed rises and falls as it
    // goes, and it covers this many planes of travel.
    const waver = (planes: number): number[] => {
      const travel = root.querySelector<HTMLElement>('[data-depth-stage]')!.clientHeight * 0.75 * planes;
      const steps: number[] = [];
      for (let i = 0, sum = 0; sum < travel; i++) {
        const d = Math.round(8 + 4 * Math.sin((2 * Math.PI * i) / 10));
        steps.push(d);
        sum += d;
      }
      return steps;
    };

    it('keeps a slow drag that wavers to one plane', async () => {
      build([120, 120, 120, 120, 120]);
      await burst(waver(1));
      await settle(1);
      await pause(400);
      expect(activeIndex()).toBe(1);
      expect(seen).not.toContain(2);
    }, 10000);

    it('carries a slow wavering drag on, one plane per plane of travel', async () => {
      build([120, 120, 120, 120, 120]);
      await burst(waver(2));
      await settle(2);
      await pause(400);
      expect(activeIndex()).toBe(2);
      expect(seen).not.toContain(3);
    }, 10000);
  });

  it('starts even when the fragment is not valid percent-encoding', () => {
    const url = location.href;
    history.replaceState(null, '', '#100%');
    try {
      build([120, 120, 120]);
      expect(root.querySelector('[data-depth-stage]')!.hasAttribute('data-depth-live')).toBeTrue();
      expect(seen).toEqual([0]);
    } finally {
      history.replaceState(null, '', url);
    }
  });

  it('cleans up after itself', () => {
    build([120, 120]);
    engine!.destroy();
    engine = undefined;
    expect(root.querySelector('[data-depth-stage]')!.hasAttribute('data-depth-live')).toBeFalse();
  });
});
