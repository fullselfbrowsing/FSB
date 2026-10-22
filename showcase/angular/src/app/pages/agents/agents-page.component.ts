import { isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, Renderer2, inject, DOCUMENT, LOCALE_ID } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { HOST, buildLocaleUrl, emitLocaleHead } from '../../core/seo/locale-seo';
import { PageJsonLdService } from '../../core/seo/page-json-ld.service';

const ROUTE_PATH = '/agents';
const OG_IMAGE = `${HOST}/assets/fsb_logo_dark.png`;
const OG_IMAGE_ALT = $localize`:@@agents.og.imageAlt:FSB Full Self-Browsing logo`;
const SITE_NAME = $localize`:@@site.name:FSB - Full Self-Browsing`;

@Component({
  selector: 'app-agents-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './agents-page.component.html',
  styleUrl: './agents-page.component.scss',
})
export class AgentsPageComponent implements OnInit, OnDestroy {
  private readonly pageJsonLd = inject(PageJsonLdService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);
  private readonly platformId = inject(PLATFORM_ID);

  readonly featuredAgents = FEATURED_AGENTS;
  readonly hostChips = HOST_CHIPS;
  readonly installHosts = INSTALL_HOSTS;
  readonly ctaLogos = CTA_LOGOS;
  readonly baseCommand = BASE_INSTALL_COMMAND;

  currentToken: string = AGENT_TOKENS[0];
  markToken: AgentToken = AGENT_TOKENS[0];
  morphing = false;
  hostIndex = 0;
  copied = false;

  private tokenIndex = 0;
  private cycleTimer: number | null = null;
  private rafId: number | null = null;
  private copyTimer: number | null = null;
  private visibilityHandler: (() => void) | null = null;
  private prefersReducedMotion = false;
  // True while a scramble is in flight; prevents overlapping animations on
  // visibility/interval races.
  private isCycling = false;
  // Held while the pointer is over the badge or the flow strip so the name can be
  // read; both show the same token, so one flag holds them together.
  private paused = false;

  get markFile(): string {
    return AGENT_MARKS[this.markToken];
  }

  get selectedHost(): InstallHost {
    return INSTALL_HOSTS[this.hostIndex];
  }

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    // Marked via $localize so per-locale builds emit translated strings; embedded brand
    // tokens (FSB, OpenClaw, Claude, Codex, Cursor, MCP, Chrome) are preserved verbatim
    // by translators per showcase/angular/src/locale/DO-NOT-TRANSLATE.md.
    const t = $localize`:@@agents.meta.title:FSB for AI Agents | MCP Browser Automation`;
    const d = $localize`:@@agents.meta.description:Connect Codex, Claude Code, Cursor, OpenClaw, and Hermes to your real Chrome session with FSB. Install the MCP bridge and verify it with doctor.`;
    this.applyMeta(t, d, url);
    this.injectAgentsPageJsonLd();

