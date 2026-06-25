// Hermetic transport-helper stub for the vendored reddit metadata slice.
//
// Upstream reddit-api.ts (SHA 4b170216) imports the real SDK's fetchJSON /
// fetchFromPage / storage helpers and reads document/localStorage against the
// Reddit web app on reddit.com (the Reddit JSON read API). The importer NEVER
// executes a handle() body (Wall 1), but the tool modules reference `api` in their
// (never-run) handle closures, so the symbol must RESOLVE at module-eval time. This
// stub provides inert no-op implementations that throw if ever actually called --
// they never are during a metadata-only import.
//
// The TRANSPORT SIGNALS the importer's side-effect inference uses are derived from
// the op NAME verb + the descriptor's stamped transport metadata (the helper name +
// any {method:'...'} literal), NOT from executing these helpers. The upstream verb
// facts (preserved here as comments for auditability): Reddit lists a subreddit's
// posts, fetches a single post + comments, and searches posts -- ALL via `api` with
// the explicit {method:'GET'} literal (reads). reddit.com is the SAFE content tier
// (NOT sensitive), so these reads run under Auto. This slice carries NO write op
// (submit/comment/vote are out of scope); `apiVoid` is intentionally NOT exported
// because no op here mutates -- adding a reddit write would require reclassifying
// reddit.com sensitive so its writes are posture-B gated.

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const inert = (helper: string): never => {
  throw new Error(
    `reddit-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `api` -- generic helper, upstream default method GET (reads). Every reddit op here
// is a read and passes the explicit {method:'GET'} literal.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const api = async <T>(_endpoint: string, _options: ApiOptions = {}): Promise<T> =>
  inert('api') as unknown as Promise<T>;

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
