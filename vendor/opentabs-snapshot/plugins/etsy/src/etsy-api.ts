// Hermetic transport-helper stub for the vendored etsy metadata slice.
//
// Upstream etsy-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// Etsy web app on www.etsy.com. The importer NEVER executes a handle() body
// (Wall 1), but the tool modules reference `api` in their (never-run) handle
// closures, so the symbol must RESOLVE at module-eval time. This stub provides
// inert no-op implementations that throw if ever actually called -- they never are
// during a metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing these helpers. The upstream verb
// facts (preserved here as comments for auditability): Etsy searches the handmade/
// vintage marketplace listings + a single listing detail + the user's orders via
// `api` (default GET, reads); ADDING to the cart POSTs the item (add_to_cart -> a
// WRITE, {method:'POST'}); CHECKING OUT POSTs the cart for payment (checkout -> the
// PAYMENT WRITE; the {method:'POST'} literal reinforces write on both axes -- a
// checkout charges the saved payment method). www.etsy.com is SENSITIVE (39-01) ->
// posture-B re-gates the writes, and backing:'dom' keeps checkout DOM-only (NOT
// API-invocable -> the payment-op guard passes).

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `etsy-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads); POST for writes
// (add_to_cart / the checkout payment op carry an explicit {method:'POST'}).
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
