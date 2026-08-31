import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  Renderer2,
  ViewChild,
  inject,
  DOCUMENT,
  LOCALE_ID,
} from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { HOST, buildLocaleUrl, emitLocaleHead } from '../../core/seo/locale-seo';
import { ThemeService } from '../../core/theme.service';

const ROUTE_PATH = '/about';
const OG_IMAGE = `${HOST}/assets/fsb_logo_dark.png`;
const OG_IMAGE_ALT = $localize`:@@about.og.imageAlt:FSB Full Self-Browsing logo`;
const SITE_NAME = $localize`:@@site.name:FSB - Full Self-Browsing`;
const YOUTUBE_CHANNEL = 'https://www.youtube.com/@parzival5707';

const KNOWLEDGE_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  'E-Commerce & Shopping': $localize`:@@about.memory.category.ecommerce:E-Commerce & Shopping`,
  'Social Media': $localize`:@@about.memory.category.social:Social Media`,
  'Finance & Trading': $localize`:@@about.memory.category.finance:Finance & Trading`,
  'Travel & Booking': $localize`:@@about.memory.category.travel:Travel & Booking`,
  'Email Platforms': $localize`:@@about.memory.category.email:Email Platforms`,
  'Coding Platforms': $localize`:@@about.memory.category.coding:Coding Platforms`,
  'Career & Job Search': $localize`:@@about.memory.category.career:Career & Job Search`,
  'Gaming Platforms': $localize`:@@about.memory.category.gaming:Gaming Platforms`,
  'Productivity Tools': $localize`:@@about.memory.category.productivityTools:Productivity Tools`,
  'Design & Whiteboard': $localize`:@@about.memory.category.design:Design & Whiteboard`,
  Games: $localize`:@@about.memory.category.games:Games`,
  Media: $localize`:@@about.memory.category.media:Media`,
  Music: $localize`:@@about.memory.category.music:Music`,
  News: $localize`:@@about.memory.category.news:News`,
  Productivity: $localize`:@@about.memory.category.productivity:Productivity`,
  Reference: $localize`:@@about.memory.category.reference:Reference`,
  Sports: $localize`:@@about.memory.category.sports:Sports`,
  'Maps & Navigation': $localize`:@@about.memory.category.maps:Maps & Navigation`,
  Utilities: $localize`:@@about.memory.category.utilities:Utilities`,
};

