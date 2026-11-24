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
 * A website saved with https:// is never released to an http:// page, so a
 * login is not typed into a page without TLS. A website saved without a
 * scheme, or with http://, matches either.
 */

// Suffixes under which unrelated parties each register their own name, so the
// registrable domain is the suffix plus one more label (alpha.co.uk,
// app.github.io). Anything not listed falls back to the last two labels.
// Adding an entry only makes matching stricter, never looser.
const PUBLIC_SUFFIXES = new Set([
  // Multi-level country suffixes (the list the extension's own vault used).
  'co.uk', 'co.jp', 'co.kr', 'co.in', 'co.nz', 'co.za', 'co.il',
  'com.br', 'com.au', 'com.mx', 'com.cn', 'com.tw', 'com.hk', 'com.sg',
  'com.ar', 'com.tr', 'com.eg', 'com.pk', 'com.ng', 'com.co',
  'gov.uk', 'gov.au', 'gov.in',
  'org.uk', 'org.au',
  'net.au', 'net.br',
  'ac.uk', 'ac.jp',
  'edu.au', 'edu.cn',
  // Shared hosting where every customer gets a subdomain (Public Suffix List,
  // private section).
  'github.io', 'githubusercontent.com', 'gitlab.io', 'bitbucket.io', 'codeberg.page',
  'vercel.app', 'now.sh', 'netlify.app', 'pages.dev', 'workers.dev', 'r2.dev',
  'web.app', 'firebaseapp.com', 'appspot.com', 'blogspot.com',
  'herokuapp.com', 'onrender.com', 'fly.dev', 'up.railway.app', 'deno.dev',
  'azurewebsites.net', 'azurestaticapps.net', 'cloudfront.net', 'amplifyapp.com',
  's3.amazonaws.com', 'elasticbeanstalk.com',
  'glitch.me', 'surge.sh', 'repl.co', 'readthedocs.io', 'webflow.io',
  'myshopify.com', 'wixsite.com',
  'ngrok.io', 'ngrok.app', 'ngrok-free.app',
]);

const HOST_PATTERN = /^[a-z0-9.-]+$/;

export type MatchStrength = 'exact' | 'site';

export interface HostTarget {
  hostname: string;
  port: string;
  /** The scheme the input named, or null for a bare host such as "example.com". */
  protocol: 'http:' | 'https:' | null;
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
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const hostname = normalizeHostname(url.hostname);
  if (!hostname) return null;
  return { hostname, port: url.port || '', protocol: hasScheme ? url.protocol : null };
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

/**
 * Scheme to record for a host whose scheme is unknown (FSB's old vault kept
 * hostnames only). Routers, intranet names, and localhost are usually served
 * over http, so they get http:// and keep matching; public sites get https://
 * and are protected from plain-http pages.
 */
export function defaultSchemeForHost(hostname: string): 'http:' | 'https:' {
  return isIpHost(hostname) || !hostname.includes('.') ? 'http:' : 'https:';
}

/**
 * Approximate eTLD+1 ("accounts.google.com" -> "google.com",
 * "docs.app.github.io" -> "app.github.io"). A host that is itself a listed
 * suffix ("github.io") is returned as is, so it matches none of the sites
 * under it.
 */
export function registrableDomain(hostname: string): string {
  if (isIpHost(hostname)) return hostname;
  const labels = hostname.split('.');
  // Longest listed suffix first, so up.railway.app wins over a shorter entry.
  for (let start = 0; start < labels.length; start += 1) {
    if (PUBLIC_SUFFIXES.has(labels.slice(start).join('.'))) {
      return start === 0 ? hostname : labels.slice(start - 1).join('.');
    }
  }
  return labels.length <= 2 ? hostname : labels.slice(-2).join('.');
}

export function websiteMatch(website: WebsiteLike, target: HostTarget): MatchStrength | null {
  const behavior = typeof website.autofillBehavior === 'string' ? website.autofillBehavior : 'AnywhereOnWebsite';
  if (behavior === 'Never') return null;
  const site = parseHostTarget(website.url);
  if (!site) return null;
  // An https login never goes to a page an on-path attacker could rewrite.
  if (site.protocol === 'https:' && target.protocol === 'http:') return null;

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

/**
 * How each saved website of an item is matched, for display: the host, the
 * 1Password autofill rule ("site" covers subdomains, "exact" does not), and
 * the scheme it names (empty for a bare host). Never entries are skipped.
 */
export function websiteDetails(websites: unknown): Array<{ host: string; rule: 'site' | 'exact'; protocol: 'http' | 'https' | '' }> {
  if (!Array.isArray(websites)) return [];
  const seen = new Set<string>();
  const out: Array<{ host: string; rule: 'site' | 'exact'; protocol: 'http' | 'https' | '' }> = [];
  for (const website of websites) {
    if (!website || typeof website !== 'object') continue;
    const entry = website as WebsiteLike;
    if (entry.autofillBehavior === 'Never') continue;
    const parsed = parseHostTarget(entry.url);
    if (!parsed) continue;
    const host = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    const rule = entry.autofillBehavior === 'ExactDomain' ? 'exact' : 'site';
    const protocol = parsed.protocol === 'http:' ? 'http' : parsed.protocol === 'https:' ? 'https' : '';
    const key = `${protocol}|${host}|${rule}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ host, rule, protocol });
  }
  return out;
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
