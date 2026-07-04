import { Component, OnInit, Renderer2, inject, DOCUMENT, LOCALE_ID } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';

import { HOST, buildLocaleUrl, emitLocaleHead } from '../../core/seo/locale-seo';
import { PrivacyHistoryArchiveComponent } from './privacy-history-archive.component';

const ROUTE_PATH = '/privacy';
const OG_IMAGE = `${HOST}/assets/fsb_logo_dark.png`;
const OG_IMAGE_ALT = 'FSB Full Self-Browsing logo';
const SITE_NAME = 'FSB - Full Self-Browsing';

@Component({
  selector: 'app-privacy-page',
  standalone: true,
  imports: [PrivacyHistoryArchiveComponent],
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
}
