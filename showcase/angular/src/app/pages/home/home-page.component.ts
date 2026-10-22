import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  Renderer2,
  ViewChild,
  inject,
  DOCUMENT,
  LOCALE_ID,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';

import { PixelLoaderComponent } from '../../components/pixel-loader/pixel-loader.component';
import { CAPABILITY_ROW_1, CAPABILITY_ROW_2, type CapabilityApp } from '../../core/capabilities/capability-apps';
import { APP_VERSION } from '../../core/seo/version';
import { HOST, buildLocaleUrl, emitLocaleHead } from '../../core/seo/locale-seo';
import { PageJsonLdService } from '../../core/seo/page-json-ld.service';
import ONLINE_MIND2WEB from '../../core/seo/online-mind2web.json';
import { ThemeService } from '../../core/theme.service';

interface InstallClient {
  readonly id: string;
  readonly name: string;
  readonly logo: string;
  readonly flag: string;
  readonly cmd?: string;
}

interface FanClient extends InstallClient {
  readonly dx: number;
  readonly rot: number;
  readonly flagLabel: string;
}

const ROUTE_PATH = '';
const OG_IMAGE = `${HOST}/assets/og/online-mind2web.png`;
const OG_IMAGE_ALT = $localize`:@@home.og.imageAlt:Online-Mind2Web top 10 agents chart. FSB: AI-reviewed result (277/300), 92.3%.`;
const SITE_NAME = $localize`:@@site.name:FSB - Full Self-Browsing`;
const YOUTUBE_CHANNEL = 'https://www.youtube.com/@parzival5707';
const GITHUB_REPO = 'https://github.com/fullselfbrowsing/FSB';
const BASE_INSTALL_COMMAND = 'npx -y fsb-mcp-server@latest install';
const ROTATE_MS = 1800;
@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink, PixelLoaderComponent],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
})
export class HomePageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('scrollCue') private scrollCue?: ElementRef<HTMLElement>;

  private readonly pageJsonLd = inject(PageJsonLdService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);
  private readonly themeService = inject(ThemeService);

  private rollTimer?: ReturnType<typeof setInterval>;
  private hoverTimer?: ReturnType<typeof setTimeout>;
  private fanCloseTimer?: ReturnType<typeof setTimeout>;
  private copiedTimer?: ReturnType<typeof setTimeout>;
  private rafId?: number;
  private removeScrollListener?: () => void;
  private engTimer?: ReturnType<typeof setInterval>;
  private engSwapTimer?: ReturnType<typeof setTimeout>;
  private engHover = false;
  private engReducedMotion = false;

  readonly storeUrl = 'https://chromewebstore.google.com/detail/badgafnfchcihdfnjneklogedcdkmjfk?utm_source=item-share-cp';
  readonly githubRepo = GITHUB_REPO;
  readonly rollClients: readonly InstallClient[] = [
    { id: 'claude-code', name: 'Claude Code', logo: 'claude.svg', flag: '--claude-code' },
    { id: 'claude-desktop', name: 'Claude Desktop', logo: 'claude.svg', flag: '--claude-desktop' },
    { id: 'cursor', name: 'Cursor', logo: 'cursor.svg', flag: '--cursor' },
    { id: 'vscode', name: 'VS Code', logo: 'vscode.svg', flag: '--vscode' },
    { id: 'windsurf', name: 'Windsurf', logo: 'windsurf.svg', flag: '--windsurf' },
    { id: 'codex', name: 'Codex', logo: 'openai.svg', flag: '--codex' },
    { id: 'opencode', name: 'OpenCode', logo: 'opencode.svg', flag: '--opencode' },
  ];
  readonly allClients: readonly InstallClient[] = [
    { id: 'claude-code', name: 'Claude Code', logo: 'claude.svg', flag: '--claude-code', cmd: `${BASE_INSTALL_COMMAND} --claude-code` },
    { id: 'claude-desktop', name: 'Claude Desktop', logo: 'claude.svg', flag: '--claude-desktop', cmd: `${BASE_INSTALL_COMMAND} --claude-desktop` },
    { id: 'cursor', name: 'Cursor', logo: 'cursor.svg', flag: '--cursor', cmd: `${BASE_INSTALL_COMMAND} --cursor` },
    { id: 'vscode', name: 'VS Code', logo: 'vscode.svg', flag: '--vscode', cmd: `${BASE_INSTALL_COMMAND} --vscode` },
    { id: 'windsurf', name: 'Windsurf', logo: 'windsurf.svg', flag: '--windsurf', cmd: `${BASE_INSTALL_COMMAND} --windsurf` },
    { id: 'codex', name: 'Codex', logo: 'openai.svg', flag: '--codex', cmd: `${BASE_INSTALL_COMMAND} --codex` },
    { id: 'opencode', name: 'OpenCode', logo: 'opencode.svg', flag: '--opencode', cmd: `${BASE_INSTALL_COMMAND} --opencode` },
    { id: 'openclaw', name: 'OpenClaw', logo: 'openclaw.svg', flag: '', cmd: 'npx -y fsb-mcp-server@latest' },
    { id: 'all', name: $localize`:@@home.install.allClients:All Clients`, logo: 'all.svg', flag: '--all', cmd: `${BASE_INSTALL_COMMAND} --all` },
  ];
  readonly capRow1: readonly CapabilityApp[] = CAPABILITY_ROW_1;
  private readonly manualFlagLabel = $localize`:@@home.install.manualFlag:manual`;
  readonly capRow2: readonly CapabilityApp[] = CAPABILITY_ROW_2;
  readonly engMcpKind = 'MCP';
  readonly engGlyphs = ENG_FLOW_GLYPHS;
  readonly engChips = ENG_CHIPS;
  readonly engCliMeta = ENG_CHIPS.cli.map((chip) => chip.name).join(' · ');
  readonly benchmarkName = BENCHMARK_NAME;
  readonly leaderboard = buildLeaderboardRows(this.localeId);
  readonly leaderboardTicks = buildLeaderboardTicks(this.localeId);
  browserIconClass = 'fa-chrome';
  iconIndex = 0;
  token = '--claude-code';
  morphing = false;
  paused = false;
  fanOpen = false;
  copied: string | null = null;
  engMode: EngMode = 'mcp';
  engLeaving = false;
  engKeyFocus = false;

  /* Prerender-safe guard (matchMedia check mirrors the theme bootstrap). On
     coarse pointers the fan is click-toggled: taps fire synthetic mouseenter,
     so the 500ms hover-intent timer would reopen it right after a tap-close. */
  private readonly coarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  get currentClient(): InstallClient {
    return this.rollClients[this.iconIndex];
  }

  get copyIconClass(): string {
    return this.copied === 'current' ? 'fa-solid fa-check' : 'fa-regular fa-copy';
  }

  get loaderTheme(): 'dark' | 'light' {
    return this.themeService.isDark() ? 'dark' : 'light';
  }

  get fanItemsUp(): FanClient[] {
    const half = Math.ceil(this.allClients.length / 2);
    return this.buildFanItems(this.allClients.slice(0, half), -1);
  }

  get fanItemsDown(): FanClient[] {
    const half = Math.ceil(this.allClients.length / 2);
    return this.buildFanItems(this.allClients.slice(half), 1);
  }

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    const t = $localize`:@@home.meta.title:Full Self-Browsing | 92.3% on Online-Mind2Web | AI Browser Automation & MCP`;
    const d = $localize`:@@home.meta.description:FSB on Online-Mind2Web: AI-reviewed result (277/300), 92.3%. Automate Chrome with natural-language instructions or connect AI agents through MCP. FSB is open source and works in your real browser session.`;
    this.applyMeta(t, d, url);
    this.injectSoftwareApplicationJsonLd();
    if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string') {
      this.browserIconClass = detectBrowserIconClass(navigator);
    }
  }

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;
    this.rollTimer = setInterval(() => this.advance(), ROTATE_MS);
    this.removeScrollListener = this.renderer.listen('window', 'scroll', () => this.updateScrollCue());
    this.updateScrollCue();
    // Read once, not subscribed: under reduced motion the engine panel never auto-rotates.
    this.engReducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!this.engReducedMotion) this.startEngCycle();
  }

  ngOnDestroy(): void {
    this.pageJsonLd.remove('software-application');
    if (this.rollTimer) clearInterval(this.rollTimer);
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    if (this.fanCloseTimer) clearTimeout(this.fanCloseTimer);
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
    if (this.engTimer) clearInterval(this.engTimer);
    if (this.engSwapTimer) clearTimeout(this.engSwapTimer);
    if (this.rafId !== undefined && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.rafId);
    }
    this.removeScrollListener?.();
  }

  logoMask(logo: string): string {
    return `url("/assets/providers/${logo}")`;
  }

  onBarEnter(): void {
    this.paused = true;
  }

  onBarLeave(): void {
    this.paused = false;
  }

  onCopyEnter(): void {
    if (this.coarsePointer) return;
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    if (this.fanCloseTimer) clearTimeout(this.fanCloseTimer);
    this.hoverTimer = setTimeout(() => {
      this.fanOpen = true;
    }, 500);
  }

  onCopyLeave(): void {
    if (this.coarsePointer) return;
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    if (this.fanCloseTimer) clearTimeout(this.fanCloseTimer);
    this.fanCloseTimer = setTimeout(() => {
      this.fanOpen = false;
    }, 260);
  }

  onCopyClick(): void {
    if (this.coarsePointer) {
      this.fanOpen = !this.fanOpen;
      return;
    }
    this.copyCurrent();
  }

  onEngEnter(): void {
    this.engHover = true;
  }

  onEngLeave(): void {
    this.engHover = false;
  }

  /* Only keyboard focus holds the rotation. Chrome, Edge and touch browsers also
     focus a button when it is clicked, and that focus outlives the pointer, so
     plain focus would freeze the panel after every tab click. */
  onEngFocusIn(event: FocusEvent): void {
    this.engKeyFocus = (event.target as Element | null)?.matches?.(':focus-visible') === true;
  }

  onEngKeyDown(): void {
    this.engKeyFocus = true;
  }

  /* focusout also fires when focus just moves between tabs, and the focusin that
     follows re-evaluates it; only clear the hold once focus has actually left the
     panel (relatedTarget is null when it leaves the document altogether). */
  onEngFocusOut(event: FocusEvent): void {
    const root = event.currentTarget as Element | null;
    const next = event.relatedTarget as Node | null;
    if (!root || !next || !root.contains(next)) this.engKeyFocus = false;
  }

  pickEng(mode: EngMode): void {
    this.engGo(mode);
    if (this.engTimer) this.startEngCycle();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.coarsePointer || !this.fanOpen) return;
    const target = event.target as Element | null;
    if (target && typeof target.closest === 'function' && target.closest('.install-copy-wrap')) return;
    this.fanOpen = false;
  }

  copyCurrent(): void {
    const client = this.currentClient;
    this.copyText(`${BASE_INSTALL_COMMAND} ${client.flag}`, 'current');
  }

  copyClient(client: InstallClient): void {
    this.copyText(client.cmd ?? `${BASE_INSTALL_COMMAND} ${client.flag}`.trim(), client.id);
  }

  trackInstallClient(_index: number, client: InstallClient): string {
    return client.id;
  }

  trackCapability(_index: number, app: CapabilityApp): string {
    return app.name;
  }

  private applyMeta(t: string, d: string, url: string): void {
    this.title.setTitle(t);
    this.meta.updateTag({ name: 'description', content: d });
    this.meta.updateTag({ property: 'og:title', content: t });
    this.meta.updateTag({ property: 'og:description', content: d });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:image', content: OG_IMAGE });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt', content: OG_IMAGE_ALT });
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: t });
    this.meta.updateTag({ name: 'twitter:description', content: d });
    this.meta.updateTag({ name: 'twitter:image', content: OG_IMAGE });
    this.meta.updateTag({ name: 'twitter:image:alt', content: OG_IMAGE_ALT });
    emitLocaleHead(this.renderer, this.doc, this.localeId, ROUTE_PATH);
  }

  private injectSoftwareApplicationJsonLd(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    const software = {
      '@type': 'SoftwareApplication',
      '@id': `${HOST}/#software`,
      name: 'FSB',
      description: $localize`:@@home.schema.description:Local-first Chrome automation and MCP browser layer that lets AI agents act, observe, verify, use trigger watchers, upload real files, and invoke guarded first-party API capabilities in the user's browser`,
      url: HOST,
      applicationCategory: 'BrowserApplication',
      applicationSubCategory: $localize`:@@home.schema.subcategory:AI browser automation and MCP tools`,
      operatingSystem: 'Chrome',
      softwareVersion: APP_VERSION,
      downloadUrl: GITHUB_REPO,
      sameAs: [GITHUB_REPO, YOUTUBE_CHANNEL],
      subjectOf: { '@id': `${HOST}/#online-mind2web` },
      featureList: [
        $localize`:@@home.schema.feature.benchmark:Online-Mind2Web: AI-reviewed result (277/300), 92.3%`,
        $localize`:@@home.schema.feature.mcp:MCP server for Claude Code, Codex, Cursor, Windsurf, and OpenClaw`,
        $localize`:@@home.schema.feature.browser:Real browser automation through a local Chrome extension`,
        $localize`:@@home.schema.feature.triggers:Trigger watchers for reactive DOM monitoring`,
        $localize`:@@home.schema.feature.capabilities:Native first-party API capability catalog with guarded invoke_capability calls`,
        $localize`:@@home.schema.feature.uploads:Real file uploads through upload_file plus synthetic drop_file support`,
        $localize`:@@home.schema.feature.vault:Vault and payment autofill boundary where raw secrets never cross the MCP bridge`,
        $localize`:@@home.schema.feature.dom:DOM-based page understanding, browser actions, visual feedback, local memory, and BYO model keys`,
      ],
      keywords: $localize`:@@home.schema.keywords:MCP browser automation, AI browser agent, trigger watchers, first-party API capability calling, Claude Code browser testing, Codex browser testing, self-browsing automation`,
      license: `${GITHUB_REPO}/blob/main/LICENSE`,
      publisher: { '@id': `${HOST}/#org` },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    };
    // The leaderboard chart in the features section, restated for crawlers. The visible FSB row
    // is a wordmark with no text name, so this is where "FSB: 92.3%" is spelled out.
    const benchmark = {
      '@type': 'Dataset',
      '@id': `${HOST}/#online-mind2web`,
      name: $localize`:@@home.schema.benchmark.name:FSB on Online-Mind2Web: top 10 agents by average success rate`,
      description: $localize`:@@home.schema.benchmark.description:Average success rates on Online-Mind2Web, with FSB included. FSB: AI-reviewed result (277/300), 92.3%. Other values are transcribed from the leaderboard. Evaluation methods differ; numerical placement is illustrative, not an official leaderboard ranking. Tested on FSB v0.9.92 · MCP v0.11.2.`,
      url: `${url}#features`,
      inLanguage: this.localeId,
      isAccessibleForFree: true,
      datePublished: ONLINE_MIND2WEB.fsb.published,
      creator: { '@id': `${HOST}/#org` },
      about: { '@id': software['@id'] },
      isBasedOn: ONLINE_MIND2WEB.leaderboardUrl,
      citation: ONLINE_MIND2WEB.reportUrl,
      keywords: [ONLINE_MIND2WEB.name, 'web agent benchmark', 'browser automation'],
      variableMeasured: {
        '@type': 'PropertyValue',
        name: $localize`:@@home.schema.benchmark.metric:Average success rate`,
        unitText: 'percent',
      },
    };
    this.pageJsonLd.set('software-application', {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          '@id': `${url}#webpage`,
          url,
          inLanguage: this.localeId,
          name: this.title.getTitle(),
          description: this.meta.getTag('name="description"')?.content,
          mainEntity: { '@id': software['@id'] },
          publisher: { '@id': `${HOST}/#org` },
        },
        software,
        benchmark,
      ],
    });
  }

  private advance(): void {
    if (this.paused || this.fanOpen || this.morphing) return;
    const next = (this.iconIndex + 1) % this.rollClients.length;
    this.scramble(next);
  }

  private scramble(targetIndex: number): void {
    if (typeof window === 'undefined') return;
    const target = this.rollClients[targetIndex].flag;
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789-_/';
    const duration = 560;
    const lockTimes = Array.from({ length: target.length }, (_, i) => ((i + 1) / target.length) * (duration * 0.82));
    const start = performance.now();
    this.morphing = true;
    if (this.rafId !== undefined) window.cancelAnimationFrame(this.rafId);

    const tick = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= duration) {
        this.rafId = undefined;
        this.token = target;
        this.iconIndex = targetIndex;
        this.morphing = false;
        return;
      }
      this.token = Array.from({ length: target.length }, (_, i) =>
        elapsed >= lockTimes[i] ? target[i] : alphabet[Math.floor(Math.random() * alphabet.length)]
      ).join('');
      this.rafId = window.requestAnimationFrame(tick);
    };

    this.rafId = window.requestAnimationFrame(tick);
  }

  private copyText(text: string, key: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => this.copyTextFallback(text));
    } else {
      this.copyTextFallback(text);
    }
    this.markCopied(key);
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

  private markCopied(key: string): void {
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
    this.copied = key;
    this.copiedTimer = setTimeout(() => {
      this.copied = null;
    }, 1600);
  }

  private startEngCycle(): void {
    if (this.engTimer) clearInterval(this.engTimer);
    this.engTimer = setInterval(() => {
      if (this.engHover || this.engKeyFocus || this.doc.hidden) return;
      this.engGo(nextEngMode(this.engMode));
    }, ENG_CYCLE_MS);
  }

  /* The outgoing panel plays engOut while `leaving` is set; the mode flips only
     once that has finished, which re-adds is-active on the next panel and replays
     its engIn. */
  private engGo(mode: EngMode): void {
    if (this.engSwapTimer) clearTimeout(this.engSwapTimer);
    this.engSwapTimer = undefined;
    if (mode === this.engMode) {
      // Picking the panel that is still on screen mid-swap cancels the swap.
      this.engLeaving = false;
      return;
    }
    if (this.engReducedMotion) {
      this.engMode = mode;
      return;
    }
    this.engLeaving = true;
    this.engSwapTimer = setTimeout(() => {
      this.engSwapTimer = undefined;
      this.engMode = mode;
      this.engLeaving = false;
    }, ENG_SWAP_MS);
  }

  private updateScrollCue(): void {
    if (typeof window === 'undefined') return;
    const el = this.scrollCue?.nativeElement;
    if (!el) return;
    const fade = Math.min(1, window.scrollY / 320);
    el.style.opacity = String(1 - fade);
    el.style.pointerEvents = fade > 0.9 ? 'none' : 'auto';
  }

  private buildFanItems(clients: readonly InstallClient[], direction: number): FanClient[] {
    return clients.map((client, index) => {
      const t = clients.length > 1 ? index / (clients.length - 1) : 0;
      return {
        ...client,
        flagLabel: client.flag || this.manualFlagLabel,
        dx: -Math.round((1 - Math.cos(t * (Math.PI * 0.42))) * 60),
        rot: Number((direction * t * 6).toFixed(1)),
      };
    });
  }
}

