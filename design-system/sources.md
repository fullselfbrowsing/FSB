# Sources

Where this design system came from, and how to bring later design work in.

The design work is done in the design tool: its design-system project and its canvases. Exports from it are handed over as zip files. The canvases stay in the design tool. They are not committed here, for three reasons:

- two of the four are captures of code that already ships;
- one holds personal mock data;
- the design tool's runtime bundled in each export is not ours to redistribute.

Their lasting rules are written into the surface pages instead.

## Imported

| Source | Exported | What it holds | Where it went |
|---|---|---|---|
| FSB design system (design-system project) | 2026-11-24 | Tokens, 17 prototype components, 23 specimen cards, assets, a showcase UI kit, a readme and an agent skill | This folder, corrected (below). The skill moved to `.claude/skills/fsb-design/SKILL.md` |

## Read, not committed

| Canvas | Version | Exported | Covers | Status against main | Rules written into |
|---|---|---|---|---|---|
| FSB overlays | 1795515332-0d02 | 2026-11-24 (an earlier export on 2026-11-15) | 15 boards. "Today's overlays" boards, 1:1 with the extension. "Redesign A" status pill: Pill, PillStates, PillSpec, PillMotion, PillRules. "Redesign B" (Horizon) | The today boards match `visual-feedback.js` on main. Redesign A is built on PR #173 and `Jev`. Horizon is superseded and not kept up to date | [surfaces/overlays.md](surfaces/overlays.md), [decisions/0008](decisions/0008-status-pill-replaces-progress-card.md) |
| FSB · 1Password vault | 1795515086-6b34 | 2026-11-24 | 9 boards: the control panel vault page, side panel prompts, the on-page pill and sheet, where a password may be typed, how secrets move, notes on PR #172 | All proposal, built on PR #172. The Notes board is a review of that PR, not a design rule. The boards' mock data includes personal details, which is another reason they stay out | [surfaces/vault.md](surfaces/vault.md), [decisions/0009](decisions/0009-secret-input-in-extension-frame.md) |
| FSB Showcase | 1795516602-e627 | 2026-11-24 (canvas created 2026-10-15) | 14 pages of the site | A capture of the rendered site as it was before the 3D redesign. Main is newer | [surfaces/showcase.md](surfaces/showcase.md) |
| FSB Showcase 3D | (project export) | 2026-11-24 | 5 depth pages: home, about, agents, privacy, support | Shipped in PR #165, refined in #167 and #171. Main is newer than the capture | [surfaces/showcase.md](surfaces/showcase.md), [decisions/0007](decisions/0007-depth-pages-on-phones.md) |

## Corrections made on import

The export described itself as extracted from shipped files. Checking it against the code turned up the following. Shipped code wins wherever the two disagree.

1. **Sources.** The readme named `showcase/css/base.css`, which has never existed in this repository, and a style-guide canvas that was not part of the export. The real sources are listed in [README.md](README.md), section "Checks".
2. **Version.** The readme stated an older release as the current one. Hard-coded versions in examples and specimens now read ▽X.Y.Z (eleven places). The UI kit used ▿ (U+25BF) instead of the brand's ▽ (U+25BD); fixed.
3. **Byline.** "Made by …" appeared in the readme, `Footer.d.ts`, `Footer.prompt.md`, `navigation.card.html` and `ui_kits/showcase/index.html`. The shipped footer has no byline, so it was removed.
4. **Surfaces.**
   - The readme put `/dashboard` and onboarding on the warm product palette; both use the site palette.
   - It described the side panel as "injected into the page".
   - It left out the in-page overlays.
5. **Fonts and icons.**
   - The readme said fonts and icons load from a CDN and nothing is self-hosted. In fact:
     - the extension bundles its fonts;
     - the showcase self-hosts Font Awesome and Phosphor subsets;
     - the showcase's Content-Security-Policy blocks Google Fonts.
   - `tokens/fonts.css` asked for Poppins at weight 200, which no shipped surface uses; it now asks for 100 and 900 only.
   - The claim that every provider mark is `currentColor` was dropped.
6. **Motion and chrome.**
   - The readme placed the hero glow at a position the code does not use.
   - It claimed every animation sits under a reduced-motion guard; the site has no global guard.
   - It described a theme toggle; the shipped site follows the system setting.

   All three were removed or corrected.
7. **Product tokens.** `tokens/product-surface.css` changed in five ways:
   - its `--fsb-*` ramp moved from `:root` into `[data-surface="product"]`, so it no longer overrides the site values the showcase declares under the same names;
   - the eight `--fsb-space-*` tokens and the 23 compatibility aliases it lacked were added;
   - four alias radii were changed to `var(--fsb-radius-*)` to match `fsb-ui-core.css`;
   - the dark theme block, missing entirely, was added;
   - its "namespaced, no collisions" comment was false and was removed.
8. **Site tokens.** `tokens/colors.css` gained the four `--fsb-*` names the showcase re-declares. All 41 names that exist only in the design system are now marked `/* proposed */`.
9. **Overlay tokens.** `tokens/overlay.css` is new. Each token names the selector and property it mirrors in `visual-feedback.js`.
10. **Wordmark.** The B was drawn at 0.68em in `FsbMark.jsx` and three brand cards. The shipped site uses 0.74em, which puts the B's top level with the S; changed to match.
11. **Assets.** The export's `openclaw.svg` had lost its `<style>` block, so it rendered without its colours. Its `openrouter.svg` was a rewrite. Both were replaced with the shipped files.
12. **Additions.** The readme became [README.md](README.md). Two specimen cards were added (product dark, overlay palette), plus the [index.html](index.html) style guide.

## Bringing in a later export

Compare the new export with this folder file by file, keep the corrections above, run `npm run test:design`, and add a row to the tables here. If the design tool should stop reproducing a correction, fix it in the design tool's project too.
