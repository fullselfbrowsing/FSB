// Hermetic transport-helper stub for the vendored chipotle metadata slice.
//
// Upstream chipotle-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// Chipotle web app on www.chipotle.com. The importer NEVER executes a handle() body
// (Wall 1), but the tool modules reference `api` in their (never-run) handle closures,
// so this symbol must RESOLVE at module-eval time. This stub provides an inert no-op
// implementation that throws if ever actually called -- it never is during a
// metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing this helper. The upstream verb facts
// (preserved here as comments for auditability): Chipotle lists nearby locations + a
// location's menu + the user's orders via `api` (default GET, reads); PLACING an order
// POSTs the cart (place_order -> the PAYMENT WRITE; the {method:'POST'} literal classes
// it write -- 'place' is NOT a side-effect WRITE_VERB, so the POST is what classes it
// write, AND 'place' is in 39-01 PAYMENT_VERBS + place_order in PAYMENT_OP_NAMES -- a
// placed order charges the saved card). www.chipotle.com is SENSITIVE (39-01) ->
// posture-B re-gates the writes, and backing:'dom' keeps place_order DOM-only (NOT
// API-invocable -> the payment-op guard passes).

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `chipotle-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads); POST for the place_order write.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