    if (isPlatformBrowser(this.platformId)) {
      this.startTokenCycle();
    }
  }

  ngOnDestroy(): void {
    this.pageJsonLd.remove('agents-page');
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.stopTokenCycle();
    this.clearCopyTimer();
  }

  logoMask(file: string): string {
    return `url("/assets/providers/${file}")`;
  }

  onTokenEnter(): void {
    this.paused = true;
  }

  onTokenLeave(): void {
    this.paused = false;
  }

  pickHost(index: number): void {
    this.hostIndex = index;
    this.clearCopyTimer();
    this.copied = false;
  }

  copyCommand(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.copyText(`${BASE_INSTALL_COMMAND} ${this.selectedHost.flag}`);
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
    if (this.prefersReducedMotion || this.cycleTimer !== null || this.doc.visibilityState === 'hidden') {
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
    if (this.isCycling || this.paused || !isPlatformBrowser(this.platformId)) {
      return;
    }
    const next = AGENT_TOKENS[(this.tokenIndex + 1) % AGENT_TOKENS.length];
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

      // Spaces never scramble, so a two-word name keeps its word gap mid-morph.
      this.currentToken = Array.from(target, (char, index) =>
        char === ' ' || elapsed >= lockTimes[index] ? char : alphabet[Math.floor(Math.random() * alphabet.length)]
      ).join('');
      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  private copyText(text: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => this.copyTextFallback(text));
    } else {
      this.copyTextFallback(text);
    }
    this.markCopied();
  }

  private copyTextFallback(text: string): void {
    const textarea = this.renderer.createElement('textarea') as HTMLTextAreaElement;
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    this.renderer.appendChild(this.doc.body, textarea);
    textarea.select();
    try {
      this.doc.execCommand('copy');
    } catch {
      // Copy feedback is still shown; failure is non-fatal for the page.
    }
    this.renderer.removeChild(this.doc.body, textarea);
  }

  private markCopied(): void {
    this.clearCopyTimer();
    this.copied = true;
    this.copyTimer = window.setTimeout(() => {
      this.copied = false;
      this.copyTimer = null;
    }, COPIED_FEEDBACK_MS);
  }

  private clearCopyTimer(): void {
    if (this.copyTimer !== null) {
      window.clearTimeout(this.copyTimer);
      this.copyTimer = null;
    }
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
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    const payload = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          '@id': `${url}#webpage`,
          url,
          inLanguage: this.localeId,
          name: this.title.getTitle(),
          description: this.meta.getTag('name="description"')?.content,
          mainEntity: { '@id': `${HOST}/agents#fsb-skill` },
          hasPart: { '@id': `${url}#install-howto` },
          publisher: { '@id': `${HOST}/#org` },
        },
        {
          '@type': 'SoftwareApplication',
          '@id': `${HOST}/agents#fsb-skill`,
          name: $localize`:@@agents.schema.software.name:FSB OpenClaw Skill`,
          applicationCategory: 'DeveloperApplication',
          operatingSystem: 'macOS, Linux, Windows (Node.js 18+)',
          url: `${HOST}/agents`,
          description: $localize`:@@agents.schema.software.description:Canonical OpenClaw and Hermes onboarding path for FSB. Doctor flow, stdio config printer, consent-gated multi-host installer, and 73 MCP browser tools for the FSB MCP server.`,
          featureList: [
            $localize`:@@agents.schema.software.feature.tools:73 MCP tools for browser action, observation, verification, and recovery`,
            $localize`:@@agents.schema.software.feature.manual:Manual mode by default; run_task autopilot only on explicit delegation`,
            $localize`:@@agents.schema.software.feature.vault:Vault tools fill credentials and payment methods without exposing raw secrets`,
            $localize`:@@agents.schema.software.feature.triggers:Trigger watcher tools for reactive page monitoring`,
            $localize`:@@agents.schema.software.feature.capabilities:Native capability tools for guarded first-party API actions`,
          ],
          license: 'https://github.com/fullselfbrowsing/FSB/blob/main/LICENSE',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          publisher: { '@id': `${HOST}/#org` },
          mainEntityOfPage: { '@id': `${url}#webpage` },
        },
        {
          '@type': 'HowTo',
          '@id': `${url}#install-howto`,
          url: `${url}#install-howto`,
          inLanguage: this.localeId,
          name: $localize`:@@agents.schema.howTo.name:Install FSB for an MCP agent`,
          description: $localize`:@@agents.schema.howTo.description:Install the FSB MCP bridge, verify it with doctor, then let an MCP host drive the user's real Chrome session.`,
          step: [
            {
              '@type': 'HowToStep',
              name: $localize`:@@agents.schema.howTo.extension.name:Install the Chrome extension`,
              text: $localize`:@@agents.schema.howTo.extension.text:Install FSB from the Chrome Web Store or load the extension from source.`,
            },
            {
              '@type': 'HowToStep',
              name: $localize`:@@agents.schema.howTo.server.name:Configure the MCP server`,
              text: $localize`:@@agents.schema.howTo.server.text:Use the FSB skill, ClawHub, or npx -y fsb-mcp-server@latest install for a supported MCP host.`,
            },
            {
              '@type': 'HowToStep',
              name: $localize`:@@agents.schema.howTo.doctor.name:Run doctor verification`,
              text: $localize`:@@agents.schema.howTo.doctor.text:Run npx -y fsb-mcp-server@latest doctor and fix any failing package, bridge, extension, active-tab, content-script, or config layer.`,
            },
          ],
          isPartOf: { '@id': `${url}#webpage` },
          about: { '@id': `${HOST}/agents#fsb-skill` },
        },
      ],
    };
    this.pageJsonLd.set('agents-page', payload);
  }

}

