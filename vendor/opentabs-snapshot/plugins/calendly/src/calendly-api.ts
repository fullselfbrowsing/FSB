// Hermetic transport-helper stub for the vendored calendly metadata slice.
//
// Upstream calendly-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// Calendly web app on calendly.com. The importer NEVER executes a handle() body (Wall
// 1), but the tool modules reference `api` in their (never-run) handle closures, so
// this symbol must RESOLVE at module-eval time. This stub provides an inert no-op
// implementation that throws if ever actually called -- it never is during a
// metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing this helper. The upstream verb
// facts (preserved here as comments for auditability): Calendly lists the user's event
// types + an event type's availability + the user's scheduled events ALL via `api`
// (default GET -- every op is a READ). There is NO write op (no apiVoid, no
// {method:'POST'}) and NO payment-verb op-name (list/get only) -- booking a slot is the
// INVITEE flow, out of scope. calendly.com is left SAFE (read-only scheduling app); it
// is in READ_ONLY_SAFE_SERVICES (the 38 MED-02 guard) so a future write op would FAIL
// the build -- and because no op carries a payment verb, the payment-op guard never
// keys on calendly.

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `calendly-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET. EVERY calendly op is a read (no POST).
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
