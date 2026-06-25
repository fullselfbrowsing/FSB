// Hermetic transport-helper stub for the vendored sentry metadata slice.
//
// Upstream sentry-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// Sentry REST API (https://sentry.io/api/0). The importer NEVER executes a handle()
// body (Wall 1), but the tool modules reference `api` in their (never-run) handle
// closures, so this symbol must RESOLVE at module-eval time. This stub provides
// inert no-op implementations that throw if ever actually called -- they never are
// during a metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing these helpers. The upstream verb
// facts (preserved here as comments for auditability): Sentry is a REST app --
// `api` defaults to GET (reads: list_issues / get_issue / list_projects) and is
// called with {method:'PUT'} to update an issue's status to resolved. `resolve` is
// NOT in the shared side-effect verb sets, so resolve_issue relies on the
// {method:'PUT'} literal (methodClass PUT -> write) to floor it to write -- do NOT
// add `resolve` to the shared side-effect-class.mjs verb sets.

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `sentry-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads); PUT for resolve.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
