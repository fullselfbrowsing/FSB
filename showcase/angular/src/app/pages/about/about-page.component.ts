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
import { PageJsonLdService } from '../../core/seo/page-json-ld.service';
import TRAILER_VIDEO from '../../core/seo/trailer-video.json';
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
  // Graph nodes routinely carry a count of 1, so a single form rendered
  // "1 selectors" in en/de/es. Of the supported locales only those three
  // inflect, and all three are two-form, so a singular/plural pair is
  // sufficient -- ja/ko/zh simply translate both forms identically.
  siteCount: (count: number) => count === 1
    ? $localize`:@@about.memory.graph.siteCountOne:${count}:count: site`
    : $localize`:@@about.memory.graph.siteCount:${count}:count: sites`,
  selectorCount: (count: number) => count === 1
    ? $localize`:@@about.memory.graph.selectorCountOne:${count}:count: selector`
    : $localize`:@@about.memory.graph.selectorCount:${count}:count: selectors`,
  workflowCount: (count: number) => count === 1
    ? $localize`:@@about.memory.graph.workflowCountOne:${count}:count: workflow`
    : $localize`:@@about.memory.graph.workflowCount:${count}:count: workflows`,
  warningCount: (count: number) => count === 1
    ? $localize`:@@about.memory.graph.warningCountOne:${count}:count: warning`
    : $localize`:@@about.memory.graph.warningCount:${count}:count: warnings`,
  taskDiscovered: $localize`:@@about.memory.graph.taskDiscovered:task-discovered`,
};

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

  private readonly pageJsonLd = inject(PageJsonLdService);
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

  // Counts are formatted per locale, not hardcoded: a literal '1,440' rendered a
  // comma separator next to the translated '1.440' in the card meta below on
  // /de/about. Keep these numeric and let Intl pick the separator.
  readonly memoryStats = [
    { value: 130, label: $localize`:@@about.memory.stats.sites:Sites` },
    { value: 19, label: $localize`:@@about.memory.stats.categories:Categories` },
    { value: 1440, label: $localize`:@@about.memory.stats.selectors:Selectors` },
    { value: 342, label: $localize`:@@about.memory.stats.workflows:Workflows` },
    { value: 639, label: $localize`:@@about.memory.stats.warnings:Warnings` },
  ] as const;

  formatStatValue(value: number): string {
    try {
      return new Intl.NumberFormat(this.localeId).format(value);
    } catch {
      return String(value);
    }
  }

  get graphTheme(): 'dark' | 'light' {
    return this.themeService.isDark() ? 'dark' : 'light';
  }

  readonly trailerName = $localize`:@@about.schema.trailer.name:FSB Demo: AI Browser Automation in Chrome`;
  readonly trailerDescription = $localize`:@@about.schema.trailer.description:Watch the 33-second Full Self-Browsing trailer. FSB is an open-source Chrome extension for natural-language browser automation and a real browser connection for AI agents through MCP.`;
  readonly trailerWatchUrl = TRAILER_VIDEO.watchUrl;

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    // Title and description carry user-facing copy (browser tab + meta description / social cards).
    // Marked via $localize so per-locale builds emit translated strings; embedded brand tokens
    // (FSB, MCP) are listed in DO-NOT-TRANSLATE.md for translators.
    const t = $localize`:@@about.meta.title:About FSB | AI Browser Automation Demo`;
    const d = $localize`:@@about.meta.description:Watch the 33-second FSB demo, explore built-in memory for 130 sites, and discover 60 browser actions available to AI agents through MCP.`;
    this.applyMeta(t, d, url);
    this.injectTrailerVideoJsonLd();
  }

  ngAfterViewInit(): void {
    void this.initMemoryGraph();
  }

  ngOnDestroy(): void {
    this.pageJsonLd.remove('about-trailer-video');
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

  private injectTrailerVideoJsonLd(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    const videoId = `${HOST}/about#demo-${TRAILER_VIDEO.id}`;
    const payload = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'AboutPage',
          '@id': `${url}#webpage`,
          url,
          inLanguage: this.localeId,
          name: this.title.getTitle(),
          description: this.meta.getTag('name="description"')?.content,
          video: { '@id': videoId },
          publisher: { '@id': `${HOST}/#org` },
        },
        {
          '@type': 'VideoObject',
          '@id': videoId,
          name: this.trailerName,
          alternateName: TRAILER_VIDEO.originalTitle,
          description: this.trailerDescription,
          url: TRAILER_VIDEO.watchUrl,
          embedUrl: TRAILER_VIDEO.embedUrl,
          thumbnailUrl: TRAILER_VIDEO.thumbnailUrl,
          uploadDate: TRAILER_VIDEO.uploadDate,
          duration: TRAILER_VIDEO.duration,
          isPartOf: { '@id': `${url}#webpage` },
          publisher: { '@id': `${HOST}/#org` },
          author: { '@type': 'Person', name: 'Parzival', url: YOUTUBE_CHANNEL },
        },
      ],
    };
    this.pageJsonLd.set('about-trailer-video', payload);
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
