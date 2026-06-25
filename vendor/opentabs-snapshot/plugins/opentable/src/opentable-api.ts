// Hermetic transport-helper stub for the vendored opentable metadata slice.
//
// Upstream opentable-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// OpenTable web app on www.opentable.com. The importer NEVER executes a handle()
// body (Wall 1), but the tool modules reference `api` / `apiVoid` in their
// (never-run) handle closures, so these symbols must RESOLVE at module-eval time.
// This stub provides inert no-op implementations that throw if ever actually
// called -- they never are during a metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing these helpers. The upstream verb
// facts (preserved here as comments for auditability): OpenTable searches restaurants
// + a restaurant's detail + the user's reservations via `api` (default GET, reads);
// RESERVING a table POSTs the reservation (reserve_table -> the PAYMENT op; the
// {method:'POST'} literal reinforces write on both axes -- an OpenTable reservation
// holds a card); CANCELLING a reservation is the DESTRUCTIVE op (cancel_reservation ->
// apiVoid {method:'DELETE'} -> apiDelete/destructive). www.opentable.com is
// SENSITIVE UNCONDITIONALLY (39-01, held-card) -> posture-B re-gates the writes, and
// backing:'dom' keeps reserve_table DOM-only (NOT API-invocable -> the payment-op
// guard passes via DOM-only-on-sensitive).

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `opentable-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads); POST for the reserve write.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

// `apiVoid` -- 204-No-Content helper, upstream default method POST; DELETE for the
// destructive cancel_reservation op.
export const apiVoid = async (_endpoint: string, _options: ApiOptions = {}): Promise<void> =>
  inert('apiVoid');

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
