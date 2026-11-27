# AGENTS.md

Guidance for coding agents working in this repository. Contributors who use Claude Code with a local `CLAUDE.md` should add the line `@AGENTS.md` to it. Claude Code reads this file on its own only when no `CLAUDE.md` exists.

## What lives where

| Path | What it is |
|---|---|
| `extension/` | The Chrome MV3 extension: `ui/` (side panel, popup, control panel, onboarding), `content/` (scripts and overlays on web pages), `shared/fsb-ui-core.css` (product tokens), `_locales/` (UI copy in eight locales) |
| `showcase/angular/` | The showcase site (Angular). `src/styles.scss` holds the site tokens |
| `showcase/server/` | The server for the showcase on Fly |
| `mcp/` | The MCP server |
| `design-system/` | The design system: tokens, rules, surface pages, decision records, specimens. Start at [DESIGN.md](DESIGN.md) |
| `tests/`, `scripts/` | The test suites and the checks they run |

## Commands

- `npm run validate:extension` checks the extension files.
- `npm test` runs the full suite. It stops at the first failure, and one suite binds port 7226. If a local FSB host holds that port, the run halts early and the later suites never run.
- `npm run test:design` runs only the design-system checks.
- In `showcase/angular`: `npm run lint:i18n` and `npm run test:ci`.
- CI runs Node 20, so do not use Node 22+ APIs in scripts or tests.

## Rules that trip people up

- **New `npm test` commands.** Add a new command to the `test` chain in `package.json` exactly once, and add the same string to `REFINEMENT_ROOT_TEST_COMMANDS` in `tests/delegation-phase-contract.test.js`. That test pins hashes of the historical chain.
- **Source pins.** Many tests pin exact source text: sha256 hashes of `extension/ui/sidepanel.css`, `sidepanel.html`, `onboarding.css` and `onboarding.html`, exact substrings, and counts of tokens, including in comments. Before editing a shipped file, find its pins with `grep -rl "<file name>" tests/`. Recompute a pin in the same change, with a comment saying why.
- **Copy.** Extension UI text goes through `extension/_locales/*/messages.json`; `scripts/verify-extension-copy.mjs` fails on uncatalogued English. Showcase text carries Angular i18n markers; `lint:i18n` fails on unmarked text.

## UI work

Read [DESIGN.md](DESIGN.md) first. In short:

- **MUST** take values from the tokens of the surface's own palette:
  - site tokens on the showcase and onboarding;
  - `--fsb-*` on the side panel, popup and control panel;
  - the `#ff8c00` overlay family on web pages.
- **MUST** change a token's twin in `design-system/tokens/` whenever you change a shipped token.
- **MUST** honour `prefers-reduced-motion`, keep focus visible, and make new controls at least 44px square.
- **MUST NOT** use emoji, add icon sets, or hard-code versions, tool counts or benchmark figures.
- **MUST** run `npm run test:design`. A new raw colour, z-index or font stack in a shipped stylesheet fails it. Use a token, or mark a literal that must stay with a comment starting with `design-literal-ok:` and a reason.
- When a change alters a rule that several surfaces follow, update the page under `design-system/` and add a decision record in `design-system/decisions/`. When a correction from a person changes a design rule, propose the matching edit to DESIGN.md or a decision record in the same change.
- Planning specs for UI work should cite DESIGN.md as the baseline and record only what differs.
