import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  LOCALE_ID,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  Renderer2,
  ViewChild,
  inject,
} from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { HOST, buildLocaleUrl, emitLocaleHead } from '../../core/seo/locale-seo';

type PhantomSection = 'overview' | 'problem' | 'whydom' | 'architecture' | 'features' | 'security' | 'quickstart' | 'docs';
type QuickstartTab = 'capture' | 'viewer' | 'relay';
type CopyTarget = 'install' | 'code';

const ROUTE_PATH = '/phantom-stream';
const OG_IMAGE = `${HOST}/assets/fsb_logo_dark.png`;
const OG_IMAGE_ALT = 'FSB Full Self-Browsing logo';
const SITE_NAME = 'FSB - Full Self-Browsing';
const COPY_RESET_MS = 1600;
const SCROLL_SPY_OFFSET = 360;
const INSTALL_COMMAND = 'npm install @full-self-browsing/phantom-stream';

const CAPTURE_CODE_TEXT = `import { createCapture } from '@full-self-browsing/phantom-stream/capture';
import { createWebSocketTransport } from '@full-self-browsing/phantom-stream/transport/websocket';

const transport = createWebSocketTransport({
  url: 'wss://relay.example.com/ws?room=ROOM&role=source',
  role: 'source'
});

const capture = createCapture({
  transport,
  skipElement: (el) => el.id === 'my-own-overlay' // exclude your own UI
});

capture.start(); // snapshot once, then stream diffs`;

const VIEWER_CODE_TEXT = `import { createViewer } from '@full-self-browsing/phantom-stream/renderer';
import { createWebSocketTransport } from '@full-self-browsing/phantom-stream/transport/websocket';

const transport = createWebSocketTransport({
  url: 'wss://relay.example.com/ws?room=ROOM&role=viewer',
  role: 'viewer'
});

const viewer = createViewer({
  container: document.getElementById('mirror'),
  transport
});

viewer.on('state', (e) => console.log('viewer is', e.state));
// connecting | live | stale | disconnected`;

const RELAY_CODE_TEXT = `import http from 'node:http';
import { createRelay, createWebSocketRelayBackend } from '@full-self-browsing/phantom-stream/relay';

const relay = createRelay();   // 1 MiB per-message cap, backpressure drop
const server = http.createServer();
createWebSocketRelayBackend({ server, relay, path: '/ws' });
server.listen(8787);

// clients join with ?room=<id>&role=source|viewer`;

const CAPTURE_CODE_HTML = `<span class="tk-k">import</span> { createCapture } <span class="tk-k">from</span> <span class="tk-s">'@full-self-browsing/phantom-stream/capture'</span>;
<span class="tk-k">import</span> { createWebSocketTransport } <span class="tk-k">from</span> <span class="tk-s">'@full-self-browsing/phantom-stream/transport/websocket'</span>;

<span class="tk-k">const</span> transport = <span class="tk-f">createWebSocketTransport</span>({
  url: <span class="tk-s">'wss://relay.example.com/ws?room=ROOM&amp;role=source'</span>,
  role: <span class="tk-s">'source'</span>
});

<span class="tk-k">const</span> capture = <span class="tk-f">createCapture</span>({
  transport,
  skipElement: (el) =&gt; el.id === <span class="tk-s">'my-own-overlay'</span> <span class="tk-c">// exclude your own UI</span>
});

capture.<span class="tk-f">start</span>(); <span class="tk-c">// snapshot once, then stream diffs</span>`;

const VIEWER_CODE_HTML = `<span class="tk-k">import</span> { createViewer } <span class="tk-k">from</span> <span class="tk-s">'@full-self-browsing/phantom-stream/renderer'</span>;
<span class="tk-k">import</span> { createWebSocketTransport } <span class="tk-k">from</span> <span class="tk-s">'@full-self-browsing/phantom-stream/transport/websocket'</span>;

<span class="tk-k">const</span> transport = <span class="tk-f">createWebSocketTransport</span>({
  url: <span class="tk-s">'wss://relay.example.com/ws?room=ROOM&amp;role=viewer'</span>,
  role: <span class="tk-s">'viewer'</span>
});

<span class="tk-k">const</span> viewer = <span class="tk-f">createViewer</span>({
  container: document.<span class="tk-f">getElementById</span>(<span class="tk-s">'mirror'</span>),
  transport
});

viewer.<span class="tk-f">on</span>(<span class="tk-s">'state'</span>, (e) =&gt; console.<span class="tk-f">log</span>(<span class="tk-s">'viewer is'</span>, e.state));
<span class="tk-c">// connecting | live | stale | disconnected</span>`;

