// Hermetic transport-helper stub for the vendored asana metadata slice.
//
// Upstream asana-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage. The importer
// NEVER executes a handle() body (Wall 1), but the tool modules reference `api` /
// `apiVoid` in their (never-run) handle closures, so these symbols must RESOLVE at
// module-eval time. This stub provides inert no-op implementations that throw if
// ever actually called -- they never are during a metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the {method:'...'} literal in the tool source, NOT from
// executing these helpers. The upstream verb facts (preserved here as comments for
// auditability): `api` is the generic REST helper -- GET for reads (list/get),
// {method:'POST'} for create, {method:'PUT'} for update; `apiVoid` is the
// 204-No-Content helper (default POST; DELETE for destructive ops).

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `asana-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads); POST/PUT for writes.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

// `apiVoid` -- 204-No-Content helper, upstream default method POST; DELETE for
// destructive ops.
export const apiVoid = async (_endpoint: string, _options: ApiOptions = {}): Promise<void> =>
  inert('apiVoid');

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
