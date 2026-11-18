/**
 * Website matching for 1Password Login items.
 *
 * The extension tells the broker which host the agent's tab is on. A login is
 * only ever released for a host one of its websites matches, using the same
 * rules 1Password's own autofill applies:
 *   - Never              -> the website is ignored.
 *   - ExactDomain        -> hostname (and an explicit port) must be identical.
 *   - AnywhereOnWebsite  -> the host must sit on the same registrable domain.
 * IP addresses and single-label hosts (localhost) always match exactly.
 */

// Multi-level public suffixes where the registrable domain keeps three labels.
// Mirrors the list the extension used for its own vault so behavior carries over.
const MULTI_LEVEL_SUFFIXES = new Set([
  'co.uk', 'co.jp', 'co.kr', 'co.in', 'co.nz', 'co.za', 'co.il',
  'com.br', 'com.au', 'com.mx', 'com.cn', 'com.tw', 'com.hk', 'com.sg',
  'com.ar', 'com.tr', 'com.eg', 'com.pk', 'com.ng', 'com.co',
  'gov.uk', 'gov.au', 'gov.in',
  'org.uk', 'org.au',
  'net.au', 'net.br',
  'ac.uk', 'ac.jp',
  'edu.au', 'edu.cn',
]);

const HOST_PATTERN = /^[a-z0-9.-]+$/;

export type MatchStrength = 'exact' | 'site';

export interface HostTarget {
  hostname: string;
  port: string;
}

export interface WebsiteLike {
  url?: unknown;
  autofillBehavior?: unknown;
}

/**
 * Parse a URL or bare host into a normalized target. Returns null for anything
 * that is not an http(s) origin with a plausible hostname.
 */
export function parseHostTarget(input: unknown): HostTarget | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const hostname = normalizeHostname(url.hostname);
  if (!hostname) return null;
  return { hostname, port: url.port || '' };
}

export function normalizeHostname(value: string): string | null {
  let host = String(value || '').trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) return host; // IPv6 literal
  host = host.replace(/\.$/, '').replace(/^www\./, '');
  if (!host || host.length > 253 || !HOST_PATTERN.test(host)) return null;
  if (host.startsWith('.') || host.endsWith('.') || host.includes('..')) return null;
  return host;
}

export function isIpHost(hostname: string): boolean {
  if (hostname.startsWith('[')) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

/** Approximate eTLD+1 ("accounts.google.com" -> "google.com"). */
export function registrableDomain(hostname: string): string {
  if (isIpHost(hostname)) return hostname;
  const labels = hostname.split('.');
  if (labels.length <= 2) return hostname;
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_LEVEL_SUFFIXES.has(lastTwo)) {
    return labels.length > 3 ? labels.slice(-3).join('.') : hostname;
  }
  return lastTwo;
}

export function websiteMatch(website: WebsiteLike, target: HostTarget): MatchStrength | null {
  const behavior = typeof website.autofillBehavior === 'string' ? website.autofillBehavior : 'AnywhereOnWebsite';
  if (behavior === 'Never') return null;
  const site = parseHostTarget(website.url);
  if (!site) return null;

  const sameHost = site.hostname === target.hostname;
  const portOk = !site.port || site.port === target.port;

  if (sameHost && portOk) return 'exact';
  if (behavior === 'ExactDomain') return null;
  if (isIpHost(site.hostname) || isIpHost(target.hostname)) return null;
  if (!site.hostname.includes('.') || !target.hostname.includes('.')) return null;
  if (!portOk) return null;

  const siteDomain = registrableDomain(site.hostname);
  const targetDomain = registrableDomain(target.hostname);
  return siteDomain === targetDomain ? 'site' : null;
}

/** Best match across all of an item's websites, or null if none apply. */
export function bestWebsiteMatch(websites: unknown, target: HostTarget): MatchStrength | null {
  if (!Array.isArray(websites)) return null;
  let best: MatchStrength | null = null;
  for (const website of websites) {
    if (!website || typeof website !== 'object') continue;
    const strength = websiteMatch(website as WebsiteLike, target);
    if (strength === 'exact') return 'exact';
    if (strength === 'site') best = 'site';
  }
  return best;
}

/** Hostnames to show for an item, deduplicated, skipping Never entries. */
export function websiteHosts(websites: unknown): string[] {
  if (!Array.isArray(websites)) return [];
  const hosts = new Set<string>();
  for (const website of websites) {
    if (!website || typeof website !== 'object') continue;
    const entry = website as WebsiteLike;
    if (entry.autofillBehavior === 'Never') continue;
    const parsed = parseHostTarget(entry.url);
    if (parsed) hosts.add(parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname);
  }
  return [...hosts];
}
