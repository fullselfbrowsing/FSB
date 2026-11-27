---
phase: 71-comparative-gate-and-release
plan: 08
subsystem: release
tags: [version-sync, mcp-readme, compatibility, release-rehearsal, rel-01, rel-02, d-20, d-22]

# Dependency graph
requires:
  - phase: 71-comparative-gate-and-release (71-07)
    provides: the wave order; no code dependency
  - phase: 66.1 (66.1-03)
    provides: SETTING_UNSUPPORTED from extensions older than 1.0.0 (quoted in the 0.12.0 sentence)
  - phase: 69 (69-06)
    provides: expect_result uncertain / extension_unsupported from older extensions (quoted in the 0.12.0 sentence)
provides:
  - "scripts/lib/mcp-extension-compat.mjs: MCP_EXTENSION_COMPAT (0.11.2, 0.12.0), compatFor (exact entry, else highest same-minor entry, else throw), compatBullet, compatPairLine"
  - "scripts/sync-product-version.mjs: the README bullet and pair line come from the map; --check reads compatFor(mcp).minimum"
  - "tests/helpers/release-doc-parity.js: releaseDocParityChecks, the eight release-documentation rules shared by mcp-version-parity and the rehearsal"
  - "tests/release-version-rehearsal.test.js: the temp-root two-step rehearsal (REL-01-a, REL-02-a), registered in the root chain"
