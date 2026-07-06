---
phase: 275
plan: implicit-from-context
verified: 2026-05-14
status: passed
human_needed: true
human_action_kind: CWS Developer Dashboard click-through (D-15, post-merge)
---

# Phase 275 Verification

## Status: passed (5/5 automated gates green; 1 human-gated step deferred per D-15)

## Automated verifications (all green)

| # | Command                                                              | Status | Notes |
| - | -------------------------------------------------------------------- | ------ | ----- |
| 1 | `node scripts/verify-store-listing.mjs`                              | exit 0 | 5/5 checks PASS: Data-Collection heading present, full-selfbrowsing.com/privacy reference present, #telemetry-disclosure anchor present, privacy-practices-evidence.md non-empty, manifest.json has homepage_url. |
| 2 | `node tests/verify-store-listing.test.js`                            | exit 0 | 3/3 PASS — wraps gate #1. |
| 3 | `node tests/showcase-privacy-page.test.js`                           | exit 0 | 53/53 PASS — source-level invariants for the privacy-page Anonymous Usage Telemetry section. |
| 4 | `npm --prefix showcase/angular run build`                            | exit 0 | 30 prerendered routes produced; `i18nMissingTranslation: error` invariant intact (every PRIVACY_TELEMETRY_* id has a `<target state="translated">` in all 5 non-en locales). |
| 5 | `npm --prefix showcase/angular run verify:hreflang`                  | exit 0 | 301/301 PASS — hreflang count unchanged at 300+1 routes; /stats absent. |
| extra | `SKIP_BUILD=1 node tests/showcase-build-smoke.test.js`           | exit 0 | 130/130 PASS — pre-existing /stats Easter-egg posture preserved. |
| extra | `/stats` absence in prerender-routes.txt / sitemap.xml / llms.txt / llms-full.txt | OK | Confirmed absent (per Phase 274 invariant). |

## Self-Check (from SUMMARY.md)

PASSED — all 11 created/modified file paths exist, all 4 task commits (c9db4f0, 412195f, 94144ee, b3fc2ee) are in `git log`, all 5 verification commands exit 0.

## Constraint compliance

- [x] Atomic commits per task: `feat(275-01)`, `feat(275-02)`, `feat(275-03)`, `test(275-04)` — one commit each, per spec.
- [x] DID NOT touch sitemap.xml, llms.txt, llms-full.txt, prerender-routes.txt, verify-hreflang.mjs, locale-seo.ts.
- [x] /stats and /privacy routes unchanged — no routing edits.
- [x] Limited Use language is verbatim per CWS spec — appears byte-equal in the privacy page, listing-copy.md, and privacy-practices-evidence.md. Specifically, the clause "never sold, never shared with third parties, never used for advertising, and never used to train any machine-learning models" is reproduced verbatim in all three locations (the showcase-privacy-page.test.js test asserts the 6 verbatim phrases).
- [x] No translation of code identifiers (UUID, MCP, install_uuid, fsbInstallUuid, curl command, Chrome Web Store, Limited Use, GDPR, HTTP) — all live inside `<x id="…"/>` placeholders in the XLIFF and stay verbatim across all 5 non-en locales.

<human_verification>
## Human-gated step: CWS Developer Dashboard click-through

Per D-15, the actual update of the CWS Developer Dashboard Privacy Practices tab is user-gated POST-merge. This phase produced the in-repo evidence file (`store-assets/chrome-web-store/privacy-practices-evidence.md`) that documents exactly what to tick — but a human must perform the click-through on https://chrome.google.com/webstore/devconsole at publish time.

### Workflow checklist (this is a workflow CHECKLIST, not a code change)

The publisher (human) performs these steps when v0.9.69 is ready to publish to the Chrome Web Store. The in-repo source-of-truth for each decision is `store-assets/chrome-web-store/privacy-practices-evidence.md`.