const RELAY_CODE_HTML = `<span class="tk-k">import</span> http <span class="tk-k">from</span> <span class="tk-s">'node:http'</span>;
<span class="tk-k">import</span> { createRelay, createWebSocketRelayBackend } <span class="tk-k">from</span> <span class="tk-s">'@full-self-browsing/phantom-stream/relay'</span>;

<span class="tk-k">const</span> relay = <span class="tk-f">createRelay</span>();   <span class="tk-c">// 1 MiB per-message cap, backpressure drop</span>
<span class="tk-k">const</span> server = http.<span class="tk-f">createServer</span>();
<span class="tk-f">createWebSocketRelayBackend</span>({ server, relay, path: <span class="tk-s">'/ws'</span> });
server.<span class="tk-f">listen</span>(<span class="tk-n">8787</span>);

<span class="tk-c">// clients join with ?room=&lt;id&gt;&amp;role=source|viewer</span>`;

@Component({
  selector: 'app-phantom-stream-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './phantom-stream-page.component.html',
  styleUrl: './phantom-stream-page.component.scss',
})
export class PhantomStreamPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('pageRoot') private pageRoot?: ElementRef<HTMLElement>;

  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);

  readonly copyLabel = $localize`:@@phantomStream.copy:Copy`;
  readonly copiedLabel = $localize`:@@phantomStream.copied:Copied`;
  readonly installCommand = INSTALL_COMMAND;
  readonly captureCodeHtml = CAPTURE_CODE_HTML;
  readonly viewerCodeHtml = VIEWER_CODE_HTML;
  readonly relayCodeHtml = RELAY_CODE_HTML;

  activeSection: PhantomSection = 'overview';
  copied: CopyTarget | null = null;
  mobileMenuOpen = false;
  miniSec = 59;
  tab: QuickstartTab = 'capture';

  private copyTimer?: number;
  private miniTimer?: number;
  private setupTimer?: number;
  private scrollFrame?: number;
  private sections: HTMLElement[] = [];
  private navLinks: HTMLAnchorElement[] = [];
  private removeScrollListeners: Array<() => void> = [];
  private scrollSpyReady = false;

  private readonly handleViewportChange = (): void => {
    this.queueActiveSectionUpdate();
  };

  get miniSeconds(): string {
    return String(this.miniSec).padStart(2, '0');
  }

  get codeName(): string {
    if (this.tab === 'viewer') return 'viewer.js';
    if (this.tab === 'relay') return 'relay.js';
    return 'capture.js';
  }

  get currentCodeText(): string {
    if (this.tab === 'viewer') return VIEWER_CODE_TEXT;
    if (this.tab === 'relay') return RELAY_CODE_TEXT;
    return CAPTURE_CODE_TEXT;
  }

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    const t = $localize`:@@phantomStream.meta.title:PhantomStream - DOM-Native Browser Mirroring`;
    const d = $localize`:@@phantomStream.meta.description:PhantomStream is DOM-native live browser mirroring: one style-inlined snapshot, then MutationObserver diffs instead of pixels.`;
    this.applyMeta(t, d, url);
    this.injectPhantomStreamJsonLd();
    this.queueScrollSpySetup();

    if (this.browser) {
      this.miniTimer = window.setInterval(() => {
        this.miniSec = (this.miniSec + 59) % 60;
      }, 1000);
    }
  }

  ngAfterViewInit(): void {
    if (!this.browser) return;
    this.queueScrollSpySetup();
  }

  ngOnDestroy(): void {
    if (this.copyTimer !== undefined && this.browser) {
      window.clearTimeout(this.copyTimer);
      this.copyTimer = undefined;
    }
    if (this.miniTimer !== undefined && this.browser) {
      window.clearInterval(this.miniTimer);
      this.miniTimer = undefined;
    }
    if (this.setupTimer !== undefined && this.browser) {
      window.clearTimeout(this.setupTimer);
      this.setupTimer = undefined;
    }
    if (this.scrollFrame !== undefined && this.browser) {
      window.cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = undefined;
    }
    for (const remove of this.removeScrollListeners) {
      remove();
    }
    this.removeScrollListeners = [];
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  setTab(tab: QuickstartTab): void {
    this.tab = tab;
  }

  copyInstall(): void {
    this.copyText(INSTALL_COMMAND, 'install');
  }

  copyCurrentCode(): void {
    this.copyText(this.currentCodeText, 'code');
  }

  private copyText(text: string, target: CopyTarget): void {
    if (this.browser && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }

    this.copied = target;
    if (!this.browser) return;
    if (this.copyTimer !== undefined) {
      window.clearTimeout(this.copyTimer);
    }
    this.copyTimer = window.setTimeout(() => {
      this.copied = null;
      this.copyTimer = undefined;
    }, COPY_RESET_MS);
  }

  private applyMeta(t: string, d: string, url: string): void {
    this.meta.removeTag('name="robots"');
    this.title.setTitle(t);
    this.meta.updateTag({ name: 'description', content: d });
    this.meta.updateTag({ property: 'og:title', content: t });
    this.meta.updateTag({ property: 'og:description', content: d });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:image', content: OG_IMAGE });
    this.meta.updateTag({ property: 'og:image:width', content: '1000' });
    this.meta.updateTag({ property: 'og:image:height', content: '1000' });
    this.meta.updateTag({ property: 'og:image:alt', content: OG_IMAGE_ALT });
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary' });
    this.meta.updateTag({ name: 'twitter:title', content: t });
    this.meta.updateTag({ name: 'twitter:description', content: d });
    this.meta.updateTag({ name: 'twitter:image', content: OG_IMAGE });
    this.meta.updateTag({ name: 'twitter:image:alt', content: OG_IMAGE_ALT });
    emitLocaleHead(this.renderer, this.doc, this.localeId, ROUTE_PATH);
  }

  // Structured data stays English-only on purpose: angular.json sets
  // i18nMissingTranslation=error, so new $localize units would break every
  // locale build until all five xlf targets are hand-updated.
  private injectPhantomStreamJsonLd(): void {
    if (this.doc.head.querySelector('script[data-ld="phantom-stream-page"]')) {
      return;
    }
    const payload = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      '@id': `${HOST}/phantom-stream#phantom-stream`,
      name: 'PhantomStream',
      url: `${HOST}/phantom-stream`,
      description: 'PhantomStream is DOM-native live browser mirroring: one style-inlined snapshot, then MutationObserver diffs instead of pixels. Ships capture, renderer, relay, and transport modules as @full-self-browsing/phantom-stream.',
      programmingLanguage: 'TypeScript',
      runtimePlatform: 'Browser, Node.js 18+',
      publisher: { '@id': `${HOST}/#org` },
    };
    const json = JSON.stringify(payload).replace(/</g, '\\u003c');
    const script = this.renderer.createElement('script') as HTMLScriptElement;
    this.renderer.setAttribute(script, 'type', 'application/ld+json');
    this.renderer.setAttribute(script, 'data-ld', 'phantom-stream-page');
    const text = this.renderer.createText(json);
    this.renderer.appendChild(script, text);
    this.renderer.appendChild(this.doc.head, script);
  }

  private setupScrollSpy(): void {
    if (!this.refreshScrollSpyTargets()) return;

    this.scrollSpyReady = true;
    this.installScrollListeners();
    this.queueActiveSectionUpdate();
  }

  private updateActiveSection(): void {
    this.refreshScrollSpyTargets();
    if (!this.sections.length) return;

    const probeLine = window.scrollY + SCROLL_SPY_OFFSET;
    let current = this.sections[0].id as PhantomSection;
    for (const section of this.sections) {
      if (section.offsetTop <= probeLine) {
        current = section.id as PhantomSection;
      } else {
        break;
      }
    }

    const maxScrollY = Math.max(0, this.doc.documentElement.scrollHeight - window.innerHeight);
    if (window.scrollY >= maxScrollY - 8) {
      current = this.sections[this.sections.length - 1].id as PhantomSection;
    }

    this.activeSection = current;
    this.syncActiveLinks(current);
  }

  private refreshScrollSpyTargets(): boolean {
    const root = this.pageRoot?.nativeElement;
    if (!root) return false;

    this.sections = Array.from(root.querySelectorAll<HTMLElement>('section[id]'))
      .filter((section): section is HTMLElement => this.isPhantomSection(section.id));
    this.navLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('.ps-side-link[href^="#"], .ps-toc a[href^="#"]'));
    return this.sections.length > 0;
  }

  private isPhantomSection(id: string): id is PhantomSection {
    return id === 'overview'
      || id === 'problem'
      || id === 'whydom'
      || id === 'architecture'
      || id === 'features'
      || id === 'security'
      || id === 'quickstart'
      || id === 'docs';
  }

  private queueScrollSpySetup(): void {
    if (!this.browser || this.scrollSpyReady) return;

    window.requestAnimationFrame(() => {
      if (!this.scrollSpyReady) {
        this.setupScrollSpy();
      }
    });

    if (this.setupTimer !== undefined) {
      window.clearTimeout(this.setupTimer);
    }
    this.setupTimer = window.setTimeout(() => {
      this.setupTimer = undefined;
      if (!this.scrollSpyReady) {
        this.setupScrollSpy();
      }
    }, 250);
  }

  private installScrollListeners(): void {
    if (!this.browser || this.removeScrollListeners.length) return;

    window.addEventListener('scroll', this.handleViewportChange, { passive: true });
    window.addEventListener('resize', this.handleViewportChange, { passive: true });
    window.addEventListener('hashchange', this.handleViewportChange);
    this.removeScrollListeners = [
      () => window.removeEventListener('scroll', this.handleViewportChange),
      () => window.removeEventListener('resize', this.handleViewportChange),
      () => window.removeEventListener('hashchange', this.handleViewportChange),
    ];
  }

  private queueActiveSectionUpdate(): void {
    if (!this.browser || this.scrollFrame !== undefined) return;

    this.scrollFrame = window.requestAnimationFrame(() => {
      this.scrollFrame = undefined;
      this.updateActiveSection();
    });
  }

  private syncActiveLinks(section: PhantomSection): void {
    for (const link of this.navLinks) {
      const active = link.getAttribute('href') === `#${section}`;
      link.classList.toggle('on', active);
      if (active) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    }
  }
}
