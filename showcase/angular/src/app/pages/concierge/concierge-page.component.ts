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
import { LanguagePickerComponent } from '../../layout/language-picker/language-picker.component';

type PackageManager = 'pnpm' | 'npm';
type ConciergeSection =
  | 'install'
  | 'boundary'
  | 'how'
  | 'quickstart'
  | 'packages'
  | 'integrations'
  | 'guarantees'
  | 'security';

const ROUTE_PATH = '/concierge';
const OG_IMAGE = `${HOST}/assets/fsb_logo_dark.png`;
const OG_IMAGE_ALT = $localize`:@@concierge.og.imageAlt:FSB Full Self-Browsing logo`;
const SITE_NAME = $localize`:@@site.name:FSB - Full Self-Browsing`;
const COPY_RESET_MS = 1600;
const SCROLL_SPY_OFFSET = 90;
const ACTION_CODE_HTML = `<span class="tk-k">import</span> { createBridge, createConcierge, defineAction, offPageResult } <span class="tk-k">from</span> <span class="tk-s">"@full-self-browsing/concierge"</span>;
<span class="tk-k">import</span> { z } <span class="tk-k">from</span> <span class="tk-s">"zod"</span>;

<span class="tk-k">const</span> projectBridge = <span class="tk-f">createBridge</span>&lt;{
  actions: { openProject(id: <span class="tk-k">string</span>): <span class="tk-k">void</span> };
  snapshot: { activeProject(): <span class="tk-k">string</span> | <span class="tk-n">null</span> };
}&gt;(<span class="tk-s">"project-ui"</span>);

<span class="tk-k">const</span> openProject = <span class="tk-f">defineAction</span>({
  name: <span class="tk-s">"openProject"</span>,
  description: <span class="tk-s">"Open one project in the application preview."</span>,
  schema: z.<span class="tk-f">object</span>({ projectId: z.<span class="tk-f">string</span>().<span class="tk-f">min</span>(<span class="tk-n">1</span>).<span class="tk-f">max</span>(<span class="tk-n">64</span>) }).<span class="tk-f">strict</span>(),
  jsonSchema: {
    type: <span class="tk-s">"object"</span>,
    properties: { projectId: { type: <span class="tk-s">"string"</span>, minLength: <span class="tk-n">1</span>, maxLength: <span class="tk-n">64</span> } },
    required: [<span class="tk-s">"projectId"</span>],
    additionalProperties: <span class="tk-n">false</span>,
  },
  redact: ({ projectId }) =&gt; ({ projectId }),
  effects: { readOnly: <span class="tk-n">false</span>, destructive: <span class="tk-n">false</span>, idempotent: <span class="tk-n">true</span> },
  handler: ({ args, bridge }) =&gt; {
    <span class="tk-k">if</span> (bridge === <span class="tk-n">null</span>) {
      <span class="tk-k">return</span> <span class="tk-f">offPageResult</span>(<span class="tk-s">"Project opening"</span>, <span class="tk-s">"project interface"</span>);
    }
    bridge.actions.<span class="tk-f">openProject</span>(args.projectId);
    <span class="tk-k">return</span> { ok: <span class="tk-n">true</span>, message: <span class="tk-s">\`Opened project \${args.projectId}.\`</span> };
  },
});

<span class="tk-k">const</span> concierge = <span class="tk-f">createConcierge</span>({
  stages: [
    {
      id: <span class="tk-s">"projects"</span>,
      match: (context) =&gt; context.pathname === <span class="tk-s">"/projects"</span>,
      actions: [openProject],
      bridge: projectBridge,
    },
  ],
});

<span class="tk-k">const</span> catalog = concierge.<span class="tk-f">resolveCatalog</span>({ pathname: <span class="tk-s">"/projects"</span> });

<span class="tk-c">// → catalog.stage · catalog.revision · catalog.tools   one snapshot</span>`;