const KNOWLEDGE_SITE_LABELS: Readonly<Record<string, string>> = {
  'Generic Career / ATS': $localize`:@@about.memory.site.genericCareerAts:Generic Career / ATS`,
  'Demo E-Commerce Store': $localize`:@@about.memory.site.demoEcommerceStore:Demo E-Commerce Store`,
  'Mega-Menu Navigation': $localize`:@@about.memory.site.megaMenuNavigation:Mega-Menu Navigation`,
  'Nike 3D Viewer': $localize`:@@about.memory.site.nike3dViewer:Nike 3D Viewer`,
  'Canvas Browser Game (HTML5/WebGL)': $localize`:@@about.memory.site.canvasBrowserGame:Canvas Browser Game (HTML5/WebGL)`,
  'Podcast Audio Player': $localize`:@@about.memory.site.podcastAudioPlayer:Podcast Audio Player`,
  'HTML5 Video Player': $localize`:@@about.memory.site.html5VideoPlayer:HTML5 Video Player`,
  'Online Voice Recorder': $localize`:@@about.memory.site.onlineVoiceRecorder:Online Voice Recorder`,
  'Online Virtual Piano': $localize`:@@about.memory.site.onlineVirtualPiano:Online Virtual Piano`,
  'News Feed (Infinite Scroll)': $localize`:@@about.memory.site.newsFeedInfiniteScroll:News Feed (Infinite Scroll)`,
  'CRM HR Cross-Reference': $localize`:@@about.memory.site.crmHrCrossReference:CRM HR Cross-Reference`,
  'Online PDF Editor': $localize`:@@about.memory.site.onlinePdfEditor:Online PDF Editor`,
  'PDF Viewer (Virtualized)': $localize`:@@about.memory.site.pdfViewerVirtualized:PDF Viewer (Virtualized)`,
  'SaaS Pricing Table': $localize`:@@about.memory.site.saasPricingTable:SaaS Pricing Table`,
  'Live Sports Scores': $localize`:@@about.memory.site.liveSportsScores:Live Sports Scores`,
  'Adblocker Modal Bypass': $localize`:@@about.memory.site.adblockerModalBypass:Adblocker Modal Bypass`,
  'Anti-Scrape Text Extraction': $localize`:@@about.memory.site.antiScrapeTextExtraction:Anti-Scrape Text Extraction`,
  'Buried Login Link': $localize`:@@about.memory.site.buriedLoginLink:Buried Login Link`,
  'Camouflaged Close Button': $localize`:@@about.memory.site.camouflagedCloseButton:Camouflaged Close Button`,
  'Horizontal Carousel': $localize`:@@about.memory.site.horizontalCarousel:Horizontal Carousel`,
  'Color Picker': $localize`:@@about.memory.site.colorPicker:Color Picker`,
  'Cookie Opt-Out Hidden Reject': $localize`:@@about.memory.site.cookieOptOutHiddenReject:Cookie Opt-Out Hidden Reject`,
  'File Upload Dropzone': $localize`:@@about.memory.site.fileUploadDropzone:File Upload Dropzone`,
  'Freeware Download Ad Avoidance': $localize`:@@about.memory.site.freewareDownloadAdAvoidance:Freeware Download Ad Avoidance`,
  'Newsletter Uncheck Before Submit': $localize`:@@about.memory.site.newsletterUncheckBeforeSubmit:Newsletter Uncheck Before Submit`,
  'Premium Highlighting Avoidance': $localize`:@@about.memory.site.premiumHighlightingAvoidance:Premium Highlighting Avoidance`,
  'Session Expiry Re-Authentication': $localize`:@@about.memory.site.sessionExpiryReAuthentication:Session Expiry Re-Authentication`,
  'Shuffled Cancel Button': $localize`:@@about.memory.site.shuffledCancelButton:Shuffled Cancel Button`,
  'Skip Ad Countdown': $localize`:@@about.memory.site.skipAdCountdown:Skip Ad Countdown`,
  'Slider CAPTCHA': $localize`:@@about.memory.site.sliderCaptcha:Slider CAPTCHA`,
  'Support Chatbot': $localize`:@@about.memory.site.supportChatbot:Support Chatbot`,
  'Two-Factor Authentication': $localize`:@@about.memory.site.twoFactorAuthentication:Two-Factor Authentication`,
};

const KNOWLEDGE_GRAPH_COPY = {
  unknown: $localize`:@@about.memory.graph.unknown:Unknown`,
  siteCount: (count: number) => $localize`:@@about.memory.graph.siteCount:${count}:count: sites`,
  selectorCount: (count: number) => $localize`:@@about.memory.graph.selectorCount:${count}:count: selectors`,
  workflowCount: (count: number) => $localize`:@@about.memory.graph.workflowCount:${count}:count: workflows`,
  warningCount: (count: number) => $localize`:@@about.memory.graph.warningCount:${count}:count: warnings`,
  taskDiscovered: $localize`:@@about.memory.graph.taskDiscovered:task-discovered`,
};

