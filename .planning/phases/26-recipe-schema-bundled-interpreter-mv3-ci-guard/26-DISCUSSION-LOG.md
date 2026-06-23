# Phase 26: Recipe Schema + Bundled Interpreter + MV3 CI Guard - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the analysis.

**Date:** 2026-06-19
**Phase:** 26-recipe-schema-bundled-interpreter-mv3-ci-guard
**Mode:** assumptions
**Areas analyzed:** Library Integration Path; Recipe Schema Vocabulary + Interpreter Phase-26 Scope; CI-Guard Mechanism + Typed Errors; Test Strategy

## Assumptions Presented

### Library Integration Path
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| PATH A — vendor minisearch/jmespath/@cfworker into `extension/lib/` as global UMD/IIFE via `importScripts`, like `lz-string` | Likely | `background.js:97`; `ws-client.js:98-99`; STACK.md Integration Points |
| `@cfworker/json-schema` (ESM/CJS) needs a one-off `esbuild --format=iife` bundle; minisearch/jmespath vendor as-is | Likely | empirical: raw-ESM fails `validate-extension.mjs` `node --check` over `lib/` |
| `url-template` OUT for v1 (hand-rolled `{var}` replacer) | Likely | STACK.md "use url-template only if RFC 6570 needed" |

### Recipe Schema Vocabulary + Interpreter Phase-26 Scope
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Versioned JSON object, closed top-level vocab (schemaVersion/id/origin/endpoint/method/authStrategy/params/request/extract); no script-like fields | Likely | STACK.md answer (b); PITFALLS Wall-1 forbidden-field list |
| authStrategy v1 enum: same-origin-cookie, csrf-header-scrape, bearer-from-storage, none | Likely | STACK.md auth-strategy enum; (persisted-query-hash/Slack split flagged open) |
| Pagination OUT of v1 | Likely | SUMMARY Research Flags; no requirement behind it |
| Phase 26 interpreter validates + binds → bound request spec; does NOT fetch (Phase 27 owns MAIN-world fetch + CSRF scrape) | Likely | CAP-02 vs FETCH-01/02 split; ROADMAP Phase 27 SC-1 |

### CI-Guard Mechanism + Typed Errors
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| New Node static guard: grep recipe-path allowlist for eval/new Function/import( + schema accept/reject fixtures | Likely | `validate-extension.mjs` precedent; `lint` is a no-op stub |
| "Recipe path" = explicit file allowlist, NOT whole-tree (avoid false-positive on sanctioned `execute_js`) | Likely | `tool-executor.js:382` / `mcp-bridge-client.js:915` use `new Function` in MAIN world |
| Hook into `validate:extension` → ci.yml `extension` job → `all-green` | Likely | ci.yml job order; `needs:[extension,mcp-smoke,website]` |
| Typed errors `RECIPE_SCHEMA_INVALID`/`RECIPE_UNKNOWN_FIELD`/`RECIPE_OPCODE_INVALID` via `errors.ts` (TRIGGER_* pattern) | Likely | `errors.ts:104-124`; `mcp-tool-dispatcher.js:1063` |

### Test Strategy
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Plain CommonJS `node tests/*.test.js` appended to `npm test` chain; no framework; schema accept/reject + interpreter binding + guard self-test | Confident | `tests/trigger-store.test.js`; root `package.json` `scripts.test` `&&`-chain; STACK.md Dev Tools |

## Corrections Made

No corrections — the user confirmed all assumptions ("yes" to the present_assumptions gate).

## Open Design Calls (carried to plan-time spike, not corrections)

- Precise v1 `authStrategy` enum membership — whether `persisted-query-hash` / Slack-style split-token strategies join v1 now or defer to the Phase 29 bundled-handler head. SUMMARY flags the recipe schema as "the highest-risk design artifact … needs a dedicated schema-design + RHC-line spike."
- Standalone guard script vs extending `validate-extension.mjs` in place — left to planner discretion.

## External Research

None performed — the on-disk 2026-06-19 milestone research (STACK / PITFALLS / ARCHITECTURE / SUMMARY) plus verified source anchors covered every gray area; the analyzer flagged no external-research gaps.
