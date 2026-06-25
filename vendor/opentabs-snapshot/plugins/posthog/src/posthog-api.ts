// Hermetic transport-helper stub for the vendored posthog metadata slice.
//
// Upstream posthog-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// PostHog REST API (https://app.posthog.com/api). The importer NEVER executes a
// handle() body (Wall 1), but the tool modules reference `api` in their (never-run)
// handle closures, so this symbol must RESOLVE at module-eval time. This stub
// provides inert no-op implementations that throw if ever actually called -- they
// never are during a metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing these helpers. The upstream verb
// facts (preserved here as comments for auditability): PostHog is a read-only
// analytics surface in this vendored slice -- every op GETs (list_insights /
// get_insight / list_dashboards) and the events query GETs against /api/event.
// `query` is in the shared READ_VERBS set and list/get are reads, so the whole slice
// classes read.

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `posthog-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads).
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