1. **Open the Chrome Web Store Developer Dashboard** for the FSB item and navigate to the Privacy Practices tab.

2. **Tick "Personally identifiable information"** under "What user data does your extension handle?". The UUID (`fsbInstallUuid`) counts as a regulated identifier per the CWS User Data FAQ even though it is never tied to a natural-person identity.
   - Leave UNTICKED: Health information, Financial and payment information, Authentication information, Personal communications, Location, **Web history**, User activity, Website content.

3. **Provide the Privacy Policy URL:** `https://full-selfbrowsing.com/privacy#telemetry-disclosure`. The anchor must resolve directly to the Anonymous Usage Telemetry section, not the page top.

4. **Tick the "Limited Use" certification.** The verbatim compliance statement is rendered on the published privacy page at `#telemetry-disclosure` and must NOT be paraphrased.

5. **Save the Privacy Practices tab.**

6. **Capture screenshots** of the populated form BEFORE submitting and commit them at:
   - `store-assets/chrome-web-store/screenshots/privacy-01-data-types.png`
   - `store-assets/chrome-web-store/screenshots/privacy-02-data-use.png`
   - `store-assets/chrome-web-store/screenshots/privacy-03-policy-url.png`
   - `store-assets/chrome-web-store/screenshots/privacy-04-limited-use.png`
   - `store-assets/chrome-web-store/screenshots/privacy-05-final-summary.png`

7. **Submit the listing** for the v0.9.69 update.

8. **Post-submit verification (3 minutes):**
   - From a logged-out browser, visit `https://chrome.google.com/webstore/detail/<extension-id>` and confirm the new "Data Collection" disclosure appears on the public listing.
   - Visit `https://full-selfbrowsing.com/privacy#telemetry-disclosure` and confirm the anchor scrolls to the new section.
   - From an FSB-installed Chrome, open the Control Panel → Advanced Settings → confirm the "Send anonymous usage data" toggle is present and the "Read full policy" hint link points to the same anchor.

### Notes for the publisher

- The Limited Use phrase MUST appear verbatim on the published privacy page (it does — see commit c9db4f0). If a future translation pass changes the EN source text, re-extract and re-verify because the CWS will reject the listing if the published text drifts from the certification.
- The screenshots are an audit trail only; the in-repo source-of-truth for "what should appear in each screenshot" is `privacy-practices-evidence.md`.
- If the CWS Developer Dashboard adds new Privacy Practices categories in the future, re-evaluate against `privacy-practices-evidence.md` and update both before re-submission.
</human_verification>

## Cross-references

- Phase 269 — Control Panel "Send anonymous usage data" kill-switch toggle (already wired, references `#telemetry-disclosure` anchor).
- Phase 273 — Backend telemetry pipeline + `POST /api/telemetry/forget` endpoint + IP-hash-with-daily-salt + `Sec-GPC` support.
- Phase 274 — Public `/stats` page + `FSBTelemetryService` + 15 SHOWCASE_STATS_FSB_* trans-units + Easter-egg posture (no sitemap/llms inclusion).
- Phase 275 (this phase) — Privacy page disclosure + CWS Data Collection listing + Privacy Practices evidence + CI guard.

## Requirements satisfied

- [x] CONS-03 — privacy page renders the disclosure section with i18n.
- [x] CONS-04 — disclosure enumerates all 5 collected + 6 NOT-collected categories.
- [x] CONS-05 — CWS listing-copy.md mirrors the disclosure with a link back to the privacy page.
- [x] CONS-06 — privacy-practices-evidence.md documents the Privacy Practices tab decisions.
- [x] CONS-07 — `scripts/verify-store-listing.mjs` + 2 test files gate the CI.

## Blocker closed

B3 — CWS listing + Privacy Practices declaration: CLOSED. The in-repo deliverables are complete and the CI gate is green. Only the user-gated Dashboard click-through (D-15) remains, documented above in `<human_verification>`.
