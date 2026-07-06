import { isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, Renderer2, inject, DOCUMENT, LOCALE_ID } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

import { HOST, buildLocaleUrl, emitLocaleHead } from '../../core/seo/locale-seo';

const ROUTE_PATH = '/agents';
const OG_IMAGE = `${HOST}/assets/fsb_logo_dark.png`;
const OG_IMAGE_ALT = $localize`:@@agents.og.imageAlt:FSB Full Self-Browsing logo`;
const SITE_NAME = $localize`:@@site.name:FSB - Full Self-Browsing`;
const AGENT_TOKENS = ['OpenClaw', 'Hermes'] as const;
type AgentToken = typeof AGENT_TOKENS[number];

const PROVIDER_MARKS: Record<AgentToken, { file: string; alt: string }> = {
  OpenClaw: { file: 'openclaw.svg', alt: 'OpenClaw' },
  Hermes: { file: 'hermes.png', alt: 'Hermes' },
};

@Component({
  selector: 'app-agents-page',
  standalone: true,
  templateUrl: './agents-page.component.html',
  styleUrl: './agents-page.component.scss',
})
export class AgentsPageComponent implements OnInit, OnDestroy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);
  private readonly platformId = inject(PLATFORM_ID);

  currentToken: string = AGENT_TOKENS[0];
  markToken: AgentToken = AGENT_TOKENS[0];
  morphing = false;

  private tokenIndex = 0;
  private cycleTimer: number | null = null;
  private rafId: number | null = null;
  private visibilityHandler: (() => void) | null = null;
  private prefersReducedMotion = false;
  // True while a scramble is in flight; prevents overlapping animations on
  // visibility/interval races.
  private isCycling = false;

  get markFile(): string {
    return PROVIDER_MARKS[this.markToken].file;
  }

  get markAlt(): string {
    return PROVIDER_MARKS[this.markToken].alt;
  }

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    // Marked via $localize so per-locale builds emit translated strings; embedded brand
    // tokens (FSB, OpenClaw, Claude, Codex, Cursor, MCP, Chrome) are preserved verbatim
    // by translators per showcase/angular/src/locale/DO-NOT-TRANSLATE.md.
    const t = $localize`:@@agents.meta.title:FSB - Agents (OpenClaw Skill + MCP)`;
    const d = $localize`:@@agents.meta.description:Drive your real Chrome from OpenClaw, Claude, Codex, Cursor, and more. FSB gives agents a polished OpenClaw skill and 66 MCP tools to act, observe, verify.`;
    this.applyMeta(t, d, url);
    this.injectAgentsPageJsonLd();

    if (isPlatformBrowser(this.platformId)) {
      this.startTokenCycle();
    }
  }

  ngOnDestroy(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.stopTokenCycle();
  }

  private startTokenCycle(): void {
    // One-shot read at init is sufficient for this badge; we do not subscribe
    // to media-query changes.
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.visibilityHandler = () => this.handleVisibilityChange();
    this.doc.addEventListener('visibilitychange', this.visibilityHandler);
    this.scheduleNextCycle();
  }

  private stopTokenCycle(): void {
    if (this.cycleTimer !== null) {
      window.clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.visibilityHandler !== null) {
      this.doc.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.isCycling = false;
  }

  private scheduleNextCycle(): void {
    if (this.cycleTimer !== null || this.doc.visibilityState === 'hidden') {
      return;
    }
    this.cycleTimer = window.setInterval(() => this.advanceToken(), 3000);
  }

  private handleVisibilityChange(): void {
    if (this.doc.visibilityState === 'hidden') {
      if (this.cycleTimer !== null) {
        window.clearInterval(this.cycleTimer);
        this.cycleTimer = null;
      }
      if (this.rafId !== null) {
        window.cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.isCycling = false;
      this.morphing = false;
      // If a scramble was mid-flight, snap visible text back to the settled
      // mark so icon + label stay consistent (cleaner than freezing garbled text).
      this.currentToken = this.markToken;
    } else if (this.cycleTimer === null) {
      this.scheduleNextCycle();
    }
  }

  private advanceToken(): void {
    if (this.isCycling || !isPlatformBrowser(this.platformId)) {
      return;
    }
    const next = AGENT_TOKENS[(this.tokenIndex + 1) % AGENT_TOKENS.length];
    if (this.prefersReducedMotion) {
      this.currentToken = next;
      this.markToken = next;
      this.tokenIndex = (this.tokenIndex + 1) % AGENT_TOKENS.length;
      return;
    }
    this.scrambleTo(next);
  }

  private scrambleTo(target: AgentToken): void {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*+=<>';
    const duration = 700;
    const lockTimes = Array.from({ length: target.length }, (_, index) => ((index + 1) / target.length) * (duration * 0.85));
    const start = performance.now();

    this.isCycling = true;
    this.morphing = true;
    const settle = (): void => {
      this.tokenIndex = (this.tokenIndex + 1) % AGENT_TOKENS.length;
      this.currentToken = target;
      this.markToken = target;
      this.morphing = false;
      this.isCycling = false;
      this.rafId = null;
    };
    const tick = (now: number): void => {
      // Abort cleanly if the tab went hidden mid-scramble: settle straight to
      // the target so icon + label stay consistent when the tab returns.
      if (this.doc.visibilityState === 'hidden') {
        settle();
        return;
      }
      const elapsed = now - start;
      if (elapsed >= duration) {
        settle();
        return;
      }

      this.currentToken = Array.from(target, (char, index) =>
        elapsed >= lockTimes[index] ? char : alphabet[Math.floor(Math.random() * alphabet.length)]
      ).join('');
      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  private applyMeta(t: string, d: string, url: string): void {
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

  private injectAgentsPageJsonLd(): void {
    if (this.doc.head.querySelector('script[data-ld="agents-page"]')) {
      return;
    }
    const payload = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      '@id': `${HOST}/agents#fsb-skill`,
      name: $localize`:@@agents.schema.software.name:FSB OpenClaw Skill`,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'macOS, Linux, Windows (via Node 18+)',
      url: `${HOST}/agents`,
      description: $localize`:@@agents.schema.software.description:Canonical OpenClaw onboarding path for FSB. Doctor flow, stdio config printer, and consent-gated multi-host installer for the FSB MCP server.`,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': `${HOST}/#org` },
      isPartOf: { '@id': `${HOST}/#site` },
    };
    const json = JSON.stringify(payload).replace(/</g, '\\u003c');
    const script = this.renderer.createElement('script') as HTMLScriptElement;
    this.renderer.setAttribute(script, 'type', 'application/ld+json');
    this.renderer.setAttribute(script, 'data-ld', 'agents-page');
    const text = this.renderer.createText(json);
    this.renderer.appendChild(script, text);
    this.renderer.appendChild(this.doc.head, script);
  }

}
