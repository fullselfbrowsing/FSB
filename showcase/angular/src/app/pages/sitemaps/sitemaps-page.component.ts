import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  LOCALE_ID,
  NgZone,
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
import { GlobeVisualizationService, createSeededRandom } from '../../core/globe/globe-visualization.service';
import { GlobeRegion } from '../../core/globe/globe-visualization.types';

const ROUTE_PATH = '/sitemaps';
const OG_IMAGE = `${HOST}/assets/fsb_logo_dark.png`;
const OG_IMAGE_ALT = $localize`:@@sitemaps.og.imageAlt:FSB Full Self-Browsing logo`;
const SITE_NAME = $localize`:@@site.name:FSB - Full Self-Browsing`;

@Component({
  selector: 'app-sitemaps-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './sitemaps-page.component.html',
  styleUrl: './sitemaps-page.component.scss',
})
export class SiteMapsPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('globeCanvas') private globeCanvas?: ElementRef<HTMLCanvasElement>;

  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private readonly globeService = inject(GlobeVisualizationService);

  private readonly browser = isPlatformBrowser(this.platformId);
  private stopGlobe?: () => void;

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    const t = $localize`:@@sitemaps.meta.title:FSB - Site Maps`;
    const d = $localize`:@@sitemaps.meta.description:Community site maps for FSB are under development. Contribute well tested site schemas that can become built-in browser knowledge.`;
    this.applyMeta(t, d, url);
  }

  ngAfterViewInit(): void {
    if (!this.browser) return;
    const canvas = this.globeCanvas?.nativeElement;
    if (!canvas) return;
    this.zone.runOutsideAngular(() => {
      // Illustrative activity clusters (US, Mexico, Europe, Taiwan, China,
      // Japan) -- decorative, not derived from real data. One fresh seed-719
      // PRNG per visit draws the six counts (stream positions 1-6) and is
      // then handed to setupGlobe for the node jitter (positions 7+) -- the
      // exact draw order of the pre-extraction inline globe, so the page
      // keeps its original deterministic layout on every visit.
      const random = createSeededRandom(719);
      const rand = (min: number, max: number): number => min + random() * (max - min);
      const regions: readonly GlobeRegion[] = [
        { lon: -98, lat: 39, spread: 13, count: rand(10, 16) },
        { lon: -102, lat: 23, spread: 7, count: rand(4, 8) },
        { lon: 10, lat: 50, spread: 12, count: rand(8, 14) },
        { lon: 121, lat: 23.7, spread: 2.5, count: rand(2, 6) },
        { lon: 104, lat: 35, spread: 12, count: rand(8, 14) },
        { lon: 138, lat: 37, spread: 5, count: rand(4, 8) },
      ];
      this.stopGlobe = this.globeService.setupGlobe(canvas, regions, random);
    });
  }

  ngOnDestroy(): void {
    this.stopGlobe?.();
    this.stopGlobe = undefined;
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
}
