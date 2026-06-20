# Phase 27: Authenticated Fetch Primitive (MAIN-world) + Origin-Pin + Resume-Sidecar - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in 27-CONTEXT.md — this log preserves the analysis.

**Date:** 2026-06-20
**Phase:** 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
**Mode:** assumptions (--auto)
**Areas analyzed:** Fetch primitive location & module shape; CSRF live-scrape & extract; Origin-pin enforcement; SW-eviction survival & mid-mutation ambiguity; Hardcoded proof recipe & smoke test

## Assumptions Presented

### Fetch primitive location & module shape (FETCH-01)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| NEW `extension/utils/capability-fetch.js` (dual-export IIFE) exports `capabilityFetchInPage` (self-contained `func` for `executeScript({world:'MAIN'})`) + SW-side `executeBoundSpec(spec, tabId)` wrapper; recipe supplies only data spec | Confident (file/home) / Likely (internal split) | `ARCHITECTURE.md:198,229-247`; `capability-interpreter.js:305-323`; seam `tool-executor.js:382-394`, `mcp-bridge-client.js:915-937` |
| HARD: `capability-fetch.js` must be on `RECIPE_PATH_ALLOWLIST` + zero `eval`/`new Function`/`import(`; Check 4 fails CI closed if absent | Confident | `scripts/verify-recipe-path-guard.mjs:84-87,248-281` |
| In-page `func` is serialization-safe (stringified+re-parsed in page; no closure/global/helper refs) | Confident | `executeScript` semantics; seam `tool-executor.js:382-394` |

### CSRF live-scrape & read-only extract (FETCH-02)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| `csrfSource` descriptor consumed in-page before the request; scraped value threaded into `headers[csrfSource.header]` | Confident | `capability-recipe-schema.js:131-142`; `capability-auth-strategies.js:75-82`; `ARCHITECTURE.md:148` |
| `from:'response'` (prior GET) OUT of v1; deferred to Phase 29 | Confident | Doubles in-page surface + needs own pin |
| `extract` (JMESPath) runs SW-side via vendored `jmespath` global; in-page func returns parsed JSON (size-capped) | **Unclear -> auto-resolved (recommended: SW-side)** | `capability-interpreter.js:36-38,76-78,314`; in-page func cannot see `jmespath` global (D-03) |

### Origin-pin enforcement (FETCH-03)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Pin enforced at TWO points: interpreter re-asserts `new URL(spec.url,recipe.origin).origin===recipe.origin`; fetch wrapper asserts active-tab origin === spec.origin | Confident (interpreter) / Likely (tab-origin check) | `capability-recipe-schema.js:99-102`; `capability-interpreter.js:128-129`; `ARCHITECTURE.md:233`; `PITFALLS.md:358,165-166` |
| `spec.query` must be folded into URL BEFORE the pin check (currently built-but-unappended) | Confident | `capability-interpreter.js:300-312` |

### SW-eviction survival & mid-mutation ambiguity (FETCH-04)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Wrap invoke in `run_task` resume-sidecar (`mcp-task-store.js`): write `BEFORE_API_REQUEST` snapshot before executeScript; terminal write+delete on success | Confident | `mcp-task-store.js:20-31,128-167`; `mcp-bridge-client.js:1319-1433`; `PITFALLS.md:299-310` |
| Mutating method after eviction -> `RECOVERY_AMBIGUOUS`, surfaced, never blind-retried; GET may re-issue; reuse Lattice taxonomy | Confident (split) / Likely (code name) | `lattice-runtime-adapter.js:263-295` |
| Add `RECOVERY_AMBIGUOUS` to `mcp/src/errors.ts` verbatim-passthrough; return dual `code`/`errorCode` | Likely | `mcp/src/errors.ts:54,100-125`; `capability-interpreter.js:85-93` |

### Hardcoded proof recipe & smoke test (FETCH-05)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Hardcoded `github.com` -> `GET /notifications`, `same-origin-cookie`, in `catalog/recipes/` | Confident (post external research) | OpenTabs `github-api.ts` archetype; `catalog/recipes/_fixtures/` exists |
| Assert `user-login` meta non-empty / 200-not-302; HttpOnly `_gh_sess`/`logged_in` cookies prove page-context value | Confident (post external research) | Live GitHub probes 2026-06-20 |
| CI-side: zero-framework `node tests/*.test.js` + stubbed `executeScript` recorder; live logged-in-shape assertion is human-gated UAT (`human_needed`) | Confident | `tests/capability-interpreter.test.js` convention |
| Reserve `POST /_graphql` `csrf-header-scrape` as the FETCH-02 exemplar (after FETCH-01 green) | Likely | OpenTabs `github-api.ts:152-237` |

## Corrections Made

No corrections — `--auto` mode; all assumptions were Confident or Likely except one Unclear item, auto-resolved below.

## Auto-Resolved

- **Where `extract` (JMESPath) runs:** auto-selected the recommended alternative — **run SW-side** (in-page func returns parsed JSON; SW runs the vendored `jmespath` global via `getFSBJmespath()`). Rationale: the in-page `func` is stringified into the page and cannot reach the `jmespath` global (D-03), and SW-side reuses the full engine instead of a hand-rolled subset. Recorded as D-07.

## External Research

- **FETCH-05 smoke-test target (which real HttpOnly-cookie site):** researched live (2026-06-20). Result: `github.com` -> `GET /notifications`, `authStrategy: same-origin-cookie`. Confirmed HttpOnly session cookies (`_gh_sess`, `logged_in`), a crisp logged-in (200 + non-empty `<meta name="user-login">`) vs logged-out (302 -> `/login`, empty meta) divergence, no CSRF on the GET, and a defensible personal/supervised/read-only ToS posture (GitHub AUP targets bulk scraping, not self-access). The OpenTabs `github-api.ts fetchFromPage` archetype the research cited was read directly and verified. A `POST /_graphql` `csrf-header-scrape` recipe is held in reserve as the FETCH-02 exemplar. Sources: OpenTabs repo (`plugins/github/src/github-api.ts`, `platform/plugin-sdk/src/fetch.ts`); GitHub AUP; live `curl` cookie/endpoint probes.
- **CI test structure (no-live-browser):** resolved from codebase evidence (no external research needed) — zero-framework `node tests/*.test.js` with mocked `chrome.*` + stubbed `executeScript`; live assertion human-gated as `human_needed`.
