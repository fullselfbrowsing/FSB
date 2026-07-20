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
import { APP_VERSION } from '../../core/seo/version';
import { HOST, buildLocaleUrl, emitLocaleHead } from '../../core/seo/locale-seo';
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

interface CapabilityApp {
  readonly name: string;
  readonly icon: string;
  readonly cls?: string;
}

const ROUTE_PATH = '';
const OG_IMAGE = `${HOST}/assets/fsb_logo_dark.png`;
const OG_IMAGE_ALT = $localize`:@@home.og.imageAlt:FSB Full Self-Browsing logo`;
const SITE_NAME = $localize`:@@site.name:FSB - Full Self-Browsing`;
const YOUTUBE_CHANNEL = 'https://www.youtube.com/@parzival5707';
const GITHUB_REPO = 'https://github.com/fullselfbrowsing/FSB';
const BASE_INSTALL_COMMAND = 'npx -y fsb-mcp-server install';
const ROTATE_MS = 1800;
const SIMPLE_ICON_COLOR = '94a3b8';
function capabilityIcon(name: string): string {
  const label = name.slice(0, 1).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="none"/><text x="12" y="16" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" fill="#94a3b8">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function simpleIcon(slug: string): string {
  return `https://cdn.simpleicons.org/${slug}/${SIMPLE_ICON_COLOR}`;
}

function capability(name: string, slug?: string): CapabilityApp {
  return { name, icon: slug ? simpleIcon(slug) : capabilityIcon(name), cls: '' };
}

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink, PixelLoaderComponent],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
})
export class HomePageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('scrollCue') private scrollCue?: ElementRef<HTMLElement>;

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
    { id: 'openclaw', name: 'OpenClaw', logo: 'openclaw.svg', flag: '', cmd: 'npx -y fsb-mcp-server' },
    { id: 'all', name: $localize`:@@home.install.allClients:All Clients`, logo: 'all.svg', flag: '--all', cmd: `${BASE_INSTALL_COMMAND} --all` },
  ];
  readonly capRow1: readonly CapabilityApp[] = [
    capability('GitHub', 'github'),
    capability('Slack'),
    capability('Notion', 'notion'),
    capability('Linear', 'linear'),
    capability('Jira', 'jira'),
    capability('Confluence', 'confluence'),
    capability('ClickUp', 'clickup'),
    capability('Asana', 'asana'),
    capability('Airtable', 'airtable'),
    capability('GitLab', 'gitlab'),
    capability('Bitbucket', 'bitbucket'),
    capability('Vercel', 'vercel'),
    capability('Netlify', 'netlify'),
  ];
  private readonly manualFlagLabel = $localize`:@@home.install.manualFlag:manual`;
  readonly capRow2: readonly CapabilityApp[] = [
    capability('Cloudflare', 'cloudflare'),
    capability('CircleCI', 'circleci'),
    capability('Datadog', 'datadog'),
    capability('Sentry', 'sentry'),
    capability('PostHog', 'posthog'),
    { name: 'ChatGPT', icon: '/assets/providers/openai.svg', cls: 'cap-logo-inv' },
    capability('Claude', 'claude'),
    capability('Bluesky', 'bluesky'),
    capability('Mastodon', 'mastodon'),
    capability('Threads', 'threads'),
    capability('Discord', 'discord'),
    capability('Reddit', 'reddit'),
  ];

  browserIconClass = 'fa-chrome';
  iconIndex = 0;
  token = '--claude-code';
  morphing = false;
  paused = false;
  fanOpen = false;
  copied: string | null = null;

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
    const t = $localize`:@@home.meta.title:FSB - Full Self-Browsing`;
    const d = $localize`:@@home.meta.description:Local-first Chrome automation and MCP browser layer for AI agents, with trigger watchers, real uploads, and guarded first-party API capability calls.`;
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
  }

  ngOnDestroy(): void {
    if (this.rollTimer) clearInterval(this.rollTimer);
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    if (this.fanCloseTimer) clearTimeout(this.fanCloseTimer);
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
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

  private injectSoftwareApplicationJsonLd(): void {
    if (this.doc.head.querySelector('script[data-ld="software-application"]')) {
      return;
    }
    const payload = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'FSB',
      description: $localize`:@@home.schema.description:Local-first Chrome automation and MCP browser layer that lets AI agents act, observe, verify, use trigger watchers, upload real files, and invoke guarded first-party API capabilities in the user's browser`,
      url: 'https://full-selfbrowsing.com',
      applicationCategory: 'BrowserApplication',
      applicationSubCategory: $localize`:@@home.schema.subcategory:AI browser automation and MCP tools`,
      operatingSystem: 'Chrome',
      softwareVersion: APP_VERSION,
      downloadUrl: GITHUB_REPO,
      sameAs: [GITHUB_REPO, YOUTUBE_CHANNEL],
      featureList: [
        $localize`:@@home.schema.feature.mcp:MCP server for Claude Code, Codex, Cursor, Windsurf, and OpenClaw`,
        $localize`:@@home.schema.feature.browser:Real browser automation through a local Chrome extension`,
        $localize`:@@home.schema.feature.triggers:Trigger watchers for reactive DOM monitoring`,
        $localize`:@@home.schema.feature.capabilities:Native first-party API capability catalog with guarded invoke_capability calls`,
        $localize`:@@home.schema.feature.uploads:Real file uploads through upload_file plus synthetic drop_file support`,
        $localize`:@@home.schema.feature.vault:Vault and payment autofill boundary where raw secrets never cross the MCP bridge`,
        $localize`:@@home.schema.feature.dom:DOM-based page understanding, browser actions, visual feedback, local memory, and BYO model keys`,
      ],
      keywords: $localize`:@@home.schema.keywords:MCP browser automation, AI browser agent, trigger watchers, first-party API capability calling, Claude Code browser testing, Codex browser testing, self-browsing automation`,
      publisher: { '@id': 'https://full-selfbrowsing.com/#org' },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    };
    const json = JSON.stringify(payload).replace(/</g, '\\u003c');
    const script = this.renderer.createElement('script') as HTMLScriptElement;
    this.renderer.setAttribute(script, 'type', 'application/ld+json');
    this.renderer.setAttribute(script, 'data-ld', 'software-application');
    const text = this.renderer.createText(json);
    this.renderer.appendChild(script, text);
    this.renderer.appendChild(this.doc.head, script);
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

function detectBrowserIconClass(nav: Navigator): string {
  const ua = nav.userAgent;
  if (/Edg\//.test(ua)) return 'fa-edge';
  if (/OPR\/|Opera/.test(ua)) return 'fa-opera';
  if (/Firefox\//.test(ua)) return 'fa-firefox-browser';
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\//.test(ua)) return 'fa-safari';
  return 'fa-chrome';
}
