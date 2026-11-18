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

    it('leaves a box of a fixed height at its own width', () => {
      build([120, Math.round(room() / 0.7), 120], PHONE);
      expect(fitOf(1).style.width).toBe('');
      expect(scaleOf(1)).toBeCloseTo(0.7, 1);
    });

    it('keeps a rigid plane at its own width', () => {
      build([120, { html: prose(1.5), attrs: 'data-depth-rigid' }, 120], PHONE);
      expect(fitOf(1).style.width).toBe('');
      expect(scaleOf(1)).toBeLessThan(0.75);
    });

    it('keeps its width and scale when an answer opens on demand', async () => {
      const opens =
        '<div class="answer" data-depth-grows style="display:grid;grid-template-rows:0fr">' +
        `<div style="min-height:0;overflow:hidden">${prose(1)}</div></div>`;
      build([120, { html: prose(2.4) + opens }, 120], PHONE);
      const fit = fitOf(1);
      const width = fit.style.width;
      const scale = scaleOf(1);
      expect(parseFloat(width)).toBeGreaterThan(110);
      root.querySelector<HTMLElement>('.answer')!.style.gridTemplateRows = '1fr';
      // Past the moment a plane whose content changed would be laid out again.
      await new Promise((r) => setTimeout(r, 400));
      expect(fit.style.width).toBe(width);
      expect(scaleOf(1)).toBe(scale);
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

    // An iPhone cannot vibrate from script: it ticks only when a finger taps a native
    // switch or a label for one. This browser is made to look like one (or, with a
    // flag turned off, like a phone that is not) before the engine starts.
    describe('on a phone that ticks only for a tapped switch', () => {
      function phone(is: { vibrates?: boolean; switches?: boolean; touches?: boolean } = {}): void {
        if (!is.vibrates) Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true });
        if (is.switches !== false) Object.defineProperty(HTMLInputElement.prototype, 'switch', { value: false, configurable: true, writable: true });
        spyOnProperty(Navigator.prototype, 'maxTouchPoints', 'get').and.returnValue(is.touches === false ? 0 : 5);
      }
      const labels = (): HTMLLabelElement[] => Array.from(root.querySelectorAll<HTMLLabelElement>('label[data-depth-tick]'));
      const switchOf = (i: number): HTMLInputElement => rail()[i].querySelector<HTMLInputElement>('label[data-depth-tick] > input')!;
      // The part of an entry inside its border, which is what a label over it is laid out against.
      function inside(b: HTMLElement): { left: number; top: number; right: number; bottom: number } {
        const r = b.getBoundingClientRect();
        const left = r.left + b.clientLeft;
        const top = r.top + b.clientTop;
        return { left, top, right: left + b.clientWidth, bottom: top + b.clientHeight };
      }
      // Page rules a test adds, as a phone's own width would.
      let rules: HTMLStyleElement | undefined;

      afterEach(() => {
        delete (navigator as unknown as { vibrate?: unknown }).vibrate;
        delete (HTMLInputElement.prototype as unknown as { switch?: unknown }).switch;
        rules?.remove();
        rules = undefined;
      });

      it('puts a label for a hidden switch over each rail entry and the strip beside it', () => {
        phone();
        build([120, 120, 120]);
        expect(labels().length).toBe(3);
        rail().forEach((b, i) => {
          const label = labels()[i];
          expect(label.parentElement).toBe(b);
          expect(label.getAttribute('aria-hidden')).toBe('true');
          const sw = switchOf(i);
          expect(sw.type).toBe('checkbox');
          expect(sw.hasAttribute('switch')).toBeTrue();
          expect(sw.tabIndex).toBe(-1);
          expect(sw.name).toBe('');
          expect(getComputedStyle(sw).visibility).toBe('hidden');
          const box = inside(b);
          const r = label.getBoundingClientRect();
          expect(r.left).toBeCloseTo(box.left, 0);
          expect(r.top).toBeCloseTo(box.top, 0);
          expect(r.bottom).toBeCloseTo(box.bottom, 0);
          // The rail's own 6px beside its entries, out to the screen edge.
          expect(r.right).toBeCloseTo(box.right + 6, 0);
        });
      });

      it('keeps each label over its own entry when the rule that placed the entries stops applying', () => {
        // On a phone held upright the rail's rules place each entry; turned sideways the
        // window is too wide for those rules, and they stop applying.
        rules = document.head.appendChild(document.createElement('style'));
        rules.textContent = '.fsb-depth-go { position: relative; }';
        phone();
        build([120, 120, 120]);
        rules.remove();
        rail().forEach((b, i) => {
          const box = inside(b);
          const r = labels()[i].getBoundingClientRect();
          expect(r.left).toBeCloseTo(box.left, 0);
          expect(r.top).toBeCloseTo(box.top, 0);
          expect(r.bottom).toBeCloseTo(box.bottom, 0);
          expect(r.right).toBeCloseTo(box.right + 6, 0);
        });
      });

      it('measures the strip beside the entries again when the window changes', async () => {
        phone();
        build([120, 120, 120]);
        const stage = root.querySelector<HTMLElement>('[data-depth-stage]')!;
        const b = rail()[1];
        const label = labels()[1];
        const reach = (): number => label.getBoundingClientRect().right - inside(b).right;
        // Turning a phone changes the rail's rules and the window's size together.
        function turn(edge: number, width: number): void {
          bar().style.paddingRight = `${edge}px`;
          stage.style.right = 'auto';
          stage.style.width = `${width}px`;
        }
        turn(0, window.innerWidth - 20);
        await until(() => Math.abs(reach()) < 0.5);
        expect(reach()).toBeCloseTo(0, 0);
        turn(6, window.innerWidth);
        await until(() => Math.abs(reach() - 6) < 0.5);
        expect(reach()).toBeCloseTo(6, 0);
      });

      it('reaches the rail\'s far edge beside an entry narrower than the rest', () => {
        phone();
        build([120, 120, 120]);
        // As on the page: entries held against the screen edge, each as wide as what it
        // holds, and the current one's tick the longest.
        const nav = bar();
        nav.style.alignItems = 'flex-end';
        rail().forEach((b, i) => {
          b.style.width = '';
          b.style.paddingLeft = i ? '22px' : '30px';
        });
        const outer = nav.getBoundingClientRect();
        const left = outer.left + nav.clientLeft;
        rail().forEach((b, i) => {
          const r = labels()[i].getBoundingClientRect();
          // From the rail's far side, where a tap opens this entry too, out to the screen edge.
          expect(r.left).toBeCloseTo(left, 0);
          expect(r.right).toBeCloseTo(outer.right, 0);
        });
      });

      it('adds nothing where the phone can vibrate', () => {
        phone({ vibrates: true });
        build([120, 120, 120]);
        expect(labels().length).toBe(0);
        expect(rail().map((b) => b.style.position)).toEqual(['', '', '']);
        expect(rail().map((b) => b.style.alignSelf)).toEqual(['', '', '']);
      });

      it('adds nothing where there is no switch control', () => {
        phone({ switches: false });
        build([120, 120, 120]);
        expect(labels().length).toBe(0);
      });

      it('adds nothing where there is no touch screen', () => {
        phone({ touches: false });
        build([120, 120, 120]);
        expect(labels().length).toBe(0);
      });

      it('lets a tap on an entry reach the switch, and opens the entry once', async () => {
        phone();
        build([120, 120, 120]);
        const focus = spyOn(root.querySelector<HTMLElement>('[data-depth-stage]')!, 'focus').and.callThrough();
        labels()[1].click();
        // The label handed the click on. Had the engine cancelled it, the switch would
        // not have moved, and on an iPhone nothing would have been felt.
        expect(switchOf(1).checked).toBeTrue();
        // The switch's own click came back up through the entry and was left alone.
        expect(focus).toHaveBeenCalledTimes(1);
        await settle(1);
        expect(seen).toEqual([0, 1]);
      });

      it('keeps a tap on the entry the camera is on from the switch', async () => {
        phone();
        build([120, 120, 120]);
        // The camera is already there: nothing moves, so nothing ticks.
        labels()[0].click();
        expect(switchOf(0).checked).toBeFalse();
        engine!.go(2);
        await settle(2);
        labels()[2].click();
        expect(switchOf(2).checked).toBeFalse();
        labels()[0].click();
        expect(switchOf(0).checked).toBeTrue();
        await settle(0);
      });

      it('still slides along the rail when the finger comes down on a label', async () => {
        phone();
        build([120, 120, 120, 120]);
        const start = labels()[1];
        const [x, y] = mid(1);
        touch('touchstart', [[x, y]], start);
        touch('touchmove', [[x, y + 6]], start);
        touch('touchmove', [[x, mid(3)[1]]], start);
        touch('touchend', [], start);
        await settle(3);
        expect(marked()).toBe(3);
      });

      it('keeps the click a short slide leaves behind from the switch', async () => {
        phone();
        build([120, 120, 120]);
        // From the foot of the second entry a few pixels into the third: short enough
        // for a browser to still count it as a tap where the finger came down.
        const start = labels()[1];
        const foot = rail()[1].getBoundingClientRect().bottom;
        const x = mid(1)[0];
        touch('touchstart', [[x, foot - 1]], start);
        touch('touchmove', [[x, foot + 4]], start);
        touch('touchend', [], start);
        start.click();
        // The slide already opened the third entry; this click opens nothing, so it
        // must not tick either.
        expect(switchOf(1).checked).toBeFalse();
        await settle(2);
        await new Promise((r) => setTimeout(r, 400));
        labels()[1].click();
        expect(switchOf(1).checked).toBeTrue();
        await settle(1);
      });

      it('lets a tap that drifts a few pixels on an entry tick, and opens it once', async () => {
        phone();
        build([120, 120, 120]);
        const focus = spyOn(root.querySelector<HTMLElement>('[data-depth-stage]')!, 'focus').and.callThrough();
        // Past the few pixels at which a finger on the rail starts to slide, and still on
        // the entry: the slide opens it, and a browser still counts the touch as a tap.
        const start = labels()[1];
        const [x, y] = mid(1);
        touch('touchstart', [[x, y]], start);
        touch('touchmove', [[x, y + 5]], start);
        touch('touchend', [], start);
        start.click();
        expect(switchOf(1).checked).toBeTrue();
        // The slide opened the entry; its click does not open it again.
        expect(focus).not.toHaveBeenCalled();
        await settle(1);
        expect(seen).toEqual([0, 1]);
      });

      it('keeps a tap that drifts on the entry the camera is on silent', async () => {
        phone();
        build([120, 120, 120]);
        const start = labels()[0];
        const [x, y] = mid(0);
        touch('touchstart', [[x, y]], start);
        touch('touchmove', [[x, y + 5]], start);
        touch('touchend', [], start);
        start.click();
        expect(switchOf(0).checked).toBeFalse();
        await new Promise((r) => setTimeout(r, 200));
        expect(seen).toEqual([0]);
      });

      it('keeps one label per entry as the rail changes, and takes them away with the engine', () => {
        phone();
        build([120, 120, 120]);
        engine!.refreshRail();
        expect(labels().length).toBe(3);
        // An entry rendered later gets one; an entry rendered afresh gets its own back.
        bar().insertAdjacentHTML('beforeend', entry(2));
        labels()[0].remove();
        engine!.refreshRail();
        expect(rail().map((b) => b.querySelectorAll('label[data-depth-tick]').length)).toEqual([1, 1, 1, 1]);
        engine!.destroy();
        engine = undefined;
        expect(labels().length).toBe(0);
        expect(rail().map((b) => b.style.position)).toEqual(['', '', '', '']);
        expect(rail().map((b) => b.style.alignSelf)).toEqual(['', '', '', '']);
      });
    });
  });

  describe('wheel', () => {
    // A wheel notch or trackpad step, dispatched on the stage and bubbling to the document.
    // `stamp` is when the input happened, as the browser stamps it (event.timeStamp).
    function wheel(deltaY: number, stamp?: number): void {
      const e = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true });
      if (stamp !== undefined) Object.defineProperty(e, 'timeStamp', { value: stamp });
      root.querySelector('[data-depth-stage]')!.dispatchEvent(e);
    }
    const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    const activeIndex = (): number => layers().findIndex((l) => !l.hasAttribute('inert'));
    // Steps a frame apart, as a trackpad stamps them, however late the test's timers run.
    async function burst(deltas: readonly number[]): Promise<void> {
      let stamp = performance.now();
      for (const d of deltas) {
        wheel(d, stamp);
        await pause(16);
        stamp = Math.min(stamp + 1000 / 60, performance.now());
      }
    }
    // Holds the page up, as a heavy frame can: nothing else runs and nothing is drawn.
    const busy = (ms: number): void => {
      const end = performance.now() + ms;
      while (performance.now() < end) {
        // The page is frozen.
      }
    };
    // A flick as a trackpad reports it. The pad samples the fingers' travel every 8.33ms,
    // and the browser hands over once a frame all the samples that came during it,
    // stamped with the last one. `frames` are the frame lengths in ms, repeated; the
    // flick climbs to `speed` px/ms over 100ms, then its momentum ebbs.
    interface Step {
      d: number;
      at: number;
      stamp: number;
    }
    function sampled(speed: number, frames: readonly number[]): Step[] {
      const v = (t: number): number => (t < 100 ? speed * Math.sin((Math.PI / 2) * (t / 100)) ** 2 : speed * Math.exp(-0.002 * (t - 100)));
      const steps: Step[] = [];
      let carry = 0;
      for (let t = 0, s = 8.33, i = 0; t < 100 || v(t) > 0.01; i++) {
        t += frames[i % frames.length];
        let d = 0;
        let stamp = -1;
        for (; s <= t; s += 8.33) {
          d += v(s) * 8.33;
          stamp = s;
        }
        if (stamp < 0) continue;
        const r = Math.round(d + carry);
        carry += d - r;
        if (r) steps.push({ d: r, at: t, stamp });
      }
      return steps;
    }
    // Plays the steps at their times. With `freeze`, the page is held up for `ms` from the
    // step at `at`, and what came in meanwhile arrives in one event as it lets go.
    async function play(steps: readonly Step[], freeze?: { at: number; ms: number }): Promise<void> {
      const t0 = performance.now();
      let held = 0;
      let heldStamp = 0;
      for (const x of steps) {
        if (freeze && x.at > freeze.at && x.at <= freeze.at + freeze.ms) {
          if (!held) busy(t0 + freeze.at + freeze.ms - performance.now());
          held += x.d;
          heldStamp = x.stamp;
          continue;
        }
        if (held) {
          wheel(held, Math.min(t0 + heldStamp, performance.now()));
          held = 0;
        }
        const wait = t0 + x.at - performance.now();
        if (wait > 0) await pause(wait);
        wheel(x.d, Math.min(t0 + x.stamp, performance.now()));
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

    // A gentle swipe: a short push, then a long slow tail that covers less than half
    // a plane of travel by the time the check below runs.
    const gentle = (): number[] => {
      const steps = [3, 6, 10, 14, 16];
      for (let d = 15; d >= 1; d *= 0.95) steps.push(Math.round(d));
      return steps;
    };

    it('sets off for the next plane while a gentle swipe is still going', async () => {
      build([120, 120, 120]);
      const run = burst(gentle());
      await pause(300);
      expect(activeIndex()).toBe(1);
      await run;
      await pause(300);
      expect(seen).toEqual([0, 1]);
    }, 10000);

    it('leans on a nudge, then comes back to the plane it was on', async () => {
      build([120, 120, 120]);
      await burst([2, 4, 6, 5, 3, 2, 1]);
      await pause(900);
      expect(seen).toEqual([0]);
      const h = layers()[0].querySelector<HTMLElement>('h2')!;
      expect(h.style.translate).toBe('');
      expect(h.style.filter).toBe('');
    }, 10000);

    // A real tail wobbles by a pixel or two as it falls, so it climbs for a step or two
    // now and then.
    it('keeps a momentum tail that wobbles to one plane', async () => {
      build([120, 120, 120]);
      const steps = [4, 10, 18, 26, 30];
      for (let k = 0; k < 60; k++) steps.push(Math.max(1, Math.round(28 * Math.pow(0.95, k)) + [2, -1, 0][k % 3]));
      await burst(steps);
      await pause(400);
      expect(seen).toEqual([0, 1]);
    }, 10000);

    it('takes no jump from the still event a trackpad sends as the fingers lift', async () => {
      build([120, 120, 120]);
      const steps = swipe(30);
      steps.splice(6, 0, 0);
      await burst(steps);
      await pause(400);
      expect(seen).toEqual([0, 1]);
    }, 10000);

    it('holds at the end of a plane that scrolls while the swipe that got there runs out', async () => {
      build([120, window.innerHeight * 3, 120]);
      engine!.go(1);
      await settle(1);
      const L = layers()[1];
      L.scrollTop = L.scrollHeight - L.clientHeight - 60;
      await burst(swipe(30));
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

    // Frames are rarely even. Every 200ms here one comes short and the next long, so the
    // deltas dip and then climb twice in a row, as a fresh push would.
    it('moves one plane for a swipe whose frames come unevenly', async () => {
      build([120, 120, 120, 120]);
      await play(sampled(2, [16, 16, 16, 16, 9, 16, 24, 16, 16, 16, 16, 16]));
      await pause(500);
      expect(seen).toEqual([0, 1]);
    }, 10000);

    // The camera has set off and the page stalls while it draws the planes: the momentum
    // that came in meanwhile arrives after a long gap, all at once.
    it('eats the momentum that comes in one lump after the page was busy', async () => {
      build([120, 120, 120, 120]);
      const steps = sampled(2, [1000 / 60]);
      await play(steps, { at: steps.find((x) => x.at >= 200)!.at, ms: 250 });
      await pause(500);
      expect(seen).toEqual([0, 1]);
    }, 10000);

    // The stall comes as the swipe changes planes, while the fingers are still speeding
    // up, so the lump is faster than what came before it.
    it('keeps a swipe the page stalls in while it is still speeding up to one plane', async () => {
      build([120, 120, 120, 120]);
      const steps = sampled(3, [1000 / 60]);
      await play(steps, { at: steps.find((x) => x.at >= 66)!.at, ms: 200 });
      await pause(500);
      expect(seen).toEqual([0, 1]);
    }, 10000);
  });

  describe('content that opens on demand', () => {
    // A question with its answer under it, opening the way the support page's do: a
    // grid row eased open from nothing.
    const answer = (px: number, ease = ''): string =>
      '<div class="item" style="background:#222"><div class="q" style="height:40px">question</div>' +
      `<div class="answer" data-depth-grows style="display:grid;grid-template-rows:0fr${ease}">` +
      `<div style="min-height:0;overflow:hidden"><div style="height:${px}px">answer</div></div></div></div>`;
    // Above it, a box standing in for the other questions. Together they make a plane
    // 1 / 0.8 of the room tall, so it fills the room scaled to 0.8. (One wrapper: the
    // page styles space out a plane's own sibling sections.)
    const filling = (rows: string): PlaneSpec => ({ html: `<div><div style="height:${Math.round(room() / 0.8) - 40}px"></div>${rows}</div>` });
    const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    const frames = (n: number): Promise<void> =>
      new Promise((resolve) => {
        const step = (k: number): void => {
          if (k <= 0) resolve();
          else requestAnimationFrame(() => setTimeout(() => step(k - 1)));
        };
        step(n);
      });
    async function setOpen(row: HTMLElement, open: boolean): Promise<void> {
      row.style.gridTemplateRows = open ? '1fr' : '0fr';
      await frames(3);
    }
    const activeIndex = (): number => layers().findIndex((l) => !l.hasAttribute('inert'));
    function wheel(deltaY: number): void {
      root.querySelector('[data-depth-stage]')!.dispatchEvent(new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true }));
    }

    it('draws a plane with its answers closed just where it would be without them', () => {
      build([120, filling(answer(300)), 120]);
      const closed = fitOf(1).getBoundingClientRect();
      engine!.destroy();
      root.remove();
      build([120, filling('<div style="background:#222;height:40px">question</div>'), 120]);
      const plain = fitOf(1).getBoundingClientRect();
      expect(closed.top).toBeCloseTo(plain.top, 0);
      expect(closed.height).toBeCloseTo(plain.height, 0);
      expect(closed.width).toBeCloseTo(plain.width, 0);
    });

    it('keeps the plane at its size when an answer opens', async () => {
      build([120, filling(answer(300)), 120]);
      const scale = scaleOf(1);
      expect(scale).toBeCloseTo(0.8, 2);
      await setOpen(root.querySelector<HTMLElement>('.answer')!, true);
      expect(scaleOf(1)).toBe(scale);
    });

    it('scrolls inside itself once an open answer does not fit, without moving anything', async () => {
      build([120, filling(answer(300)), 120]);
      engine!.go(1);
      await settle(1);
      const L = layers()[1];
      const top = fitOf(1).getBoundingClientRect().top;
      await setOpen(L.querySelector<HTMLElement>('.answer')!, true);
      expect(L.hasAttribute('data-depth-over')).toBeTrue();
      expect(Math.abs(fitOf(1).getBoundingClientRect().top - top)).toBeLessThan(1);
      // It scrolls by just the answer's height at the plane's scale.
      expect(L.scrollHeight - L.clientHeight).toBeCloseTo(300 * 0.8, -1);
    });

    it('scrolls with the wheel before moving on to the next plane', async () => {
      build([120, filling(answer(300)), 120]);
      engine!.go(1);
      await settle(1);
      const L = layers()[1];
      await setOpen(L.querySelector<HTMLElement>('.answer')!, true);
      wheel(120);
      await pause(450);
      expect(activeIndex()).toBe(1);
      expect(L.scrollTop).toBeGreaterThan(0);
      for (let i = 0; i < 8 && activeIndex() < 2; i++) {
        wheel(120);
        await pause(450);
      }
      await settle(2);
      expect(activeIndex()).toBe(2);
    }, 10000);

    it('brings an answer opened near the bottom into view, question and all', async () => {
      build([120, filling(answer(Math.round(room() * 0.5), ';transition:grid-template-rows .3s linear')), 120]);
      engine!.go(1);
      await settle(1);
      const L = layers()[1];
      const row = L.querySelector<HTMLElement>('.answer')!;
      const question = L.querySelector<HTMLElement>('.q')!;
      // The click that opens it, as the page's own button would.
      question.addEventListener('click', () => (row.style.gridTemplateRows = '1fr'));
      question.click();
      await pause(900);
      const box = L.getBoundingClientRect();
      const cs = getComputedStyle(L);
      expect(L.scrollTop).toBeGreaterThan(0);
      expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(box.top + L.clientHeight - parseFloat(cs.paddingBottom) + 1);
      expect(question.getBoundingClientRect().top).toBeGreaterThanOrEqual(box.top + parseFloat(cs.paddingTop) - 1);
    }, 10000);

    it('comes back to where it was when the answer closes', async () => {
      build([120, filling(answer(300)), 120]);
      engine!.go(1);
      await settle(1);
      const L = layers()[1];
      const top = fitOf(1).getBoundingClientRect().top;
      const row = L.querySelector<HTMLElement>('.answer')!;
      await setOpen(row, true);
      L.scrollTop = 120;
      await setOpen(row, false);
      expect(L.hasAttribute('data-depth-over')).toBeFalse();
      expect(L.scrollTop).toBe(0);
      expect(Math.abs(fitOf(1).getBoundingClientRect().top - top)).toBeLessThan(1);
      expect(scaleOf(1)).toBeCloseTo(0.8, 2);
    });
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
