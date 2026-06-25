// Hermetic transport-helper stub for the vendored craigslist metadata slice.
//
// Upstream craigslist-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// Craigslist web app on www.craigslist.org. The importer NEVER executes a handle()
// body (Wall 1), but the tool modules reference `api` / `apiVoid` in their (never-run)
// handle closures, so these symbols must RESOLVE at module-eval time. This stub
// provides inert no-op implementations that throw if ever actually called -- they
// never are during a metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing these helpers. The upstream verb
// facts (preserved here as comments for auditability): Craigslist searches classified
// listings + a single listing detail via `api` (default GET, reads); POSTING a listing
// PUTs/POSTs a new classified ad (post_listing -> a WRITE via the {method:'POST'}
// literal; NOTE post_listing is NOT a payment op -- 'post' is not a payment verb and
// 'post_listing' is not a payment op-name -- but craigslist is SENSITIVE so the write
// is posture-B gated regardless); DELETING a listing is the DESTRUCTIVE op
// (delete_listing -> apiVoid {method:'DELETE'} -> apiDelete/destructive).
// www.craigslist.org (and the apex craigslist.org, after the 39-06 apex-suffix
// widening) is SENSITIVE -> posture-B re-gates the writes, and backing:'dom' keeps the
// write DOM-only (the payment-op guard never keys on post_listing -- no payment verb).

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `craigslist-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads); POST for the post_listing write.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

// `apiVoid` -- 204-No-Content helper, upstream default method POST; DELETE for the
// destructive delete_listing op.
export const apiVoid = async (_endpoint: string, _options: ApiOptions = {}): Promise<void> =>
  inert('apiVoid');

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
