import { Component, OnInit, inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';

const OG_IMAGE = 'https://full-selfbrowsing.com/assets/fsb_logo_dark.png';
const OG_IMAGE_ALT = 'FSB Full Self-Browsing logo';
const SITE_NAME = 'FSB - Full Self-Browsing';

@Component({
  selector: 'app-legal-page',
  standalone: true,
  templateUrl: './legal-page.component.html',
  styleUrl: './legal-page.component.scss',
})
export class LegalPageComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  // Non-translatable audit-entry schema sample, rendered verbatim in a code block. Kept in
  // code (not an i18n message) so it is never extracted or required in the locale catalogs.
  readonly auditSchema = '{ timestamp, origin, capability slug, method, side-effect class, consent\ndecision, outcome, error? }';

  ngOnInit(): void {
    const t = $localize`:@@legal.meta.title:FSB - Legal and Governance Posture`;
    const d = $localize`:@@legal.meta.description:FSB's automation posture, consent model, audit-log retention policy, and service-denylist rationale.`;
    this.title.setTitle(t);
    this.meta.updateTag({ name: 'description', content: d });
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.meta.updateTag({ property: 'og:title', content: t });
    this.meta.updateTag({ property: 'og:description', content: d });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:image', content: OG_IMAGE });
    this.meta.updateTag({ property: 'og:image:alt', content: OG_IMAGE_ALT });
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
  }
}
