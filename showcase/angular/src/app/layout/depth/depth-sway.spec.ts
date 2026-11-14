import { DepthSway, createDepthSway } from './depth-sway';

/* The sway against a bare footer inside one plane. The phone, its sensors and the
   clock are stubbed: each test decides what kind of device this is, whether tilt
   can be read without asking, and how the phone is held. */
describe('createDepthSway', () => {
  const TOUCH_FIRST = '(hover: none) and (pointer: coarse)';
  const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

  let host: HTMLElement;
  let plane: HTMLElement;
  let end: HTMLElement;
  let sway: DepthSway | undefined;
  let clock: number;
  let device: { touch: boolean; reducedMotion: boolean };
  // What the browser says about the motion sensors; 'unknown' is a browser that
  // does not know these permissions at all, as Safari does not.
  let sensors: 'granted' | 'prompt' | 'unknown';
  let ask: jasmine.Spy;
  let permissions: jasmine.Spy;
  let nativeAsk: PropertyDescriptor | undefined;

  function setAsk(value: unknown): void {
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', { configurable: true, writable: true, value });
  }

  beforeEach(() => {
    host = document.createElement('div');
    host.innerHTML = '<div class="fsb-depth-layer"><div class="fsb-depth-fit"><div class="fsb-end"></div></div></div>';
    document.body.appendChild(host);
    plane = host.querySelector<HTMLElement>('.fsb-depth-layer')!;
    end = host.querySelector<HTMLElement>('.fsb-end')!;
    clock = 1000;
    device = { touch: true, reducedMotion: false };
    sensors = 'granted';
    spyOn(window, 'matchMedia').and.callFake(
      (query: string) => ({ matches: (query === TOUCH_FIRST && device.touch) || (query === REDUCED_MOTION && device.reducedMotion) }) as MediaQueryList,
    );
    spyOn(performance, 'now').and.callFake(() => clock);
    permissions = spyOn(navigator.permissions, 'query').and.callFake(() =>
      sensors === 'unknown' ? Promise.reject(new TypeError('unknown permission')) : Promise.resolve({ state: sensors } as PermissionStatus),
    );
    // A browser that is able to ask, as an iPhone's and a current Chrome are.
    nativeAsk = Object.getOwnPropertyDescriptor(DeviceOrientationEvent, 'requestPermission');
    ask = jasmine.createSpy('requestPermission').and.resolveTo('granted');
    setAsk(ask);
  });

  afterEach(() => {
    sway?.destroy();
    sway = undefined;
    host.remove();
    if (nativeAsk) Object.defineProperty(DeviceOrientationEvent, 'requestPermission', nativeAsk);
    else delete (DeviceOrientationEvent as unknown as Record<string, unknown>)['requestPermission'];
  });

  // Lets the permission answer and the plane's attribute change be taken in.
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  async function start(): Promise<void> {
    sway = createDepthSway(end);
    await settle();
  }

  // The phone reports how it is held: tipped forward or back (beta), leaned left or right (gamma).
  function tilt(beta: number | null, gamma: number | null, after = 100): void {
    clock += after;
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta, gamma }));
  }

  const at = (): [number, number] => [
    parseFloat(end.style.getPropertyValue('--px') || '0'),
    parseFloat(end.style.getPropertyValue('--py') || '0'),
  ];

  it('drifts with the phone from the way it was first held', async () => {
    await start();
    tilt(40, 0);
    expect(at()).toEqual([0, 0]);
    tilt(40, 7.5);
    expect(at()[0]).toBeCloseTo(0.5, 1);
    expect(at()[1]).toBeCloseTo(0, 1);
    tilt(47.5, 7.5);
    expect(at()[1]).toBeCloseTo(0.5, 1);
  });

  it('stops at the end of its travel', async () => {
    await start();
    tilt(40, 0);
    tilt(40, 80);
    expect(at()[0]).toBe(1);
    tilt(-60, 80);
    expect(at()[1]).toBe(-1);
  });

  it('settles back to the centre when the phone stays tilted', async () => {
    await start();
    tilt(40, 0);
    tilt(40, 10);
    expect(at()[0]).toBeGreaterThan(0.5);
    tilt(40, 10, 20000);
    expect(at()[0]).toBeCloseTo(0, 1);
  });

  it('settles back even if the phone stops reporting', async () => {
    await start();
    tilt(40, 0);
    tilt(40, 10);
    expect(at()[0]).toBeGreaterThan(0.5);
    // No further readings: only time passes.
    clock += 20000;
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(at()[0]).toBeCloseTo(0, 1);
  });

  it('writes a few times a second, not on every reading', async () => {
    await start();
    tilt(40, 0);
    tilt(40, 7.5);
    const written = at()[0];
    tilt(40, 15, 10);
    expect(at()[0]).toBe(written);
    tilt(40, 15, 100);
    expect(at()[0]).toBeGreaterThan(0.9);
  });

  it('follows the screen when the phone is on its side', async () => {
    spyOnProperty(ScreenOrientation.prototype, 'angle', 'get').and.returnValue(90);
    await start();
    tilt(10, 0);
    tilt(17.5, 0);
    expect(at()[0]).toBeCloseTo(0.5, 1);
    expect(at()[1]).toBeCloseTo(0, 1);
  });

  it('ignores a reading that carries no angles', async () => {
    await start();
    tilt(null, null);
    expect(at()).toEqual([0, 0]);
    tilt(40, 0);
    tilt(40, 7.5);
    expect(at()[0]).toBeCloseTo(0.5, 1);
  });

  describe('never asks for permission', () => {
    it('reads tilt where the sensors are already granted, without asking', async () => {
      await start();
      tilt(40, 0);
      tilt(40, 7.5);
      expect(at()[0]).toBeGreaterThan(0);
      expect(ask).not.toHaveBeenCalled();
    });

    it('stays still where the browser would have to ask', async () => {
      sensors = 'prompt';
      await start();
      tilt(40, 0);
      tilt(40, 10);
      expect(at()).toEqual([0, 0]);
      expect(ask).not.toHaveBeenCalled();
    });

    it('stays still on an iPhone, which does not report these sensors at all', async () => {
      sensors = 'unknown';
      await start();
      tilt(40, 0);
      tilt(40, 10);
      expect(at()).toEqual([0, 0]);
      expect(ask).not.toHaveBeenCalled();
    });

    it('reads tilt in a browser that has no way to ask', async () => {
      setAsk(undefined);
      await start();
      tilt(40, 0);
      tilt(40, 7.5);
      expect(at()[0]).toBeCloseTo(0.5, 1);
      expect(permissions).not.toHaveBeenCalled();
    });
  });

  describe('only where it belongs', () => {
    it('does nothing on a device with a mouse', async () => {
      device.touch = false;
      await start();
      tilt(40, 0);
      tilt(40, 10);
      expect(at()).toEqual([0, 0]);
      expect(permissions).not.toHaveBeenCalled();
    });

    it('does nothing when motion is reduced', async () => {
      device.reducedMotion = true;
      await start();
      tilt(40, 0);
      tilt(40, 10);
      expect(at()).toEqual([0, 0]);
    });

    it('reads tilt only while its plane is the one in view', async () => {
      plane.setAttribute('inert', '');
      await start();
      tilt(40, 0);
      tilt(40, 10);
      expect(at()).toEqual([0, 0]);

      // Coming into view, the way the phone is held then is the new centre.
      plane.removeAttribute('inert');
      await settle();
      tilt(20, 30);
      expect(at()).toEqual([0, 0]);
      tilt(20, 37.5);
      expect(at()[0]).toBeCloseTo(0.5, 1);
    });

    it('returns to the centre when its plane leaves', async () => {
      await start();
      tilt(40, 0);
      tilt(40, 10);
      expect(at()[0]).toBeGreaterThan(0.5);
      plane.setAttribute('inert', '');
      await settle();
      expect(at()).toEqual([0, 0]);
      tilt(40, 14);
      expect(at()).toEqual([0, 0]);
    });

    it('stops for good when it is destroyed', async () => {
      await start();
      tilt(40, 0);
      tilt(40, 10);
      sway!.destroy();
      expect(at()).toEqual([0, 0]);
      tilt(40, 14);
      expect(at()).toEqual([0, 0]);
    });
  });
});
