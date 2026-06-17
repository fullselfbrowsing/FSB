---
current_phantomstream_source: npm
current_phantomstream_package: "@full-self-browsing/phantom-stream"
current_phantomstream_version: "0.1.0"
current_phantomstream_integrity: "sha512-Hf6K0bjAT5M9dUs7Xw1NB2Cb8hkmiMz7KDO0rq5mRkDKmQnLY1sTqTXwIX2r5gjLKVkl3TCemr3hSucVc1k69g=="
current_phantomstream_tarball: "https://registry.npmjs.org/@full-self-browsing/phantom-stream/-/phantom-stream-0.1.0.tgz"
current_phantomstream_shasum: "87e203e2d1a0f5ef097c8b4aba5fe854a6fe134d"
current_phantomstream_published_at: "2026-06-16T15:18:07.863Z"
rejected_phantomstream_package: "@fullselfbrowsing/phantom-stream"
rejected_phantomstream_status: "E404 on 2026-06-17"
last_verified: 2026-06-17
schema_version: 1
---

# PhantomStream Pin -- FSB Package Source Record

This file is the FSB-side source-of-truth for the PhantomStream package consumed by the v0.12.0 migration.

**Current source:** npm package `@full-self-browsing/phantom-stream@0.1.0`
**Runtime tarball:** `https://registry.npmjs.org/@full-self-browsing/phantom-stream/-/phantom-stream-0.1.0.tgz`
**Runtime tarball integrity:** `sha512-Hf6K0bjAT5M9dUs7Xw1NB2Cb8hkmiMz7KDO0rq5mRkDKmQnLY1sTqTXwIX2r5gjLKVkl3TCemr3hSucVc1k69g==`
**Registry shasum:** `87e203e2d1a0f5ef097c8b4aba5fe854a6fe134d`
**Rejected stale source:** `@fullselfbrowsing/phantom-stream` returned npm `E404` on 2026-06-17.

## Decision

FSB consumes the published npm package `@full-self-browsing/phantom-stream@0.1.0` with an exact dependency and package-lock integrity. A temporary GitHub or tarball pin is not authorized because the registry package is available and installable.

If a later smoke test proves the registry package cannot satisfy FSB's import/runtime constraints, the migration must stop and record a new explicit source decision before production stream code imports PhantomStream.

## Verification Commands

```bash
npm view @full-self-browsing/phantom-stream@0.1.0 dist.integrity dist.tarball version name --json
npm view @fullselfbrowsing/phantom-stream --json
node tests/phantom-stream-public-package.test.js
```

## Schema Notes

- `current_phantomstream_source`: active source type. `npm` means the package-lock integrity is the source gate.
- `current_phantomstream_package` / `current_phantomstream_version`: the exact runtime package FSB imports.
- `current_phantomstream_integrity`: registry tarball integrity copied from `package-lock.json`.
- `rejected_phantomstream_package`: stale planning reference that must not be used in code or docs except to explain the correction.
