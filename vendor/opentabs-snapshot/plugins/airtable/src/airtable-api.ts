// Hermetic transport-helper stub for the vendored airtable metadata slice.
//
// Upstream airtable-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// Airtable Web API. The importer NEVER executes a handle() body (Wall 1), but the
// tool modules reference `api` / `apiVoid` in their (never-run) handle closures, so
// these symbols must RESOLVE at module-eval time. This stub provides inert no-op
// implementations that throw if ever actually called -- they never are during a
// metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing these helpers. The upstream verb
// facts (preserved here as comments for auditability): Airtable is a REST app --
// `api` defaults to GET (reads: list_records, get_record) and is called with
// {method:'POST'} for create and {method:'PATCH'} for update; `apiVoid` is the
// destructive helper, called with {method:'DELETE'} for delete_record (DELETE +
// the delete_record override floor both class it destructive).

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `airtable-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads); POST/PATCH for writes.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

// `apiVoid` -- 204-No-Content helper, upstream default method POST; called with
// {method:'DELETE'} for the destructive delete_record op.
export const apiVoid = async (_endpoint: string, _options: ApiOptions = {}): Promise<void> =>
  inert('apiVoid');

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
