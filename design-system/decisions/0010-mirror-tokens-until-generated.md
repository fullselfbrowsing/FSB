# 0010. design-system/tokens mirrors the shipped token blocks, and a check keeps them equal

- Status: Accepted
- Date: 2026-11-24

## Context and problem statement

The design system needs one place where every token is written down. Shipped files can only load what their own tree contains:

- The Chrome extension package is the `extension/` folder alone.
- The Fly image of the showcase is built from `showcase/{server,angular,assets,js}` and `extension/manifest.json` (see `.dockerignore` and `Dockerfile`).

Neither can import a file from `design-system/`.

## Considered options

1. Keep the shipped token blocks where they are, write the same values in `design-system/tokens/`, and fail `npm test` when the two disagree. Names that exist only in the design system carry a same-line `proposed` comment.
2. Make `design-system/tokens/` the only source and generate the shipped blocks into `extension/` and `showcase/` with a committed, staleness-checked output. `extension/catalog/recipe-index.generated.js` already uses this pattern.
3. Copy the tokens once and trust people to keep them in sync.

## Decision outcome

Chosen option 1 for now. It changes no shipped file, so the first design-system pull request moves no pixels and no pinned hashes. Option 2 is the next step. It edits shipped CSS that several tests pin by hash, so it gets its own pull request.

## Consequences

- To change a token, edit the shipped file and its design-system twin in the same change. `node scripts/verify-design-system.mjs` names both files and both values when they differ.
- When option 2 lands, this record becomes `Superseded by` the record that describes the generator.

## Evidence

- [scripts/verify-design-system.mjs](../../scripts/verify-design-system.mjs) `MIRRORS`, `compareMirror`
- [extension/shared/fsb-ui-core.css](../../extension/shared/fsb-ui-core.css) and [showcase/angular/src/styles.scss](../../showcase/angular/src/styles.scss)
- [scripts/package-extension.mjs](../../scripts/package-extension.mjs) (the package is `extension/` only)
