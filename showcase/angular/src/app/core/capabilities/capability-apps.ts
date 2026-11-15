// The app logos behind the "native API handlers" marquee. Shared because two
// surfaces render the same list: the home page's full-width marquee and the
// release-notes 0.9.90 "Capability catalog" section's mini variant. Names are
// brand tokens and stay untranslated at every call site.

export interface CapabilityApp {
  readonly name: string;
  readonly icon: string;
  readonly cls?: string;
}

/** Monogram fallback for apps Simple Icons does not carry (trademark opt-outs). */
function capabilityIcon(name: string): string {
  const label = name.slice(0, 1).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="none"/><text x="12" y="16" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" fill="#94a3b8">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/* The Simple Icons marks, saved in the marquee's slate (#94a3b8) under
   showcase/assets/capabilities so the page asks no third-party host for them. */
function simpleIcon(slug: string): string {
  return `/assets/capabilities/${slug}.svg`;
}

function capability(name: string, slug?: string): CapabilityApp {
  return { name, icon: slug ? simpleIcon(slug) : capabilityIcon(name), cls: '' };
}

export const CAPABILITY_ROW_1: readonly CapabilityApp[] = [
  capability('GitHub', 'github'),
  capability('Slack'),
  capability('Notion', 'notion'),
  capability('Linear', 'linear'),
  capability('Jira', 'jira'),
  capability('Confluence', 'confluence'),
  capability('ClickUp', 'clickup'),
  capability('Asana', 'asana'),
  capability('Airtable', 'airtable'),
  capability('GitLab', 'gitlab'),
  capability('Bitbucket', 'bitbucket'),
  capability('Vercel', 'vercel'),
  capability('Netlify', 'netlify'),
];

export const CAPABILITY_ROW_2: readonly CapabilityApp[] = [
  capability('Cloudflare', 'cloudflare'),
  capability('CircleCI', 'circleci'),
  capability('Datadog', 'datadog'),
  capability('Sentry', 'sentry'),
  capability('PostHog', 'posthog'),
  { name: 'ChatGPT', icon: '/assets/providers/openai.svg', cls: 'cap-logo-inv' },
  capability('Claude', 'claude'),
  capability('Bluesky', 'bluesky'),
  capability('Mastodon', 'mastodon'),
  capability('Threads', 'threads'),
  capability('Discord', 'discord'),
  capability('Reddit', 'reddit'),
];