const DEMO_VIDEOS = [
  {
    id: '_iQ4_LSXcTU',
    name: $localize`:@@about.schema.demo.ecommerce.name:FSB: E-Commerce Autopilot by Grok 4.1`,
    alternateName: $localize`:@@about.schema.demo.ecommerce.alternateName:FSB Test 2`,
    description: $localize`:@@about.schema.demo.ecommerce.description:FSB drives a shopping workflow from instruction to browser actions, showing the practical side of full self-browsing.`,
    uploadDate: '2026-05-03T05:31:01-07:00',
  },
  {
    id: 'WbpOrFwgGME',
    name: $localize`:@@about.schema.demo.flight.name:Flight Booking: Powered by Codex MCP`,
    alternateName: $localize`:@@about.schema.demo.flight.alternateName:FSB Flight Booking`,
    description: $localize`:@@about.schema.demo.flight.description:Codex uses FSB through MCP as the browser layer, turning coding-agent reasoning into real page interaction.`,
    uploadDate: '2026-05-03T05:57:48-07:00',
  },
  {
    id: 'PNTGCWGopf8',
    name: $localize`:@@about.schema.demo.openClaw.name:OpenClaw Monitoring Doge Price`,
    alternateName: $localize`:@@about.schema.demo.openClaw.alternateName:FSB OpenClaw`,
    description: $localize`:@@about.schema.demo.openClaw.description:OpenClaw can provide the agent loop while FSB supplies the live browser control surface for real-world monitoring tasks.`,
    uploadDate: '2026-05-03T05:56:22-07:00',
  },
  {
    id: 'mD9oGB2JqVM',
    name: $localize`:@@about.schema.demo.claude.name:An Aha Moment by Claude Opus 4.6`,
    alternateName: $localize`:@@about.schema.demo.claude.alternateName:FSB Test #1`,
    description: $localize`:@@about.schema.demo.claude.description:Claude pairs reasoning with FSB's browser execution so the agent can learn from the page and keep iterating.`,
    uploadDate: '2026-05-02T23:10:58-07:00',
  },
] as const;

interface KnowledgeCategory {
  readonly name: string;
  readonly color: string;
  readonly colorDark?: string;
  readonly count: number;
}

interface KnowledgeGraphApi {
  render(container: HTMLElement, options?: { detailLevel?: GraphDetail }): void;
  destroy(container: HTMLElement): void;
  setDetailLevel(level: GraphDetail): void;
  highlight(query: string): void;
}

interface FsbKnowledgeWindow extends Window {
  __FSB_CATEGORIES?: KnowledgeCategory[];
  __FSB_CATEGORY_LABELS?: Readonly<Record<string, string>>;
  __FSB_SITE_LABELS?: Readonly<Record<string, string>>;
  __FSB_GRAPH_COPY?: typeof KNOWLEDGE_GRAPH_COPY;
  KnowledgeGraph?: KnowledgeGraphApi;
}

type GraphDetail = 'simple' | 'full';

let knowledgeGraphLoadPromise: Promise<void> | null = null;

