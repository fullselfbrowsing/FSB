---
quick_id: 260617-g1w
status: complete
completed: 2026-06-17
commit: 2be7a4db
---

# Quick Task 260617-g1w Summary

## Goal

Upgrade FSB's audited public Lattice runtime and CLI pins from 1.3.0 to 1.4.0.

## Changes

- Updated `package.json` and `package-lock.json` to pin:
  - `lattice` -> `npm:@full-self-browsing/lattice@1.4.0`
  - `@full-self-browsing/lattice-cli` -> `1.4.0`
- Rebuilt `extension/dist/offscreen/lattice-host.js` so the MV3 offscreen bundle includes the 1.4.0 runtime.
- Updated `tests/helpers/lattice-public-pin.js` to expect:
  - runtime integrity `sha512-D0cS0YtpjMAkEl03kgg8th9mpUDVnOMJ6QmvW7e8iVIUWmtJ1cYVi7n+eKUmgo21v/waL/qjPBmJ8SlQcjOLww==`
  - source tag `v1.4.0`
  - source commit `bb459f88217fc2925b242a49f03bf991d604d43e`
  - receipt schema `lattice-receipt/v1.3`
- Expanded the public package smoke to assert 1.4.0-only proof points:
  - `lattice.latticeVersion === "1.4.0"`
  - `createLiteLLMProvider`
  - `collectStream`
  - `createOtelRunEventSink`
  - `createRemoteReceiptSigner`
  - CLI commands `repro|verify|eval|receipt|diagnostics`
- Updated `.planning/LATTICE-PIN.md` frontmatter and appended the quick-task history row.

## Verification

- `npm run build` passed.
- `npm run test:lattice` passed.
- `npm test` passed.
- `npm audit signatures` passed: 32 packages have verified registry signatures; 5 packages have verified attestations.
- Checked the rebuilt offscreen bundle for surviving `node:*` imports; none were present.

## Notes

- `npm audit --json` still reports two unrelated advisories: `esbuild <=0.24.2` and transitive `form-data <4.0.6`. They were not introduced by the Lattice bump and were left for a separate dependency/security task.
- Pre-existing sidepanel edits in `extension/ui/sidepanel.*` were left untouched and uncommitted.
