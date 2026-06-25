// Hermetic transport-helper stub for the vendored eventbrite metadata slice.
//
// Upstream eventbrite-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// Eventbrite web app on www.eventbrite.com. The importer NEVER executes a handle()
// body (Wall 1), but the tool modules reference `api` in their (never-run) handle
// closures, so this symbol must RESOLVE at module-eval time. This stub provides an
// inert no-op implementation that throws if ever actually called -- it never is
// during a metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing this helper. The upstream verb
// facts (preserved here as comments for auditability): Eventbrite searches events + an
// event's detail + the user's orders via `api` (default GET, reads); REGISTERING for
// an event POSTs the order (register_for_event -> the PAYMENT op for paid events; the
// {method:'POST'} literal classes it write -- 'register' is NOT a side-effect
// WRITE_VERB, so the POST is REQUIRED; a paid registration moves money). www.eventbrite.com
// is SENSITIVE (39-05, the payment axis) -> posture-B re-gates the write, and
// backing:'dom' keeps register_for_event DOM-only (NOT API-invocable -> the payment-op
// guard passes via DOM-only-on-sensitive).

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `eventbrite-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads); POST for the register write.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
