import { detectBrowserIconClass } from './home-page.component';

/* Verbatim real-world user agents. CHROME_DESKTOP is shared by Chrome, Brave and
   Arc: that collision is exactly why Brave needs the navigator.brave namespace and
   why Arc cannot be detected at all. */
const CHROME_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)';

describe('detectBrowserIconClass', () => {
  const braveApi = { isBrave: () => Promise.resolve(true) };

  /* Brave ships Chrome's UA byte-for-byte on desktop and Android, so the namespace
     is the only available signal. iOS Brave is WebKit and carries a UA token. */
  describe('Brave', () => {
    it('detects desktop Brave via the navigator.brave namespace', () => {
      expect(detectBrowserIconClass({ userAgent: CHROME_DESKTOP, brave: braveApi })).toBe('fa-brave');
    });

    it('detects Android Brave via the navigator.brave namespace', () => {
      expect(detectBrowserIconClass({ userAgent: CHROME_ANDROID, brave: braveApi })).toBe('fa-brave');
    });

    it('detects iOS Brave via its UA token', () => {
      expect(
        detectBrowserIconClass({ userAgent: `${IOS} Version/18.1 Mobile/15E148 Safari/604.1 Brave/1.72` }),
      ).toBe('fa-brave');
    });

    it('falls back to Chrome when Brave withholds the namespace', () => {
      expect(detectBrowserIconClass({ userAgent: CHROME_DESKTOP })).toBe('fa-chrome');
    });
  });

  describe('Chrome', () => {
    it('detects desktop Chrome', () => {
      expect(detectBrowserIconClass({ userAgent: CHROME_DESKTOP })).toBe('fa-chrome');
    });

    it('detects Android Chrome', () => {
      expect(detectBrowserIconClass({ userAgent: CHROME_ANDROID })).toBe('fa-chrome');
    });

    // Regression: CriOS carries Safari/ but no Chrome/, so it used to return fa-safari.
    it('detects iOS Chrome (CriOS)', () => {
      expect(
        detectBrowserIconClass({ userAgent: `${IOS} CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1` }),
      ).toBe('fa-chrome');
    });
  });

  describe('Edge', () => {
    it('detects desktop Edge', () => {
      expect(detectBrowserIconClass({ userAgent: `${CHROME_DESKTOP} Edg/131.0.2903.86` })).toBe('fa-edge');
    });

    // Regression: EdgA/ is not matched by /Edg\//, so this used to return fa-chrome.
    it('detects Android Edge (EdgA)', () => {
      expect(detectBrowserIconClass({ userAgent: `${CHROME_ANDROID} EdgA/131.0.2903.87` })).toBe('fa-edge');
    });

    // Regression: used to return fa-safari.
    it('detects iOS Edge (EdgiOS)', () => {
      expect(
        detectBrowserIconClass({ userAgent: `${IOS} Version/18.1 EdgiOS/131.2903.92 Mobile/15E148 Safari/605.1.15` }),
      ).toBe('fa-edge');
    });

    it('detects legacy EdgeHTML', () => {
      expect(
        detectBrowserIconClass({ userAgent: `${WIN} Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763` }),
      ).toBe('fa-edge');
    });
  });

  describe('Opera', () => {
    it('detects desktop Opera', () => {
      expect(detectBrowserIconClass({ userAgent: `${CHROME_DESKTOP} OPR/115.0.5322.119` })).toBe('fa-opera');
    });

    it('detects Opera GX', () => {
      expect(detectBrowserIconClass({ userAgent: `${CHROME_DESKTOP} OPR/112.0.0.0` })).toBe('fa-opera');
    });

    it('detects Android Opera', () => {
      expect(detectBrowserIconClass({ userAgent: `${CHROME_ANDROID} OPR/86.0.4363.70158` })).toBe('fa-opera');
    });

    // Regression: used to return fa-safari.
    it('detects iOS Opera (OPT)', () => {
      expect(
        detectBrowserIconClass({ userAgent: `${IOS} Version/17.6 Mobile/15E148 Safari/604.1 OPT/5.0.3` }),
      ).toBe('fa-opera');
    });

    // Guards the bare-Opera branch, which only Presto-era builds still need.
    it('detects Opera Mini', () => {
      expect(
        detectBrowserIconClass({ userAgent: 'Opera/9.80 (J2ME/MIDP; Opera Mini/9.80) Presto/2.12.423 Version/12.16' }),
      ).toBe('fa-opera');
    });
  });

  // Yandex carries both Chrome/ and Safari/, so it must beat both engine fallbacks.
  describe('Yandex', () => {
    it('detects desktop Yandex', () => {
      expect(
        detectBrowserIconClass({ userAgent: `${WIN} Chrome/122.0.0.0 YaBrowser/24.4.0.0 Safari/537.36` }),
      ).toBe('fa-yandex');
    });

    it('detects iOS Yandex', () => {
      expect(
        detectBrowserIconClass({ userAgent: `${IOS} Version/17.5 YaBrowser/24.6.2.70.10 Mobile/15E148 Safari/604.1` }),
      ).toBe('fa-yandex');
    });
  });

  describe('Firefox', () => {
    it('detects desktop Firefox', () => {
      expect(
        detectBrowserIconClass({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0' }),
      ).toBe('fa-firefox-browser');
    });

    it('detects Android Firefox', () => {
      expect(
        detectBrowserIconClass({ userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0' }),
      ).toBe('fa-firefox-browser');
    });

    // Regression: used to return fa-safari.
    it('detects iOS Firefox (FxiOS)', () => {
      expect(
        detectBrowserIconClass({ userAgent: `${IOS} FxiOS/133.0 Mobile/15E148 Safari/605.1.15` }),
      ).toBe('fa-firefox-browser');
    });
  });

  describe('Safari', () => {
    it('detects macOS Safari', () => {
      expect(
        detectBrowserIconClass({
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
        }),
      ).toBe('fa-safari');
    });

    it('detects iOS Safari', () => {
      expect(detectBrowserIconClass({ userAgent: `${IOS} Version/18.1 Mobile/15E148 Safari/604.1` })).toBe('fa-safari');
    });
  });

  /* Font Awesome 6.6.0 ships no glyph for these, so they intentionally resolve to
     their rendering engine's icon. Every one that lands on fa-chrome is a Chromium
     browser that can install from the Chrome Web Store the CTA points at. */
  describe('documented fallbacks (no glyph available)', () => {
    it('falls back to Chrome for Samsung Internet', () => {
      expect(
        detectBrowserIconClass({
          userAgent:
            'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
        }),
      ).toBe('fa-chrome');
    });

    it('falls back to Chrome for Vivaldi', () => {
      expect(detectBrowserIconClass({ userAgent: `${CHROME_DESKTOP} Vivaldi/7.0.3495.11` })).toBe('fa-chrome');
    });

    it('falls back to Chrome for Chromium', () => {
      expect(
        detectBrowserIconClass({ userAgent: `${WIN} Chrome/120.0.6099.109 Chromium/120.0.6099.109 Safari/537.36` }),
      ).toBe('fa-chrome');
    });

    it('falls back to Chrome for Arc, which ships Chrome’s UA verbatim', () => {
      expect(detectBrowserIconClass({ userAgent: CHROME_DESKTOP })).toBe('fa-chrome');
    });

    it('falls back to Chrome for Android WebView', () => {
      expect(
        detectBrowserIconClass({
          userAgent:
            'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36',
        }),
      ).toBe('fa-chrome');
    });

    it('falls back to Safari for DuckDuckGo on iOS, which is WebKit', () => {
      expect(
        detectBrowserIconClass({ userAgent: `${IOS} Version/17.5 Mobile/15E148 Safari/604.1 Ddg/17.5` }),
      ).toBe('fa-safari');
    });
  });

  describe('non-interactive and hardened agents', () => {
    /* Guards the deliberately unanchored Chrome/ negation: a \b before Chrome would
       fail on HeadlessChrome and return fa-safari. Karma runs ChromeHeadless. */
    it('treats HeadlessChrome as Chromium, not Safari', () => {
      expect(
        detectBrowserIconClass({
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36',
        }),
      ).toBe('fa-chrome');
    });

    /* angular.json prerenders with outputMode "static", so ngOnInit runs on Node at
       build time. Node 21+ defines a global navigator whose userAgent is
       "Node.js/<major>", which means this value gets baked into the static HTML. */
    it('returns the default for the Node prerender agent', () => {
      expect(detectBrowserIconClass({ userAgent: 'Node.js/24' })).toBe('fa-chrome');
    });

    it('returns the default for an empty user agent', () => {
      expect(detectBrowserIconClass({ userAgent: '' })).toBe('fa-chrome');
    });

    it('returns the default for IE11', () => {
      expect(
        detectBrowserIconClass({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko' }),
      ).toBe('fa-chrome');
    });
  });

  /* Doubles as a compile-time proof that the real Navigator is assignable to
     BrowserSignals -- i.e. that the untouched call site in ngOnInit still
     type-checks. Matched loosely so a non-Chrome local launcher stays green. */
  it('accepts the real navigator (contract with ngOnInit)', () => {
    expect(detectBrowserIconClass(navigator)).toMatch(/^fa-[a-z-]+$/);
  });
});
