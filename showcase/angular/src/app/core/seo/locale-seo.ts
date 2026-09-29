// Phase 264 / SEO-01 -- Per-locale canonical + hreflang fan-out helper.
// Used by every marketing page component (home, about, agents, privacy, support)
// to set the locale-aware <link rel="canonical"> and the 7 locales + x-default
// <link rel="alternate" hreflang> block at prerender time.
//
// Contract:
//   - buildLocaleUrl(localeId, routePath) returns the absolute URL for the page
//     in the given locale, honoring the no-trailing-slash invariant for the home
//     route (routePath === '').
//   - emitLocaleHead(renderer, doc, localeId, routePath) upserts canonical and
//     replaces the hreflang block (idempotent on CSR re-entry).
//
// Hard rule: this helper MUST NOT touch <html lang>. Angular's i18n compiler
// sets that automatically per `angular.json:i18n.locales.{locale}` at build
// time. Manual override would conflict with prerender output.

import { Renderer2 } from '@angular/core';
import { LOCALES, LOCALE_SUBPATHS, isValidLocale, type LocaleCode } from '../i18n/locale-constants';

export const HOST = 'https://full-selfbrowsing.com';

function safeLocale(localeId: string): LocaleCode {
  if (isValidLocale(localeId)) {
    return localeId;
  }
  // Should never happen in production -- Angular i18n compiler always provides
  // a valid LOCALE_ID. Guards against test misconfiguration and runtime weirdness.
  // eslint-disable-next-line no-console
  console.warn(`[locale-seo] Unknown LOCALE_ID "${localeId}" -- falling back to "en".`);
  return 'en';
}

/**
 * Build an absolute URL for the given locale + route path.
 * - routePath '' -> home (no trailing slash): HOST or HOST/{subpath}
 * - routePath '/about' -> HOST/about or HOST/{subpath}/about
 */
export function buildLocaleUrl(localeId: string, routePath: string): string {
  const locale = safeLocale(localeId);
  const sub = LOCALE_SUBPATHS[locale];
  // Home (routePath === '') on en: bare HOST. On non-en: HOST/{sub}.
  if (routePath === '' || routePath === '/') {
    return sub ? `${HOST}/${sub}` : HOST;
  }
  // Other routes: HOST{routePath} (en) or HOST/{sub}{routePath} (non-en).
  return sub ? `${HOST}/${sub}${routePath}` : `${HOST}${routePath}`;
}

/**
 * Upsert canonical + replace hreflang block on document.head.
 * Idempotent: removes pre-existing <link rel="alternate"> tags before appending
 * the fresh fan-out so CSR re-entry on a route does not accumulate stale links.
 */
export function emitLocaleHead(
  renderer: Renderer2,
  doc: Document,
  localeId: string,
  routePath: string
): void {
  const canonical = buildLocaleUrl(localeId, routePath);

  // 1. Upsert canonical (matches existing per-page pattern).
  let canonicalLink = doc.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonicalLink) {
    canonicalLink = renderer.createElement('link') as HTMLLinkElement;
    renderer.setAttribute(canonicalLink, 'rel', 'canonical');
    renderer.appendChild(doc.head, canonicalLink);
  }
  renderer.setAttribute(canonicalLink, 'href', canonical);

  // 2. Remove existing alternates (idempotency on CSR route revisit).
  const existing = doc.head.querySelectorAll('link[rel="alternate"]');
  existing.forEach((node) => renderer.removeChild(doc.head, node));

  // 3. Emit one alternate per LOCALES entry, in declaration order.
  for (const locale of LOCALES) {
    const link = renderer.createElement('link') as HTMLLinkElement;
    renderer.setAttribute(link, 'rel', 'alternate');
    renderer.setAttribute(link, 'hreflang', locale);
    renderer.setAttribute(link, 'href', buildLocaleUrl(locale, routePath));
    renderer.appendChild(doc.head, link);
  }

  // 4. Emit x-default pointing at the en URL (per SEO-01 success criterion 1).
  const xDefault = renderer.createElement('link') as HTMLLinkElement;
  renderer.setAttribute(xDefault, 'rel', 'alternate');
  renderer.setAttribute(xDefault, 'hreflang', 'x-default');
  renderer.setAttribute(xDefault, 'href', buildLocaleUrl('en', routePath));
  renderer.appendChild(doc.head, xDefault);
}
