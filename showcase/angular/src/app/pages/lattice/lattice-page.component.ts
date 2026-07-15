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

type PackageManager = 'pnpm' | 'npm';
type CopyTarget = 'resolve' | 'cli';
type LatticeSection = 'install' | 'capabilities' | 'quickstart' | 'modules' | 'providers' | 'audit' | 'cli';

const ROUTE_PATH = '/lattice';
const OG_IMAGE = `${HOST}/assets/lattice/logo-mark-dark.png`;
const OG_IMAGE_ALT = $localize`:@@lattice.og.imageAlt:Lattice capability mesh`;
const SITE_NAME = $localize`:@@site.name:FSB - Full Self-Browsing`;
const COPY_RESET_MS = 1600;
const SCROLL_SPY_OFFSET = 90;

function escapeCodeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const RESOLVE_TASK = $localize`:@@lattice.code.resolveTask:Resolve this support case`;
const CLI_VERIFY_COMMENT = $localize`:@@lattice.code.verifyComment:check receipt signatures`;
const CLI_REPLAY_COMMENT = $localize`:@@lattice.code.replayComment:offline replay of a run`;
const CLI_EVAL_COMMENT = $localize`:@@lattice.code.evalComment:regression gates`;
const CLI_RECEIPT_COMMENT = $localize`:@@lattice.code.receiptComment:inspect a receipt`;
const escapedResolveTask = escapeCodeHtml(RESOLVE_TASK.replace(/\\/g, '\\\\').replace(/"/g, '\\"'));
const RESOLVE_CODE_HTML = `<span class="tk-k">import</span> { z } <span class="tk-k">from</span> <span class="tk-s">"zod"</span>;
<span class="tk-k">import</span> { artifact, createAI, output } <span class="tk-k">from</span> <span class="tk-s">"@full-self-browsing/lattice"</span>;

<span class="tk-k">const</span> ai = <span class="tk-f">createAI</span>({ providers });

<span class="tk-k">const</span> result = <span class="tk-k">await</span> ai.<span class="tk-f">run</span>({
  task: <span class="tk-s">"${escapedResolveTask}"</span>,
  artifacts: [
    artifact.<span class="tk-f">text</span>(caseText, { privacy: <span class="tk-s">"sensitive"</span> }),
  ],
  outputs: {
    answer: <span class="tk-s">"text"</span>,
    action: z.<span class="tk-f">object</span>({
      kind: z.<span class="tk-f">enum</span>([<span class="tk-s">"refund"</span>, <span class="tk-s">"escalate"</span>]),
      reason: z.<span class="tk-f">string</span>(),
    }),
    citations: output.<span class="tk-f">citations</span>(),
  },
  policy: { maxCostUsd: <span class="tk-n">2</span>, privacy: <span class="tk-s">"sensitive"</span> },
});

<span class="tk-c">// → result.outputs.action.kind   "refund"</span>
<span class="tk-c">// → result.plan.status           inspectable</span>`;
const CLI_CODE_HTML = `<span class="pr">$</span> lattice --help
<span class="pr">$</span> lattice verify <span class="sub">--help</span>      <span class="cm"># ${escapeCodeHtml(CLI_VERIFY_COMMENT)}</span>
<span class="pr">$</span> lattice repro <span class="sub">--help</span>       <span class="cm"># ${escapeCodeHtml(CLI_REPLAY_COMMENT)}</span>
<span class="pr">$</span> lattice eval <span class="sub">--help</span>        <span class="cm"># ${escapeCodeHtml(CLI_EVAL_COMMENT)}</span>
<span class="pr">$</span> lattice receipt <span class="sub">--help</span>     <span class="cm"># ${escapeCodeHtml(CLI_RECEIPT_COMMENT)}</span>
<span class="pr">$</span> lattice diagnostics lm-studio <span class="sub">--help</span>`;

@Component({
  selector: 'app-lattice-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './lattice-page.component.html',
  styleUrl: './lattice-page.component.scss',
})
export class LatticePageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('pageRoot') private pageRoot?: ElementRef<HTMLElement>;

  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);

  readonly copyLabel = $localize`:@@lattice.copy:Copy`;
  readonly copiedLabel = $localize`:@@lattice.copied:Copied`;
  readonly resolveCodeHtml = RESOLVE_CODE_HTML;
  readonly cliCodeHtml = CLI_CODE_HTML;

  pkg: PackageManager = 'pnpm';
  activeSection: LatticeSection = 'install';
  copied: CopyTarget | null = null;

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

  get installRuntime(): string {
    return this.pkg === 'npm'
      ? 'npm install @full-self-browsing/lattice zod'
      : 'pnpm add @full-self-browsing/lattice zod';
  }

  get installCli(): string {
    return this.pkg === 'npm'
      ? 'npm install -g @full-self-browsing/lattice-cli'
      : 'pnpm add -g @full-self-browsing/lattice-cli';
  }

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    const t = $localize`:@@lattice.meta.title:Lattice - Capability Runtime SDK`;
    const d = $localize`:@@lattice.meta.description:Lattice is the capability runtime SDK for multimodal AI applications: typed outputs, inspectable plans, provider routing, artifacts, tools, audit receipts, and replay-friendly records.`;
    this.applyMeta(t, d, url);
    this.injectLatticeJsonLd();
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
  }

  setPackage(pkg: PackageManager): void {
    this.pkg = pkg;
  }

  copyCode(target: CopyTarget, block: HTMLElement): void {
    if (this.browser && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(block.innerText).catch(() => undefined);
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
    this.meta.updateTag({ property: 'og:image:width', content: '512' });
    this.meta.updateTag({ property: 'og:image:height', content: '512' });
    this.meta.updateTag({ property: 'og:image:alt', content: OG_IMAGE_ALT });
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary' });
    this.meta.updateTag({ name: 'twitter:title', content: t });
    this.meta.updateTag({ name: 'twitter:description', content: d });
    this.meta.updateTag({ name: 'twitter:image', content: OG_IMAGE });
    this.meta.updateTag({ name: 'twitter:image:alt', content: OG_IMAGE_ALT });
    emitLocaleHead(this.renderer, this.doc, this.localeId, ROUTE_PATH);
  }

  private injectLatticeJsonLd(): void {
    if (this.doc.head.querySelector('script[data-ld="lattice-page"]')) {
      return;
    }
    const payload = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      '@id': `${HOST}/lattice#lattice-sdk`,
      name: 'Lattice',
      applicationCategory: 'DeveloperApplication',
      applicationSubCategory: $localize`:@@lattice.schema.subcategory:Capability runtime SDK for multimodal AI applications`,
      operatingSystem: 'macOS, Linux, Windows (Node 18+)',
      url: `${HOST}/lattice`,
      description: $localize`:@@lattice.schema.description:Lattice is the capability runtime SDK for multimodal AI applications: typed outputs, inspectable plans, provider routing, artifacts, tools, audit receipts, and replay-friendly records.`,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': `${HOST}/#org` },
    };
    const json = JSON.stringify(payload).replace(/</g, '\\u003c');
    const script = this.renderer.createElement('script') as HTMLScriptElement;
    this.renderer.setAttribute(script, 'type', 'application/ld+json');
    this.renderer.setAttribute(script, 'data-ld', 'lattice-page');
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
    let current = this.sections[0].id as LatticeSection;
    for (const section of this.sections) {
      const sectionTop = section.getBoundingClientRect().top + window.scrollY;
      if (sectionTop <= probeLine) {
        current = section.id as LatticeSection;
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
      .filter((section): section is HTMLElement => this.isLatticeSection(section.id));
    this.subnavLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('.lat-subnav a[href^="#"]'));
    return this.sections.length > 0;
  }

  private isLatticeSection(id: string): id is LatticeSection {
    return id === 'install'
      || id === 'capabilities'
      || id === 'quickstart'
      || id === 'modules'
      || id === 'providers'
      || id === 'audit'
      || id === 'cli';
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

  private syncActiveLink(section: LatticeSection): void {
    for (const link of this.subnavLinks) {
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
