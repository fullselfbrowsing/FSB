import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Per-route render mode configuration for the static prerender build.
 *
 * Angular 19's `@angular/build:application` ignores the legacy
 * `prerender.{discoverRoutes,routesFile}` keys when `outputMode: "static"` is
 * set (see options.js: "The 'prerender' option is not considered when
 * 'outputMode' is specified."). The supported control surface is
 * `provideServerRouting` (or this server-routes export) with explicit
 * RenderMode per path.
 *
 * `/dashboard` MUST stay Client-rendered (D-18) -- its runtime state would be
 * baked stale, and prerendering it pulls in localStorage/chrome.storage code
 * that throws in the Node prerender environment.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'about', renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: 'support', renderMode: RenderMode.Prerender },
  { path: 'agents', renderMode: RenderMode.Prerender },
  { path: 'lattice', renderMode: RenderMode.Prerender },
  { path: 'phantom-stream', renderMode: RenderMode.Prerender },
  { path: 'prometheus', renderMode: RenderMode.Prerender },
  { path: 'sitemaps', renderMode: RenderMode.Prerender },
  { path: 'dashboard', renderMode: RenderMode.Client },
  { path: 'stats', renderMode: RenderMode.Client },
  { path: 'legal', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Client },
];