affects: [71-09, 71-12, V6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Declared data for a release claim: one frozen map in an importable pure module, read by the writer (setter template), the checker (--check) and the tests, so none of them can disagree"
    - "A release rehearsal that follows the repository's release state: steps not yet released are rehearsed in a temp root; released steps are checked on the repository's own documents"

key-files:
  created:
    - scripts/lib/mcp-extension-compat.mjs
    - tests/helpers/release-doc-parity.js
    - tests/release-version-rehearsal.test.js
  modified:
    - scripts/sync-product-version.mjs
    - tests/version-sync.test.js
    - tests/mcp-version-parity.test.js
    - package.json
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "The declared source (D-22, planner's choice) is a frozen map in scripts/lib/mcp-extension-compat.mjs, imported by the setter relative to its own file, so FSB_VERSION_SYNC_ROOT temp roots use the repository's map"
  - "compatFor follows the plan literally: an exact entry wins, otherwise the highest declared entry with the same major.minor; anything else, including a malformed version, throws the declared-source message"
  - "collectParityErrors reports an undeclared MCP version as a parity error ('MCP README compatibility pair: no declared extension compatibility ...') beside any other errors instead of aborting --check; the setters throw it and it reaches the version-sync: prefix"
  - "The rehearsal rehearses only steps the repository has not released (extension < 1.0.0 for step A, MCP < 0.12.0 for step B) and checks released steps on the repository documents, so the npm test runs in M-71-10 and M-71-11 step 5 stay green"

patterns-established:
  - "One helper per phrase set: tests/helpers/release-doc-parity.js is the only definition of the release-documentation phrases"

requirements-completed: [REL-01, REL-02]

# Metrics
duration: 12min
completed: 2026-10-19
---

# Phase 71 Plan 08: Per-Release MCP Compatibility and the Two-Step Release Rehearsal Summary

**The version setter now writes each MCP release's own declared minimum extension version from one frozen map. V6 step A (extension 1.0.0, MCP 0.11.2) therefore keeps "MCP 0.11.2 requires extension 0.9.92 or newer", and step B (MCP 0.12.0) says existing tools need 0.9.92 while `settings` and `expect` need 1.0.0. A temp-root rehearsal runs both steps end to end with the exact authored entries. Today's documents are byte-identical and no version string changed.**

## Performance

- **Duration:** about 12 min
- **Started:** 2026-10-19T03:04Z
- **Completed:** 2026-10-19T03:16Z
- **Tasks:** 2/2
- **Files:** 3 created, 5 modified, plus this SUMMARY

## Accomplishments

- **The step-A trap is closed (D-22).** Before this plan, `npm run version:set:extension -- 1.0.0` at MCP 0.11.2 would have rewritten `mcp/README.md` to say that MCP 0.11.2 requires extension 1.0.0, and `--check` would then have required that false sentence. Now the bullet, the pair line and the `--check` phrase all read `compatFor(mcpVersion)`.
- **Byte-identical today.** At 0.9.92 / 0.11.2, `npm run version:check` passes and `git diff --exit-code mcp/README.md README.md CHANGELOG.md mcp/CHANGELOG.md` is clean. `compatBullet('0.11.2')` and `compatPairLine('0.11.2')` equal the README lines character for character.
- **version-sync covers the new rule.** The existing nextPatch flow (extension 0.9.93, MCP 0.11.3) now asserts:
  - after the extension-only set, "MCP 0.11.2 requires extension 0.9.92 or newer", with no "requires extension 0.9.93";
  - after the MCP set, "MCP 0.11.3 requires extension 0.9.92 or newer", the inherited minimum;
  - `mcp 0.99.0` is refused with `version-sync: no declared extension compatibility for MCP 0.99.0; add it to scripts/lib/mcp-extension-compat.mjs`, and nothing is written.
- **The rehearsal (D-20)** proves both V6 steps in a temp root and checks every repository target's sha256 before and after. It also re-runs itself on the temp state after step A and after step B, which are the states the real V6 `npm test` runs will see.
- **One phrase set.** `tests/mcp-version-parity.test.js` and the rehearsal both use `releaseDocParityChecks`. The parity test still prints the same 202 PASS messages.

## Task Commits

1. **Task 1: Declared per-MCP-version compatibility feeding the setter templates and the check:** `3427c152` (fix)
2. **Task 2: Shared release-document parity helper and the two-step temp-root rehearsal:** `1181ca10` (test)

## The compat entries (`MCP_EXTENSION_COMPAT`)

| MCP | minimum | feature | Bullet (`compatBullet`) | Pair line (`compatPairLine`) |
| --- | --- | --- | --- | --- |
| `0.11.2` | `0.9.92` | none | `- **Compatibility:** \`fsb-mcp-server\` 0.11.2 requires FSB extension 0.9.92 or newer for \`mcp:task-status\`. Upgrade the extension and restart the MCP host together.` | `Compatibility for this release: MCP 0.11.2 requires extension 0.9.92 or newer for the \`mcp:task-status\` route used by \`complete_task\`, \`partial_task\`, and \`fail_task\`. Existing \`0.10.0\` tool routes remain additive and unchanged.` |
| `0.12.0` | `0.9.92` | `{version:'1.0.0', names:['settings','expect']}` | `- **Compatibility:** \`fsb-mcp-server\` 0.12.0 requires FSB extension 0.9.92 or newer for existing tools; \`settings\` and the optional \`expect\` need FSB extension 1.0.0 or newer. Upgrade the extension and restart the MCP host together.` | `Compatibility for this release: MCP 0.12.0 requires extension 0.9.92 or newer for existing tools. \`settings\` and the optional \`expect\` need extension 1.0.0 or newer; older extensions answer \`SETTING_UNSUPPORTED\` and report \`expect_result\` as \`uncertain\` with \`extension_unsupported\`. Existing tool routes remain additive and unchanged.` |

**Lookup.** `compatFor('0.11.3')` returns the 0.11.2 entry and `compatFor('0.12.4')` returns the 0.12.0 entry, by identity. `compatFor('0.13.0')` throws `no declared extension compatibility for MCP 0.13.0; add it to scripts/lib/mcp-extension-compat.mjs`.

**Module safeguards.** At load, the module rejects an entry whose sentence parts contain `$` or a newline (the setter passes them to `String.prototype.replace` and writes single lines), and an entry with a malformed version.

**The versioning-policy line** ("The MCP package has its own version (`<mcp>`) because it is published independently from the extension release (`<ext>`)") still uses the current extension version, as the plan requires.

## The rehearsal's fixture texts

### Step A (from extension 0.9.92 / MCP 0.11.2)

1. **Refusal.** `extension 1.0.0` exits 1 with `author the 1.0.0 entry at the top of CHANGELOG.md`, and no target changes.
2. **The authored entry.** It is inserted above the first `## vX.Y.Z` heading:

   ```
   ## v1.0.0 — Fixture Jev Fast Mode — 2026-11-01

   The extension, showcase, skill, documentation, and store metadata align at `1.0.0`. The independently versioned `fsb-mcp-server` stays at `0.11.2`.

   Fixture release notes.
   ```

   The "stays at" version is the source's current MCP version, so the step still works if `main` publishes another MCP patch first (D-21).
3. **The setter runs; `--check` still fails.** The setter exits 0 and leaves `CHANGELOG.md` byte-identical. `--check` then exits 1, and its only error is `- extension changelog current-version summary: missing "The extension version is \`1.0.0\`"`.
4. **The header line.** After it is set to "The extension version is `1.0.0`", `--check` exits 0 and the parity helper passes for 1.0.0 / 0.11.2.
5. **The README.** It contains "MCP 0.11.2 requires extension 0.9.92 or newer" and both 0.11.2 sentences. It contains neither "requires extension 1.0.0" nor "requires FSB extension 1.0.0".

### Step B (same temp root, from extension 1.0.0 / MCP 0.11.2)

1. **Refusal.** `mcp 0.12.0` exits 1 with `author the 0.12.0 entry at the top of mcp/CHANGELOG.md`, and no target changes.
2. **The MCP changelog entry.** It is inserted above the first anchor:

   ```
   <a id="v0.12.0"></a>

   ## 0.12.0 (2026-11-15)

   Fixture minor release adding the `settings` tool and the optional `expect` parameter.

   - Merging this release into `main` publishes `fsb-mcp-server@0.12.0`.
   ```

3. **A copied bullet fails (Pitfall 5).** This README section is placed above `### What's New In v0.11.2`:

   ```
   ### What's New In v0.12.0

   - Fixture notes: the `settings` tool and the optional `expect` parameter.
   - **Compatibility:** <the existing bullet line>
   ```

   With the bullet copied rather than moved, the setter exits 1 with `mcp/README.md: expected exactly one MCP README current compatibility summary; found 2` and writes nothing.
4. **The moved bullet.** The same section, with the bullet removed from the v0.11.2 section.
5. **The MCP-only paragraph.** It goes after the first paragraph of the v1.0.0 section: "MCP-only update (2026-11-15): the package advances to `0.12.0` for the `settings` tool and the optional `expect` parameter." Before it is written, the helper's product-changelog rule fails for 0.12.0.
6. **The setter runs.** It exits 0, and the README shows the result:
   - the headings start `v0.12.0, v0.11.2`;
   - the 0.12.0 bullet sits inside the new section;
   - the pair line equals `compatPairLine('0.12.0')`, so it says "MCP 0.12.0 requires extension 0.9.92 or newer" and names `settings` and `expect` needing extension 1.0.0;
   - no "MCP 0.12.0 requires extension 1.0.0" appears.
7. **The checks pass.** `--check` exits 0, and the parity helper passes for 1.0.0 / 0.12.0.

### Released states (the V6 `npm test` runs)

| Source state | Step A | Step B |
| --- | --- | --- |
| extension 0.9.92 / MCP 0.11.2 (today) | rehearsed | rehearsed |
| extension 1.0.0 / MCP 0.11.2 (after M-71-10) | released: parity and both 0.11.2 sentences checked on the source | rehearsed from the released state |
| extension 1.0.0 / MCP 0.12.0 (after M-71-11) | released | released: parity and both 0.12.0 sentences checked on the source |

The suite runs the second and third rows itself on its temp snapshots, so all three states are proven on every run. It finishes in about 1 s on Node 24 and on Node 20.

## Decisions Made

- **The declared source is a map in a small pure ESM module** (CONTEXT "Claude's Discretion", D-22). The setter imports it relative to its own file, and the CJS tests load it with `await import(pathToFileURL(...).href)` because Node 20 cannot `require()` ESM.
- **An undeclared MCP version is reported, not crashed.** `collectParityErrors` lists it as a parity error. Both setters throw it before any write.
- **The helper validates its inputs.** `releaseDocParityChecks` throws a `TypeError` on any missing or empty input. A missing `compatMinimum` therefore can never turn into a check for "requires extension undefined".
- **The rehearsal follows the repository's release state** (see Deviations).

## Deviations from Plan

### Auto-added (Rule 2: missing critical functionality)

**1. The rehearsal stays green after the real bumps it rehearses**
- **Found during:** Task 2.
- **Issue:** M-71-10 step 5 runs `npm test` right after `version:set:extension -- 1.0.0`, and M-71-11 step 5 runs it right after `version:set:mcp -- 0.12.0`. A rehearsal hard-wired to the pre-release state copies a CHANGELOG that already has `## v1.0.0` first, expects `extension 1.0.0` to be refused, and fails. That would turn the V6 checklist red at the moment it is followed correctly.
- **Fix:** step A is rehearsed only while the source extension version is below 1.0.0, and step B only while the source MCP version is below 0.12.0. A released step is checked on the source's own documents: the parity helper plus the declared bullet and pair line. The suite re-runs itself on its post-step-A and post-step-B temp snapshots, which proves the V6 states.
- **Generalizations that follow:**
  - step A's "stays at" uses the current MCP version;
  - step B writes into the current product section of whichever extension version step A left.
- **Files:** `tests/release-version-rehearsal.test.js`.
- **Commit:** `1181ca10`.

### Other adjustments

- **One extra version-sync case:** an undeclared MCP minor (`mcp 0.99.0`, with a prepared changelog) is refused with the declared-source message and writes nothing. The temp changelog is restored afterwards (`3427c152`).
- **Message order in mcp-version-parity.** The eight release-documentation PASS lines now print together, so "current product changelog documents the independent extension and MCP releases" appears before the workflow-trigger lines instead of after them. The set of 202 messages is identical (diffed), and no test pins their order.
- **`extractLatestChangelogVersion` moved** from `tests/mcp-version-parity.test.js` into the helper (as `latestMcpChangelogVersion`). Line 294 was its only caller.

## TDD Gate Compliance

- **Task 1.** RED was observed: both tests failed with `ERR_MODULE_NOT_FOUND` for the missing module. GREEN followed. The plan names one commit per task, so RED and GREEN share `3427c152`.
- **Mutation proof.** Restoring the old `${extensionVersion}` pair template fails version-sync at the step-A assertion. Restoring the old bullet template fails the rehearsal. Removing the 0.12.0 entry fails the rehearsal with the declared-source error. Every mutant was reverted from a backup, and the tree matched HEAD afterwards.
- **Task 2.** The rehearsal passed on its first run, because Task 1 already gave the setter both steps, as the plan anticipated ("fix only test-side code"). The mutations above show it fails when the setter regresses.

## Verification

| Check | Result |
| --- | --- |
| `node tests/version-sync.test.js` (Node 24 and the official Node 20) | PASS |
| `node tests/mcp-version-parity.test.js` (Node 24 and Node 20) | 202 passed, 0 failed |
| `npm run version:check` | `version-check: extension 0.9.92; MCP 0.11.2` |
| `git diff --exit-code mcp/README.md README.md CHANGELOG.md mcp/CHANGELOG.md extension/manifest.json mcp/package.json` | clean |
| `node tests/release-version-rehearsal.test.js`, and `npx --offline -y node@20 tests/release-version-rehearsal.test.js` | PASS |
| `node tests/delegation-phase-contract.test.js` | 1253 passed, 0 failed |
| phase60, phase64 and phase65 full-tests harness suites | PASS |
| Sweep, Task 1: `--files scripts/sync-product-version.mjs --baseline 71-SWEEP-BASELINE.json` | 1/1, no new failures, exit 0 |
| Sweep, final: `--files scripts/sync-product-version.mjs scripts/lib/mcp-extension-compat.mjs --baseline ...` | 3/3, no new failures, exit 0 |
| The two `requires ... ${extensionVersion}` greps in the setter | 0 and 0 |
| `grep -c mcp-extension-compat` in the setter | 1 |
| Versions | `0.11.2 0.9.92` |
| The rehearsal in the root chain and in `REFINEMENT_ROOT_TEST_COMMANDS` | once each (the chain is now 347 commands) |
| `release-doc-parity` in the parity test and in the rehearsal | 1 and 1 |
| git calls in the rehearsal | 0 |

During the runs, port 7225 was held by a user `node` process (PID 7109), and nothing was bound to 7226. None of these suites touch either port. The crawler files were not touched.

## Known Stubs

None. The "Fixture …" strings in `tests/release-version-rehearsal.test.js` are temp-root fixture text, written by design and never into the repository.

## Threat Model Coverage

| Threat | Disposition | Where |
| --- | --- | --- |
| T-71-10 (release artifacts before V6) | mitigated | The rehearsal runs only in `mkdtemp` roots, removed in `finally`. Every repository target's sha256 is asserted unchanged after the suite. No version string changed in this plan. |
| T-71-10-b (false compatibility claim) | mitigated | One declared map feeds the template, `--check`, version-sync, mcp-version-parity and the rehearsal. Step A asserts that 0.11.2 never claims extension 1.0.0. Step B asserts that existing tools keep the 0.9.92 minimum. |
| T-71-SC (npm installs) | accepted | No package was added. |

No new network, auth, file-access or schema surface was added.

## Observations (no action taken)

- **The `chrome-extension.yml` path filter.** On `push` to `main` it lists `scripts/sync-product-version.mjs` but not `scripts/lib/mcp-extension-compat.mjs`. In practice this does not matter:
  - `ci.yml` runs on every pull request to `main`;
  - a new map entry always arrives with an MCP version change under `mcp/**`, which the filter does match.

  Workflows are out of scope for Phase 71, so the file was left unchanged.
- **New MCP minors need an entry first.** A future minor (0.13.0) needs a `MCP_EXTENSION_COMPAT` entry before `version:set:mcp` succeeds. That is intended: the setter refuses to invent a compatibility claim.

## Deferred to Validation Block

Nothing was waited on. This plan's suite serves the two V6 steps below. 71-VALIDATION.md M-71-10 and M-71-11 are authoritative; they are restated here.

### V6: M-71-10 (step A, the extension; MCP stays at 0.11.2)

1. The owner approves `scripts/bench/gate/decisions/core-gate-71.json`.
2. If the Jev path failed safety, run `fly secrets set JEV_ENABLED=false` and confirm that the gateway answers `disabled`.
3. Author the `CHANGELOG.md` `## v1.0.0 — … — <date>` entry from the "Release claims" sentences. It must say "align at `1.0.0`" and "stays at `0.11.2`". Set the header line to "The extension version is `1.0.0`". The setter never writes it, and `--check` fails without it, as the rehearsal proves. Write the other gate-dependent docs (D-28) now too.
4. Run `npm run version:set:extension -- 1.0.0`. With this plan's fix, `mcp/README.md` keeps "MCP 0.11.2 requires extension 0.9.92 or newer".
5. Run `npm run version:check && npm run validate:extension && npm test`, then restore the crawler files. The rehearsal now reports "step A released, step B rehearsed".
6. Commit the bump, the CHANGELOG and the docs with no AI attribution. Afterwards, `git status --short` must be empty.
7. Run `node scripts/release/check-release-diff.mjs --measured <V4 sha> --step A`. This is built by 71-09.
8. Bring `origin/main` in and re-check until `git log --oneline Jev..origin/main` is empty.
9. Merge through the pull request once CI is green, `all-green` included.
10. Submit the store privacy form and listing (M-68-11).
11. Tag `extension-v1.0.0`, or upload manually.
12. Wait for the store to show 1.0.0 live.

### V6: M-71-11 (step B, MCP 0.12.0; skipped if the non-Jev MCP path did not pass)

1. Branch from `main`.
2. Author `mcp/CHANGELOG.md` `<a id="v0.12.0"></a>` / `## 0.12.0 (<date>)`, naming `fsb-mcp-server@0.12.0`.
3. Author `### What's New In v0.12.0` above v0.11.2 in `mcp/README.md`, and **move** the single `- **Compatibility:**` bullet into it. A copied bullet fails the setter with "expected exactly one", as the rehearsal proves.
4. Add "MCP-only update (<date>): the package advances to `0.12.0` …" to the `CHANGELOG.md` v1.0.0 section.
5. Run `npm run version:set:mcp -- 0.12.0 && npm --prefix mcp run build && npm run version:check && npm test`. The README pair line then reads "MCP 0.12.0 requires extension 0.9.92 or newer for existing tools. `settings` and the optional `expect` need extension 1.0.0 or newer; …".
6. Commit the bump with the six force-tracked `mcp/build` files and `mcp/native-host/runtime-integrity.json`, with no AI attribution.
7. Run `node scripts/release/check-release-diff.mjs --measured <V4 sha> --step B`.
8. Catch up with `origin/main`, then merge once CI is green.
9. `npm view fsb-mcp-server dist-tags.latest` must print `0.12.0`.

## Next Phase Readiness

- **71-09** can reuse `scripts/lib/mcp-extension-compat.mjs` for the delta manifest's compatibility notes. Its release-diff checker treats the setter's outputs as setter-class paths. The new module is code, not docs, so a post-V4 change to it is a non-docs violation, as intended.
- **71-12** lists `tests/release-version-rehearsal.test.js` among its plain suites for the Node 20 phase gate. It is registered and passes on Node 20.

## Self-Check: PASSED

- FOUND: scripts/lib/mcp-extension-compat.mjs
- FOUND: tests/helpers/release-doc-parity.js
- FOUND: tests/release-version-rehearsal.test.js
- FOUND: commit 3427c152
- FOUND: commit 1181ca10
