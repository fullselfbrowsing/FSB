# Video sitemap validation

`sitemap-video-1.1.xsd` is an unmodified snapshot of
[Google's video sitemap schema](https://www.google.com/schemas/sitemap-video/1.1/sitemap-video.xsd),
retrieved on 2026-10-14. Its SHA-256 is
`1c9efc3a4ac8f1e893367c294bcda5864d3e8e4491cca4386b8dcbffd33a0006`.
Keep the original notices intact. Refresh the snapshot and checksum together,
review schema changes, and rerun the regression fixtures before committing.

`video-sitemap-validation.xsd` imports that local snapshot and validates every
video entry in the complete sitemap, preserving inherited XML namespaces.
It leaves core sitemap fields and hreflang links to the existing crawler and
hreflang checks. Validation uses `xmllint --nonet`; no schema is downloaded
during tests or CI.

The check requires `xmllint`, included at `/usr/bin/xmllint` on macOS and
provided by `libxml2-utils` on Debian/Ubuntu. Website CI installs it explicitly;
a missing validator fails the check. No npm or application dependency is added.

From `showcase/angular`, run `npm run test:video-sitemap` for regression fixtures
and `npm run verify:video-seo` after a production build for all localized entries
and their existing page/video/FAQ consistency checks.
