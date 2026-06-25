// Hermetic transport-helper stub for the vendored confluence metadata slice.
//
// Upstream confluence-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// Confluence Cloud REST API. The importer NEVER executes a handle() body (Wall 1),
// but the tool modules reference `api` / `apiVoid` in their (never-run) handle
// closures, so these symbols must RESOLVE at module-eval time. This stub provides
// inert no-op implementations that throw if ever actually called -- they never are
// during a metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing these helpers. The upstream verb
// facts (preserved here as comments for auditability): Confluence Cloud is a REST
// app -- `api` defaults to GET (reads: get_page, search_pages) and is called with
// {method:'POST'} for create and {method:'PUT'} for update.

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `confluence-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads); POST/PUT for writes.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

// `apiVoid` -- 204-No-Content helper, upstream default method POST; DELETE for
// destructive ops. Confluence's vendored slice exposes no destructive op this sub-batch.
export const apiVoid = async (_endpoint: string, _options: ApiOptions = {}): Promise<void> =>
  inert('apiVoid');

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
