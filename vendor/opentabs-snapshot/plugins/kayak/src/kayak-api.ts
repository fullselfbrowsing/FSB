// Hermetic transport-helper stub for the vendored kayak metadata slice.
//
// Upstream kayak-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// KAYAK web app on www.kayak.com. The importer NEVER executes a handle()
// body (Wall 1), but the tool modules reference `api` in their (never-run) handle
// closures, so this symbol must RESOLVE at module-eval time. This stub provides an
// inert no-op implementation that throws if ever actually called -- it never is
// during a metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing these helpers. The upstream verb
// facts (preserved here as comments for auditability): KAYAK is a META-SEARCH app --
// it searches flights + hotels + reads a saved price alert via `api` (default GET,
// reads); CREATING a price alert POSTs a price-watch (create_price_alert -> a BENIGN
// WRITE: 'create' is a side-effect WRITE_VERB AND the {method:'POST'} literal classes
// it write, but 'create' is NOT a PAYMENT_VERB and 'create_price_alert' is NOT a
// PAYMENT_OP_NAME -> it is NOT a payment op for the guard; no card is charged).
// www.kayak.com is SENSITIVE (39-01) -> posture-B re-gates the write, and backing:'dom'
// keeps it DOM-only. This slice has no apiVoid (no destructive op).

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `kayak-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads); POST for the price-alert write.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
