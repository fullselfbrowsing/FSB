// Hermetic transport-helper stub for the vendored expedia metadata slice.
//
// Upstream expedia-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// Expedia web app on www.expedia.com. The importer NEVER executes a handle()
// body (Wall 1), but the tool modules reference `api` in their (never-run) handle
// closures, so this symbol must RESOLVE at module-eval time. This stub provides an
// inert no-op implementation that throws if ever actually called -- it never is
// during a metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing these helpers. The upstream verb
// facts (preserved here as comments for auditability): Expedia searches flights +
// hotels + the user's trips via `api` (default GET, reads); BOOKING a flight or a
// hotel POSTs the itinerary (book_flight / book_hotel -> the PAYMENT WRITES; the
// {method:'POST'} literal reinforces write on both axes -- a booked flight/hotel
// charges a card). www.expedia.com is SENSITIVE (39-01) -> posture-B re-gates the
// writes, and backing:'dom' keeps book_flight/book_hotel DOM-only (NOT API-invocable
// -> the payment-op guard passes). This slice has no apiVoid (no destructive op).

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `expedia-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads); POST for the booking writes.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
