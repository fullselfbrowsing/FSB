// Hermetic transport-helper stub for the vendored discord metadata slice.
//
// Upstream discord-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// Discord web app on discord.com (the Discord REST v9 surface). The importer NEVER
// executes a handle() body (Wall 1), but the tool modules reference `api` / `apiVoid`
// in their (never-run) handle closures, so these symbols must RESOLVE at module-eval
// time. This stub provides inert no-op implementations that throw if ever actually
// called -- they never are during a metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing these helpers. The upstream verb
// facts (preserved here as comments for auditability): Discord lists channels + a
// channel's messages via `api` (default GET, reads); sending a message POSTs to the
// channel (send_message -> the sensitive messaging WRITE; `send` is in the shared
// WRITE_VERBS set and the {method:'POST'} literal reinforces write); deleting a
// message is the DESTRUCTIVE op (delete_message -> apiVoid {method:'DELETE'} ->
// apiDelete/destructive). discord.com is SENSITIVE -> posture-B re-gates the writes.

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `discord-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads); POST for writes.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

// `apiVoid` -- 204-No-Content helper, upstream default method POST; DELETE for the
// destructive delete_message op.
export const apiVoid = async (_endpoint: string, _options: ApiOptions = {}): Promise<void> =>
  inert('apiVoid');

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
