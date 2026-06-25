// Hermetic OpenTabs SDK stub (Wall-1 hardening; RESEARCH Alternatives).
//
// The real @opentabs-dev/plugin-sdk index re-exports dom.js / fetch.js /
// storage.js -- DOM + fetch transitive surface FSB must never drag into the
// build-time importer's import graph. This stub provides ONLY the two symbols a
// vendored plugin's metadata module references at module-eval time:
//   - defineTool: an identity factory (the real one is `(config) => config`)
//   - OpenTabsPlugin: an abstract base the plugin class extends
// The importer reads .name/.description/.input/.group/.summary only and NEVER
// executes a handle() body, so no fetch/document code runs in node.
//
// @opentabs-dev/plugin-sdk remains a pinned devDependency (lockfile + Wall-1
// audit), but the vendored netlify source imports defineTool/OpenTabsPlugin from
// THIS local stub so import() stays hermetic.

// A ToolDefinition carries metadata + a (never-executed) handle. The importer
// only consumes the metadata fields; `input`/`output` are zod schemas.
export interface ToolDefinition {
  name: string;
  displayName?: string;
  description?: string;
  summary?: string;
  icon?: string;
  group?: string;
  // biome-ignore lint/suspicious/noExplicitAny: metadata-only read; schema typing not needed at the import seam.
  input: any;
  // biome-ignore lint/suspicious/noExplicitAny: output is never read by the importer.
  output?: any;
  // biome-ignore lint/suspicious/noExplicitAny: handle is NEVER executed by the importer (Wall 1).
  handle?: (...args: any[]) => any;
}

// Identity factory -- mirrors the real SDK's `export const defineTool = (config) => config`.
export const defineTool = <T extends ToolDefinition>(config: T): T => config;

// Abstract base the plugin class extends. Carries only the declaration fields the
// importer reads off the instance (name, urlPatterns, tools).
export abstract class OpenTabsPlugin {
  abstract readonly name: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly urlPatterns?: string[];
  readonly homepage?: string;
  abstract readonly tools: ToolDefinition[];
}
