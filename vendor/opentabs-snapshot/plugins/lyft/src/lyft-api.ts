// Hermetic transport-helper stub for the vendored lyft metadata slice.
//
// Upstream lyft-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// Lyft web app on *.lyft.com. The importer NEVER executes a handle() body (Wall 1),
// but the tool modules reference `api` / `apiVoid` in their (never-run) handle
// closures, so these symbols must RESOLVE at module-eval time. This stub provides
// inert no-op implementations that throw if ever actually called -- they never are
// during a metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing these helpers. The upstream verb
// facts (preserved here as comments for auditability): Lyft lists ride types + a fare
// estimate + the user's rides via `api` (default GET, reads); REQUESTING a ride POSTs
// the booking (request_ride -> the PAYMENT WRITE; the {method:'POST'} literal
// reinforces write on both axes -- a requested ride charges a card); CANCELLING a
// ride is the DESTRUCTIVE op (cancel_ride -> apiVoid {method:'DELETE'} ->
// apiDelete/destructive). *.lyft.com is SENSITIVE (39-01) -> posture-B re-gates the
// writes, and backing:'dom' keeps request_ride DOM-only (NOT API-invocable -> the
// payment-op guard passes).

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `lyft-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads); POST for writes.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

// `apiVoid` -- 204-No-Content helper, upstream default method POST; DELETE for the
// destructive cancel_ride op.
export const apiVoid = async (_endpoint: string, _options: ApiOptions = {}): Promise<void> =>
  inert('apiVoid');

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