@Component({
  selector: 'app-concierge-page',
  standalone: true,
  imports: [RouterLink, LanguagePickerComponent],
  templateUrl: './concierge-page.component.html',
  styleUrl: './concierge-page.component.scss',
})
export class ConciergePageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('pageRoot') private pageRoot?: ElementRef<HTMLElement>;

  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);

  readonly copyLabel = $localize`:@@concierge.copy:Copy`;
  readonly copiedLabel = $localize`:@@concierge.copied:Copied`;
  readonly actionCodeHtml = ACTION_CODE_HTML;

  pkg: PackageManager = 'pnpm';
  activeSection: ConciergeSection = 'install';
  copied = false;

  private copyTimer?: number;
  private setupTimer?: number;
  private scrollFrame?: number;
  private sections: HTMLElement[] = [];
  private subnavLinks: HTMLAnchorElement[] = [];
  private removeScrollListeners: Array<() => void> = [];
  private scrollSpyReady = false;

  private readonly handleViewportChange = (): void => {
    this.queueActiveSectionUpdate();
  };

  get installCore(): string {
    return this.pkg === 'npm'
      ? 'npm install @full-self-browsing/concierge zod'
      : 'pnpm add @full-self-browsing/concierge zod';
  }

  get installAdapter(): string {
    const add = this.pkg === 'npm' ? 'npm install' : 'pnpm add';
    return `${add} @full-self-browsing/concierge@^0.2 \\\n  @full-self-browsing/concierge-react@^0.2 zod`;
  }

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    const t = $localize`:@@concierge.meta.title:Concierge - Safe Action Layer`;
    const d = $localize`:@@concierge.meta.description:Concierge is the safe action layer for agent-ready web applications: typed verbs, live catalogs, consent-bound dispatch, and signed replay-protected batches.`;
    this.applyMeta(t, d, url);
    this.injectConciergeJsonLd();
    this.queueScrollSpySetup();
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

    if (this.browser) {
      const jsonLd = this.doc.head.querySelector('script[data-ld="concierge-page"]');
      if (jsonLd) {
        this.renderer.removeChild(this.doc.head, jsonLd);
      }
    }
  }

  setPackage(pkg: PackageManager): void {
    this.pkg = pkg;
  }

  onSectionLink(event: MouseEvent, section: ConciergeSection): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    const target = this.pageRoot?.nativeElement.querySelector<HTMLElement>(`#${section}`);
    target?.scrollIntoView({ block: 'start' });
    if (this.browser) {
      const url = `${window.location.pathname}${window.location.search}#${section}`;
      history.replaceState(history.state, document.title, url);
    }
    this.activeSection = section;
    this.syncActiveLink(section);
  }

  copyCode(block: HTMLElement): void {
    if (this.browser && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(block.innerText).catch(() => undefined);
    }

    this.copied = true;
    if (!this.browser) return;
    if (this.copyTimer !== undefined) {
      window.clearTimeout(this.copyTimer);
    }
    this.copyTimer = window.setTimeout(() => {
      this.copied = false;
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

  private injectConciergeJsonLd(): void {
    if (this.doc.head.querySelector('script[data-ld="concierge-page"]')) {
      return;
    }
    const payload = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      '@id': `${HOST}/concierge#concierge-sdk`,
      name: 'Concierge',
      applicationCategory: 'DeveloperApplication',
      applicationSubCategory: $localize`:@@concierge.schema.subcategory:Safe action layer for agent-ready web applications`,
      operatingSystem: 'macOS, Linux, Windows (Node 22.12+)',
      url: `${HOST}/concierge`,
      description: $localize`:@@concierge.schema.description:Concierge lets a cooperating application publish typed verbs, resolve a live action catalog, and keep execution behind the application's own state, policy, and interface.`,
      license: 'https://github.com/fullselfbrowsing/FSB/blob/main/LICENSE',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': `${HOST}/#org` },
    };
    const json = JSON.stringify(payload).replace(/</g, '\\u003c');
    const script = this.renderer.createElement('script') as HTMLScriptElement;
    this.renderer.setAttribute(script, 'type', 'application/ld+json');
    this.renderer.setAttribute(script, 'data-ld', 'concierge-page');
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
    let current = this.sections[0].id as ConciergeSection;
    for (const section of this.sections) {
      const sectionTop = section.getBoundingClientRect().top + window.scrollY;
      if (sectionTop <= probeLine) {
        current = section.id as ConciergeSection;
      } else {
        break;
      }
    }
    this.activeSection = current;
    this.syncActiveLink(current);
  }

  private refreshScrollSpyTargets(): boolean {
    const root = this.pageRoot?.nativeElement;
    if (!root) return false;

    this.sections = Array.from(root.querySelectorAll<HTMLElement>('section[id]'))
      .filter((section): section is HTMLElement => this.isConciergeSection(section.id));
    this.subnavLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('.con-subnav a[href*="#"]'));
    return this.sections.length > 0;
  }

  private isConciergeSection(id: string): id is ConciergeSection {
    return id === 'install'
      || id === 'boundary'
      || id === 'how'
      || id === 'quickstart'
      || id === 'packages'
      || id === 'integrations'
      || id === 'guarantees'
      || id === 'security';
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

  private syncActiveLink(section: ConciergeSection): void {
    for (const link of this.subnavLinks) {
      const href = link.getAttribute('href') ?? '';
      const active = href.split('#')[1] === section;
      link.classList.toggle('on', active);
      if (active) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    }
  }
}