/* Page data lives in the module tail rather than beside ROUTE_PATH at the top on
   purpose: messages.xlf pins a linenumber for every $localize call in this module
   and CI diffs `ng extract-i18n` byte-for-byte, so growing one of these lists must
   not move a pinned line. Every display string below is a brand, CLI host id or
   command: the template interpolates it verbatim, so no locale ever translates it. */
const AGENT_TOKENS = ['Grok Bot', 'Muse', 'Dots', 'OpenClaw', 'Hermes'] as const;
type AgentToken = typeof AGENT_TOKENS[number];

/* Every mark renders as a currentColor mask, so one glyph element serves all five
   tokens and follows the theme without per-theme image swaps. */
const AGENT_MARKS: Record<AgentToken, string> = {
  'Grok Bot': 'grok-bot.png',
  Muse: 'meta.svg',
  Dots: 'openai.svg',
  OpenClaw: 'openclaw.svg',
  Hermes: 'hermes.png',
};

/* `id` selects the card's translated description in the template. */
interface FeaturedAgent {
  readonly id: 'grok' | 'muse' | 'dots';
  readonly name: string;
  readonly maker: string;
  readonly logo: string;
}

const FEATURED_AGENTS: readonly FeaturedAgent[] = [
  { id: 'grok', name: 'Grok Bot', maker: 'xAI', logo: 'grok-bot.png' },
  { id: 'muse', name: 'Muse', maker: 'Meta', logo: 'meta.svg' },
  { id: 'dots', name: 'Dots', maker: 'OpenAI', logo: 'openai.svg' },
];

interface HostChip {
  readonly name: string;
  readonly logo: string;
}

const HOST_CHIPS: readonly HostChip[] = [
  { name: 'OpenClaw', logo: 'openclaw.svg' },
  { name: 'Hermes', logo: 'hermes.png' },
  { name: 'Claude Code', logo: 'claude.svg' },
  { name: 'Codex', logo: 'openai.svg' },
  { name: 'Grok Build', logo: 'xai.png' },
  { name: 'Cursor', logo: 'cursor.svg' },
  { name: 'Gemini CLI', logo: 'google.png' },
  { name: 'VS Code', logo: 'vscode.svg' },
  { name: 'Windsurf', logo: 'windsurf.svg' },
  { name: 'OpenCode', logo: 'opencode.svg' },
];

const BASE_INSTALL_COMMAND = 'npx -y fsb-mcp-server@latest install';
const COPIED_FEEDBACK_MS = 1600;

/* A subset of the installer's platform flags; `install --list` prints all of them. */
interface InstallHost {
  readonly name: string;
  readonly flag: string;
}

const INSTALL_HOSTS: readonly InstallHost[] = [
  { name: 'claude-code', flag: '--claude-code' },
  { name: 'claude-desktop', flag: '--claude-desktop' },
  { name: 'codex', flag: '--codex' },
  { name: 'cursor', flag: '--cursor' },
  { name: 'gemini', flag: '--gemini' },
  { name: 'vscode', flag: '--vscode' },
  { name: 'windsurf', flag: '--windsurf' },
  { name: 'opencode', flag: '--opencode' },
  { name: 'all', flag: '--all' },
];

const CTA_LOGOS: readonly string[] = [
  'grok-bot.png',
  'meta.svg',
  'openai.svg',
  'openclaw.svg',
  'hermes.png',
  'claude.svg',
  'cursor.svg',
];