@Component({
  selector: 'app-about-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './about-page.component.html',
  styleUrl: './about-page.component.scss',
})
export class AboutPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('graphHost') private graphHost?: ElementRef<HTMLElement>;

  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);
  private readonly themeService = inject(ThemeService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  categories: KnowledgeCategory[] = [];
  graphDetail: GraphDetail = 'simple';

  readonly memoryStats = [
    { value: '130', label: $localize`:@@about.memory.stats.sites:Sites` },
    { value: '19', label: $localize`:@@about.memory.stats.categories:Categories` },
    { value: '1,440', label: $localize`:@@about.memory.stats.selectors:Selectors` },
    { value: '342', label: $localize`:@@about.memory.stats.workflows:Workflows` },
    { value: '639', label: $localize`:@@about.memory.stats.warnings:Warnings` },
  ] as const;

  get graphTheme(): 'dark' | 'light' {
    return this.themeService.isDark() ? 'dark' : 'light';
  }

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    // Title and description carry user-facing copy (browser tab + meta description / social cards).
    // Marked via $localize so per-locale builds emit translated strings; embedded brand tokens
    // (FSB, Grok 4.1, Codex MCP, OpenClaw, Claude) are listed in DO-NOT-TRANSLATE.md for translators.
    const t = $localize`:@@about.meta.title:FSB - About`;
    const d = $localize`:@@about.meta.description:Watch real FSB demos: Grok 4.1 e-commerce autopilot, Codex MCP flight booking, OpenClaw monitoring, and Claude-powered browser iteration.`;
    this.applyMeta(t, d, url);
    this.injectDemoVideoJsonLd();
  }

  ngAfterViewInit(): void {
    void this.initMemoryGraph();
  }

  ngOnDestroy(): void {
    this.destroyMemoryGraph();
  }

  setGraphDetail(detail: GraphDetail): void {
    this.graphDetail = detail;
    this.getKnowledgeGraph()?.setDetailLevel(detail);
  }

  onGraphSearch(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.getKnowledgeGraph()?.highlight(input?.value ?? '');
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

  private injectDemoVideoJsonLd(): void {
    if (this.doc.head.querySelector('script[data-ld="about-demo-videos"]')) {
      return;
    }
    const payload = {
      '@context': 'https://schema.org',
      '@graph': DEMO_VIDEOS.map((video) => ({
        '@type': 'VideoObject',
        '@id': `${HOST}/about#demo-${video.id}`,
        name: video.name,
        alternateName: video.alternateName,
        description: video.description,
        url: `https://www.youtube.com/watch?v=${video.id}`,
        embedUrl: `https://www.youtube.com/embed/${video.id}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
        uploadDate: video.uploadDate,
        publisher: { '@id': `${HOST}/#org` },
        author: {
          '@type': 'Person',
          name: 'Parzival',
          url: YOUTUBE_CHANNEL,
        },
      })),
    };
    const json = JSON.stringify(payload).replace(/</g, '\\u003c');
    const script = this.renderer.createElement('script') as HTMLScriptElement;
    this.renderer.setAttribute(script, 'type', 'application/ld+json');
    this.renderer.setAttribute(script, 'data-ld', 'about-demo-videos');
    const text = this.renderer.createText(json);
    this.renderer.appendChild(script, text);
    this.renderer.appendChild(this.doc.head, script);
  }

  private async initMemoryGraph(): Promise<void> {
    if (typeof window === 'undefined') return;
    const host = this.graphHost?.nativeElement;
    if (!host) return;

    try {
      await this.loadKnowledgeGraphScripts();
      const win = window as FsbKnowledgeWindow;
      win.__FSB_CATEGORY_LABELS = KNOWLEDGE_CATEGORY_LABELS;
      win.__FSB_SITE_LABELS = KNOWLEDGE_SITE_LABELS;
      win.__FSB_GRAPH_COPY = KNOWLEDGE_GRAPH_COPY;
      this.categories = Array.isArray(win.__FSB_CATEGORIES)
        ? win.__FSB_CATEGORIES.map((category) => ({
          ...category,
          name: KNOWLEDGE_CATEGORY_LABELS[category.name] || category.name,
        }))
        : [];
      this.cdr.detectChanges();
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      const currentHost = this.graphHost?.nativeElement;
      if (!currentHost) return;
      this.zone.runOutsideAngular(() => {
        win.KnowledgeGraph?.render(currentHost, { detailLevel: this.graphDetail });
      });
    } catch (error) {
      console.warn('Knowledge graph render failed:', error);
    }
  }

  private destroyMemoryGraph(): void {
    if (typeof window === 'undefined') return;
    const host = this.graphHost?.nativeElement;
    if (!host) return;
    this.getKnowledgeGraph()?.destroy(host);
  }

  private loadKnowledgeGraphScripts(): Promise<void> {
    if (!knowledgeGraphLoadPromise) {
      knowledgeGraphLoadPromise = this.loadScript('/assets/fsb-knowledge-data.js', 'fsb-knowledge-data')
        .then(() => this.loadScript('/assets/knowledge-graph.js', 'fsb-knowledge-graph'));
    }
    return knowledgeGraphLoadPromise;
  }

  private loadScript(src: string, id: string): Promise<void> {
    if (this.doc.getElementById(id)) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const script = this.renderer.createElement('script') as HTMLScriptElement;
      script.id = id;
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Unable to load ${src}`));
      this.renderer.appendChild(this.doc.body, script);
    });
  }

  private getKnowledgeGraph(): KnowledgeGraphApi | undefined {
    if (typeof window === 'undefined') return undefined;
    return (window as FsbKnowledgeWindow).KnowledgeGraph;
  }
}
