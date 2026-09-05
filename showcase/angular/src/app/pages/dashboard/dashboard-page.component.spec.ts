import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';

import { DashboardPageComponent } from './dashboard-page.component';

interface FakeScannerInstance {
  readonly start: jasmine.Spy;
  readonly stop: jasmine.Spy;
}

describe('DashboardPageComponent QR scanner lifecycle', () => {
  const globalRecord = globalThis as typeof globalThis & {
    Html5Qrcode?: new (elementId: string) => FakeScannerInstance;
    LZString?: unknown;
  };

  let fixtures: Array<ComponentFixture<DashboardPageComponent>>;
  let scannerInstances: FakeScannerInstance[];
  let originalHtml5Qrcode: typeof globalRecord.Html5Qrcode;
  let originalLZString: unknown;

  beforeEach(async () => {
    fixtures = [];
    scannerInstances = [];
    originalHtml5Qrcode = globalRecord.Html5Qrcode;
    originalLZString = globalRecord.LZString;
    delete globalRecord.Html5Qrcode;
    delete globalRecord.LZString;

    localStorage.removeItem('fsb_dashboard_key');
    localStorage.removeItem('fsb_dashboard_session');
    localStorage.removeItem('fsb_dashboard_expires');
    document.querySelectorAll('script[data-cdn]').forEach((script) => script.remove());

    // Keep the tests deterministic and offline while retaining the real DOM
    // insertion path used to deduplicate scripts across component instances.
    const appendChild = document.body.appendChild.bind(document.body);
    spyOn(document.body as any, 'appendChild').and.callFake((node: Node) => {
      if (node instanceof HTMLScriptElement && node.dataset['cdn']) {
        node.removeAttribute('src');
      }
      return appendChild(node);
    });

    await TestBed.configureTestingModule({
      imports: [DashboardPageComponent],
    }).compileComponents();
  });

  afterEach(() => {
    for (const fixture of fixtures) fixture.destroy();
    document.querySelectorAll('script[data-cdn]').forEach((script) => script.remove());
    localStorage.removeItem('fsb_dashboard_key');
    localStorage.removeItem('fsb_dashboard_session');
    localStorage.removeItem('fsb_dashboard_expires');

    if (originalHtml5Qrcode) globalRecord.Html5Qrcode = originalHtml5Qrcode;
    else delete globalRecord.Html5Qrcode;
    if (originalLZString !== undefined) globalRecord.LZString = originalLZString;
    else delete globalRecord.LZString;
  });

  function createFixture(): ComponentFixture<DashboardPageComponent> {
    const fixture = TestBed.createComponent(DashboardPageComponent);
    fixtures.push(fixture);
    fixture.detectChanges();
    return fixture;
  }

  function qrScript(): HTMLScriptElement {
    const script = document.querySelector<HTMLScriptElement>('script[data-cdn="dash-html5-qrcode"]');
    expect(script).not.toBeNull();
    return script!;
  }

  function installScanner(startResult: 'resolve' | 'reject' = 'resolve'): void {
    globalRecord.Html5Qrcode = class {
      readonly start = jasmine.createSpy('start').and.callFake(() => (
        startResult === 'resolve'
          ? Promise.resolve()
          : Promise.reject(new Error('camera unavailable'))
      ));
      readonly stop = jasmine.createSpy('stop').and.returnValue(Promise.resolve());

      constructor(_elementId: string) {
        scannerInstances.push(this);
      }
    };
  }

  // The scan success handler is the third argument html5-qrcode receives.
  function decodeQR(payload: string): void {
    const scanner = scannerInstances[scannerInstances.length - 1];
    const onDecode = scanner.start.calls.mostRecent().args[2] as (text: string) => void;
    onDecode(payload);
    flushMicrotasks();
  }

  function scanErrorEl(fixture: ComponentFixture<DashboardPageComponent>): HTMLElement {
    // Re-query rather than caching: a failed scan rebuilds the panel markup.
    return fixture.nativeElement.querySelector('#dash-scan-error') as HTMLElement;
  }

  function rejectPairing(code: string): jasmine.Spy {
    return spyOn(window, 'fetch').and.returnValue(Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ code }),
    } as Response));
  }

  it('waits for the QR library and starts the scanner exactly once', fakeAsync(() => {
    const fixture = createFixture();
    const script = qrScript();

    expect(scannerInstances).toHaveSize(0);
    expect(script.dataset['cdnState']).toBe('loading');

    installScanner();
    script.dispatchEvent(new Event('load'));
    flushMicrotasks();

    expect(scannerInstances).toHaveSize(1);
    expect(scannerInstances[0].start).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('#dash-tab-scan').classList).toContain('active');

    script.dispatchEvent(new Event('load'));
    flushMicrotasks();
    expect(scannerInstances).toHaveSize(1);
  }));

  it('cancels a pending start when Paste Key is selected', fakeAsync(() => {
    const fixture = createFixture();
    const script = qrScript();
    const pasteTab = fixture.nativeElement.querySelector('#dash-tab-paste') as HTMLButtonElement;
    const scanTab = fixture.nativeElement.querySelector('#dash-tab-scan') as HTMLButtonElement;

    pasteTab.click();
    installScanner();
    script.dispatchEvent(new Event('load'));
    flushMicrotasks();

    expect(scannerInstances).toHaveSize(0);
    expect(pasteTab.classList).toContain('active');

    scanTab.click();
    flushMicrotasks();
    expect(scannerInstances).toHaveSize(1);
    expect(scannerInstances[0].start).toHaveBeenCalledTimes(1);
  }));

  it('keeps the Scan tab active, shows load errors, and permits retry', fakeAsync(() => {
    const fixture = createFixture();
    const failedScript = qrScript();
    const scanTab = fixture.nativeElement.querySelector('#dash-tab-scan') as HTMLButtonElement;
    const error = fixture.nativeElement.querySelector('#dash-scan-error') as HTMLElement;

    failedScript.dispatchEvent(new Event('error'));
    flushMicrotasks();

    expect(scanTab.classList).toContain('active');
    expect(error.style.display).toBe('block');
    expect(error.textContent).toBe('QR scanner not available');
    expect(failedScript.isConnected).toBeFalse();

    scanTab.click();
    const retryScript = qrScript();
    expect(retryScript).not.toBe(failedScript);

    installScanner();
    retryScript.dispatchEvent(new Event('load'));
    flushMicrotasks();
    expect(scannerInstances).toHaveSize(1);
  }));

  it('keeps camera startup failures visible on the Scan tab', fakeAsync(() => {
    const fixture = createFixture();
    const scanTab = fixture.nativeElement.querySelector('#dash-tab-scan') as HTMLButtonElement;
    const error = fixture.nativeElement.querySelector('#dash-scan-error') as HTMLElement;

    installScanner('reject');
    qrScript().dispatchEvent(new Event('load'));
    flushMicrotasks();

    expect(scannerInstances).toHaveSize(1);
    expect(scanTab.classList).toContain('active');
    expect(error.style.display).toBe('block');
    expect(error.textContent).toBe('Camera unavailable');
  }));

  it('surfaces a rejected pairing exchange and lets the user rescan', fakeAsync(() => {
    const fixture = createFixture();
    const scanTab = fixture.nativeElement.querySelector('#dash-tab-scan') as HTMLButtonElement;
    const pasteTab = fixture.nativeElement.querySelector('#dash-tab-paste') as HTMLButtonElement;

    installScanner();
    qrScript().dispatchEvent(new Event('load'));
    flushMicrotasks();
    expect(scannerInstances).toHaveSize(1);

    rejectPairing('pair_token_expired');
    decodeQR(JSON.stringify({ t: 'expired-token' }));

    expect(scanErrorEl(fixture).style.display).toBe('block');
    expect(scanErrorEl(fixture).textContent).toBe('The pairing code has expired');
    expect(scanTab.classList).toContain('active');
    expect(pasteTab.classList).not.toContain('active');
    expect(scannerInstances).toHaveSize(2);
  }));

  it('reports a malformed QR payload without leaking the parser message', fakeAsync(() => {
    const fixture = createFixture();
    const scanTab = fixture.nativeElement.querySelector('#dash-tab-scan') as HTMLButtonElement;
    const fetchSpy = spyOn(window, 'fetch');

    installScanner();
    qrScript().dispatchEvent(new Event('load'));
    flushMicrotasks();

    decodeQR('not-json');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(scanErrorEl(fixture).style.display).toBe('block');
    expect(scanErrorEl(fixture).textContent).toBe('Scan failed -- paste your key instead');
    expect(scanTab.classList).toContain('active');
  }));

  it('reports a QR payload that carries no pairing token', fakeAsync(() => {
    const fixture = createFixture();
    const fetchSpy = spyOn(window, 'fetch');

    installScanner();
    qrScript().dispatchEvent(new Event('load'));
    flushMicrotasks();

    decodeQR(JSON.stringify({ s: 'https://example.test' }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(scanErrorEl(fixture).textContent).toBe('QR code does not contain a pairing token');
    expect(scannerInstances).toHaveSize(2);
  }));

  it('reuses in-flight CDN scripts across dashboard component instances', fakeAsync(() => {
    const first = createFixture();
    const script = qrScript();

    first.destroy();
    fixtures.splice(fixtures.indexOf(first), 1);
    createFixture();

    expect(document.querySelectorAll('script[data-cdn="dash-html5-qrcode"]')).toHaveSize(1);
    expect(document.querySelectorAll('script[data-cdn="dash-lz-string"]')).toHaveSize(1);

    installScanner();
    script.dispatchEvent(new Event('load'));
    flushMicrotasks();

    expect(scannerInstances).toHaveSize(1);
    expect(scannerInstances[0].start).toHaveBeenCalledTimes(1);
  }));
});
