import { ChangeDetectorRef, Component, ElementRef, OnInit, Renderer2, ViewChild, afterNextRender, inject, DOCUMENT, LOCALE_ID } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { DepthEndComponent } from '../../layout/depth/depth-end.component';
import { DepthRailComponent, type DepthRailItem } from '../../layout/depth/depth-rail.component';
import { DepthStageDirective } from '../../layout/depth/depth-stage.directive';
import { HOST, buildLocaleUrl, emitLocaleHead } from '../../core/seo/locale-seo';
import { PrivacyHistoryArchiveComponent } from './privacy-history-archive.component';

const ROUTE_PATH = '/privacy';
const OG_IMAGE = `${HOST}/assets/fsb_logo_dark.png`;
const OG_IMAGE_ALT = $localize`:@@privacy.og.imageAlt:FSB Full Self-Browsing logo`;
const SITE_NAME = $localize`:@@site.name:FSB - Full Self-Browsing`;

@Component({
  selector: 'app-privacy-page',
  standalone: true,
  imports: [PrivacyHistoryArchiveComponent, RouterLink, DepthStageDirective, DepthRailComponent, DepthEndComponent],
  templateUrl: './privacy-page.component.html',
  styleUrl: './privacy-page.component.scss',
})
export class PrivacyPageComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    // Marked via $localize so per-locale builds emit translated strings; embedded brand
    // tokens (FSB, Chrome) are preserved verbatim by translators per DO-NOT-TRANSLATE.md.
    const t = $localize`:@@privacy.meta.title:FSB - Privacy`;
    const d = $localize`:@@privacy.meta.description:How FSB handles your data: API keys encrypted in Chrome local storage, opt-out anonymous usage telemetry, automation runs locally in your browser. BYO key, BYO browser.`;
    this.applyMeta(t, d, url);
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

  /* Depth page wiring. The policy is one plane that scrolls inside itself; once
     it is rendered, the rail lists each of its sections by heading (read from the
     page, so every locale gets its own titles). */
  @ViewChild(DepthStageDirective) private readonly stage?: DepthStageDirective;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly railLabel = PRIVACY_RAIL_ARIA;
  rail: readonly DepthRailItem[] = [
    { label: PRIVACY_RAIL_OVERVIEW, layer: 0 },
    { label: PRIVACY_RAIL_POLICY, layer: 1 },
    { label: PRIVACY_RAIL_INDEX, layer: 2 },
  ];

  constructor() {
    afterNextRender(() => {
      const headings = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('h2[data-depth-anchor]'));
      const sections = headings
        .map((h, sec) => ({ label: (h.textContent || '').replace(/\s+/g, ' ').trim(), layer: 1, sec }))
        .filter((item) => item.label);
      if (!sections.length) return;
      this.rail = [{ label: PRIVACY_RAIL_OVERVIEW, layer: 0 }, ...sections, { label: PRIVACY_RAIL_INDEX, layer: 2 }];
      this.cdr.detectChanges();
      this.stage?.refreshRail();
    });
  }
}

/* Depth page: the planes of this page in order. */
const PRIVACY_RAIL_ARIA = $localize`:@@privacy.depth.rail.aria:FSB privacy policy sections`;
const PRIVACY_RAIL_OVERVIEW = $localize`:@@privacy.depth.rail.overview:Overview`;
const PRIVACY_RAIL_POLICY = $localize`:@@privacy.depth.rail.policy:Policy`;
const PRIVACY_RAIL_INDEX = $localize`:@@depth.rail.index:Index`;
