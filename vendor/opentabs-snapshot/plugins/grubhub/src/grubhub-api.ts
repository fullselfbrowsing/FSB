// Hermetic transport-helper stub for the vendored grubhub metadata slice.
//
// Upstream grubhub-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// Grubhub web app on www.grubhub.com. The importer NEVER executes a handle()
// body (Wall 1), but the tool modules reference `api` / `apiVoid` in their
// (never-run) handle closures, so these symbols must RESOLVE at module-eval time.
// This stub provides inert no-op implementations that throw if ever actually
// called -- they never are during a metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing these helpers. The upstream verb
// facts (preserved here as comments for auditability): Grubhub lists/searches
// restaurants + a restaurant's detail + the user's orders via `api` (default GET,
// reads); PLACING an order POSTs the cart (place_order -> the PAYMENT WRITE; the
// {method:'POST'} literal reinforces write on both axes -- a paid order is money
// moved); CANCELLING an order is the DESTRUCTIVE op (cancel_order -> apiVoid
// {method:'DELETE'} -> apiDelete/destructive). www.grubhub.com is SENSITIVE (39-01)
// -> posture-B re-gates the writes, and backing:'dom' keeps place_order DOM-only
// (NOT API-invocable -> the payment-op guard passes).

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `grubhub-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads); POST for writes.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

// `apiVoid` -- 204-No-Content helper, upstream default method POST; DELETE for the
// destructive cancel_order op.
export const apiVoid = async (_endpoint: string, _options: ApiOptions = {}): Promise<void> =>
  inert('apiVoid');

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