/* Declared in the module tail rather than beside the interfaces at the top of the
   file on purpose: messages.xlf pins a linenumber for every $localize call in this
   module (the last one is in injectSoftwareApplicationJsonLd) and CI diffs
   `ng extract-i18n` byte-for-byte, so nothing at or above that line may move. Same reason there is no
   separate browser-icon.ts -- importing it would shift every one of those numbers.

   Narrower than Navigator so the detector stays a pure function over plain objects
   in tests; the real `navigator` satisfies it structurally, so the call site needs
   no cast. `brave` exists only in Brave, and only synchronously. Its isBrave()
   promise is deliberately never awaited: it resolves to `true` unconditionally --
   the namespace's existence is the entire signal -- and awaiting it would land the
   icon a tick after every other browser, adding a second visible flip. */
export interface BrowserSignals {
  readonly userAgent: string;
  readonly brave?: { readonly isBrave: () => Promise<boolean> };
}

/* Branch order is load-bearing. Every Chromium fork inherits `Chrome/` and every
   iOS browser is WebKit and inherits `Safari/`, so all brand tokens must be tested
   before the two engine fallbacks at the bottom. */
export function detectBrowserIconClass(nav: BrowserSignals): string {
  const ua = nav.userAgent;
  // Brave's desktop/Android UA is byte-identical to Chrome's, so the namespace is
  // the only signal there. iOS Brave is WebKit and carries a UA token instead.
  if (typeof nav.brave === 'object' && nav.brave !== null) return 'fa-brave';
  if (/\bBrave\b/.test(ua)) return 'fa-brave';
  // Edg/ desktop, EdgA/ Android, EdgiOS/ iOS, Edge/ legacy EdgeHTML.
  if (/\bEdg(?:e|A|iOS)?\//.test(ua)) return 'fa-edge';
  // OPR/ desktop+Android, OPT/ and OPiOS/ on iOS, bare Opera for Mini/Presto.
  if (/\bOP(?:R|T|iOS)\//.test(ua) || /\bOpera\b/.test(ua)) return 'fa-opera';
  if (/\bYaBrowser\//.test(ua)) return 'fa-yandex';
  if (/\bFirefox\/|\bFxiOS\//.test(ua)) return 'fa-firefox-browser';
  // Chrome on iOS carries Safari/ but no Chrome/, so it must be claimed here before
  // the fallback below, even though it returns the same value as the default.
  if (/\bCriOS\//.test(ua)) return 'fa-chrome';
  // Engine fallbacks. The negative test is intentionally unanchored: `HeadlessChrome/`
  // must still read as Chromium, not Safari.
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\//.test(ua)) return 'fa-safari';
  return 'fa-chrome';
}

/* Engine panel: the three ways to run FSB, auto-advanced in this order. The swap
   delay matches the engOut keyframe in the stylesheet, so the outgoing panel has
   finished blurring out before the next one becomes active. */
export type EngMode = 'mcp' | 'cli' | 'byok';

export const ENG_ORDER: readonly EngMode[] = ['mcp', 'cli', 'byok'];
const ENG_CYCLE_MS = 3000;
const ENG_SWAP_MS = 220;

export function nextEngMode(mode: EngMode): EngMode {
  return ENG_ORDER[(ENG_ORDER.indexOf(mode) + 1) % ENG_ORDER.length];
}

/* Product names are interpolated from here rather than marked in the template: a
   trans-unit whose whole source is a brand would need a same-source allowlist entry
   in every locale. Translatable chip tags stay as i18n markers in the template and
   are selected by key. Logos are mask files under /assets/providers; LM Studio has
   none, so it falls back to a Font Awesome icon. */
export type EngChipTag = 'default' | 'freeTier' | 'local';

export interface EngChip {
  readonly name: string;
  readonly logo?: string;
  readonly icon?: string;
  readonly tag?: EngChipTag;
}

const ENG_FLOW_GLYPHS: Readonly<Record<EngMode, readonly string[]>> = {
  mcp: ['claude.svg', 'openai.svg', 'cursor.svg', 'vscode.svg'],
  cli: ['claude.svg', 'xai.png'],
  byok: ['xai.png', 'anthropic.webp', 'openai.svg', 'google.png'],
};

const ENG_CHIPS: Readonly<Record<EngMode, readonly EngChip[]>> = {
  mcp: [
    { name: 'Claude Code', logo: 'claude.svg' },
    { name: 'Claude Desktop', logo: 'claude.svg' },
    { name: 'Codex', logo: 'openai.svg' },
    { name: 'Cursor', logo: 'cursor.svg' },
    { name: 'VS Code', logo: 'vscode.svg' },
    { name: 'Windsurf', logo: 'windsurf.svg' },
    { name: 'OpenCode', logo: 'opencode.svg' },
    { name: 'OpenClaw', logo: 'openclaw.svg' },
    { name: 'Hermes', logo: 'hermes.png' },
  ],
  cli: [
    { name: 'Claude Code', logo: 'claude.svg' },
    { name: 'Grok Build', logo: 'xai.png' },
  ],
  byok: [
    { name: 'xAI Grok', logo: 'xai.png', tag: 'default' },
    { name: 'Anthropic', logo: 'anthropic.webp' },
    { name: 'OpenAI', logo: 'openai.svg' },
    { name: 'Gemini', logo: 'google.png', tag: 'freeTier' },
    { name: 'OpenRouter', logo: 'openrouter.svg' },
    { name: 'LM Studio', icon: 'fa-solid fa-cube', tag: 'local' },
  ],
};

/* Online-Mind2Web top 10 by average success rate, read from core/seo/online-mind2web.json
   so the README chart, the social card and the structured data draw the same numbers
   (scripts/build-benchmark-assets.mjs). Agent names are interpolated for the same reason
   as ENG_CHIPS. FSB's score is its own run, AI-reviewed at 277 of 300 tasks; every other
   value is transcribed from the leaderboard's human-evaluation table. Percentages go
   through Intl so separators and the % position follow the reader's locale. */
const BENCHMARK_NAME = ONLINE_MIND2WEB.name;

interface LeaderboardEntry {
  readonly name: string;
  readonly score: number;
  readonly fsb?: boolean;
}

export interface LeaderboardRow extends LeaderboardEntry {
  readonly rank: string;
  readonly value: string;
}

export interface LeaderboardTick {
  readonly at: number;
  readonly label: string;
}

const LEADERBOARD: readonly LeaderboardEntry[] = ONLINE_MIND2WEB.leaderboard;

const LEADERBOARD_TICKS: readonly number[] = [0, 20, 40, 60, 80];

export function buildLeaderboardRows(localeId: string): LeaderboardRow[] {
  const percent = new Intl.NumberFormat(localeId, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return LEADERBOARD.map((entry, index) => ({
    ...entry,
    rank: String(index + 1).padStart(2, '0'),
    value: percent.format(entry.score / 100),
  }));
}

export function buildLeaderboardTicks(localeId: string): LeaderboardTick[] {
  const percent = new Intl.NumberFormat(localeId, { style: 'percent', maximumFractionDigits: 0 });
  return LEADERBOARD_TICKS.map((at) => ({ at, label: percent.format(at / 100) }));
}
