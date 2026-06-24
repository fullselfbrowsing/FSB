// Hermetic transport-helper stub for the vendored linear metadata slice.
//
// Upstream linear-api.ts (SHA 4b170216) imports the real SDK's GraphQL transport
// (a `graphql(query, variables)` helper that POSTs to https://api.linear.app/graphql
// from the page session). The importer NEVER executes a handle() body (Wall 1), but
// the tool modules reference `graphql` in their (never-run) handle closures, so this
// symbol must RESOLVE at module-eval time. This stub provides an inert no-op that
// throws if ever actually called -- it never is during a metadata-only import.
//
// The TRANSPORT SIGNAL the importer's side-effect inference uses is the transport
// HELPER NAME (`graphql` -> matches GRAPHQL_TRANSPORT_RE in
// scripts/lib/side-effect-class.mjs -> the GraphQL/RPC carve-out fires: the HTTP
// method is uninformative/always-POST, so the op-name VERB decides and an ambiguous
// GraphQL op fails safe to write) PLUS the op-name verb -- NOT executing this helper.
// The upstream operation verb facts (preserved here as comments for auditability):
//   create_issue  -> graphql `issueCreate` mutation   (write)
//   update_issue  -> graphql `issueUpdate` mutation   (write)
//   create_comment-> graphql `commentCreate` mutation (write)
//   list_issues   -> graphql `issues` query           (read)
//   get_issue     -> graphql `issue` query            (read)

const inert = (helper: string): never => {
  throw new Error(
    `linear-api stub: ${helper} is metadata-only and must never execute at ` +
      'import time (Wall 1 -- the importer reads .input/.name only).'
  );
};

// `graphql` -- the Linear GraphQL transport. ALWAYS POSTs (the method is
// uninformative); the op-name verb classifies the side effect. Inert -- never run.
// biome-ignore lint/suspicious/noExplicitAny: inert stub, never executed.
export const graphql = async <T>(_query: string, _variables: Record<string, unknown> = {}): Promise<T> =>
  inert('graphql') as unknown as Promise<T>;

export const isAuthenticated = (): boolean => false;
export const waitForAuth = async (): Promise<boolean> => false;
