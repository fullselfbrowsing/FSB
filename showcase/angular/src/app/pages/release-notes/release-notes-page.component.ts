import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  Component,
  LOCALE_ID,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  Renderer2,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

import { CAPABILITY_ROW_1, CAPABILITY_ROW_2, type CapabilityApp } from '../../core/capabilities/capability-apps';
import { HOST, buildLocaleUrl, emitLocaleHead } from '../../core/seo/locale-seo';
import { APP_VERSION } from '../../core/seo/version';

const ROUTE_PATH = '/release-notes';
const OG_IMAGE = `${HOST}/assets/fsb_logo_dark.png`;
const OG_IMAGE_ALT = $localize`:@@releaseNotes.og.imageAlt:FSB Full Self-Browsing logo`;
const SITE_NAME = $localize`:@@site.name:FSB - Full Self-Browsing`;

/* Fade the content column out, swap, fade back. Mirrors the handoff's timings so
   a version change reads as one continuous move rather than a jump cut. */
const SWAP_OUT_MS = 200;

interface ReleaseEntry {
  readonly version: string;
  /** Draws the accent dot the handoff puts beside the 0.9.50 milestone. */
  readonly milestone?: boolean;
}

@Component({
  selector: 'app-release-notes-page',
  standalone: true,
  templateUrl: './release-notes-page.component.html',
  styleUrl: './release-notes-page.component.scss',
})
export class ReleaseNotesPageComponent implements OnInit, OnDestroy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly renderer = inject(Renderer2);
  private readonly doc = inject(DOCUMENT);
  private readonly localeId = inject(LOCALE_ID);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly browser = isPlatformBrowser(this.platformId);
  private swapTimer?: ReturnType<typeof setTimeout>;

  readonly capRow1: readonly CapabilityApp[] = CAPABILITY_ROW_1;
  readonly capRow2: readonly CapabilityApp[] = CAPABILITY_ROW_2;

  readonly releases: readonly ReleaseEntry[] = [
    { version: '0.9.91' },
    { version: '0.9.90' },
    { version: '0.9.70' },
    { version: '0.9.60' },
    { version: '0.9.50', milestone: true },
    { version: '0.9.30' },
    { version: '0.9.20' },
    { version: '0.9.8' },
    { version: '0.9.4' },
    { version: '0.9.1' },
    { version: '0.9.0' },
    { version: '0.3' },
    { version: '0.2' },
    { version: '0.1' },
  ];

  readonly version = signal(APP_VERSION);
  readonly swapping = signal(false);
  /* The rail can outlive the written archive: any release without a section
     block falls through to the "notes pending" state instead of a blank column. */
  readonly isPending = computed(() => !DOCUMENTED_VERSIONS.has(this.version()));

  /* 0.1 and 0.2 shipped before the third component existed; the rail keeps the
     short label but the hero and archive readouts spell the full triple. */
  readonly versionLabel = computed(() => {
    const current = this.version();
    return current === '0.1' || current === '0.2' ? `${current}.0` : current;
  });

  ngOnInit(): void {
    const url = buildLocaleUrl(this.localeId, ROUTE_PATH);
    const t = $localize`:@@releaseNotes.meta.title:FSB - Release notes`;
    const d = $localize`:@@releaseNotes.meta.description:Every FSB release, illustrated: delegated agent runtimes, the toolbar activity icon, multi-agent tab ownership, the MCP bridge, and the capability catalog, back to the first Chrome-extension prototype.`;
    this.applyMeta(t, d, url);
  }

  ngOnDestroy(): void {
    clearTimeout(this.swapTimer);
  }

  pickVersion(event: Event): void {
    const target = event.target as HTMLElement | null;
    const row = target?.closest?.('[data-v]') as HTMLElement | null;
    const next = row?.getAttribute('data-v');
    if (next) this.goToVersion(next);
  }

  keyVersion(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.pickVersion(event);
  }

  private goToVersion(next: string): void {
    if (this.swapping() || next === this.version()) return;
    this.swapping.set(true);
    this.swapTimer = setTimeout(() => {
      this.version.set(next);
      this.swapping.set(false);
      // The new release starts a fresh read; leaving the reader mid-column
      // would drop them into an unrelated section.
      if (this.browser) window.scrollTo({ top: 0, behavior: 'instant' });
    }, SWAP_OUT_MS);
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

/* The versions that actually have a section block in the template. Deliberately
   not derived from `releases`, which drives the rail: a rail entry added without
   its two @if blocks has to reach "notes pending" rather than render an empty
   column, and deriving one list from the other would make that impossible.
   Declared in the module tail so it does not shift the $localize line pins above. */
const DOCUMENTED_VERSIONS: ReadonlySet<string> = new Set([
  '0.9.91', '0.9.90', '0.9.70', '0.9.60', '0.9.50', '0.9.30', '0.9.20',
  '0.9.8', '0.9.4', '0.9.1', '0.9.0', '0.3', '0.2', '0.1',
]);
