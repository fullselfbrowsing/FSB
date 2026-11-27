# 0008. A compact status pill replaces the in-page progress card

- Status: Accepted
- Date: 2026-11-24

Accepted: the pill shipped in pull request #173 (branch `while-we-were-here`), which this design system builds on.

## Context and problem statement

Before pull request #173, the progress card was a 320px panel in the top-right corner of every page FSB acts on, with a header, a task line, chips and a progress bar. The overlay design boards proposed two compact replacements:

- **Redesign A:** a pill that grows from a seed to at most three rows and plays the same motions as the toolbar icon.
- **Redesign B, "Horizon":** a wordmark rising from the bottom edge.

## Considered options

1. Redesign A, the pill.
2. Redesign B, Horizon.
3. Keep the progress card.

## Decision outcome

Chosen option 1. The boards keep Horizon only "for comparison and not kept up to date". The pill keeps everything the card does today (text pacing, the silence timers, state colours, the glows) in far less space. It shares one clock with the toolbar icon, so the page and the browser toolbar move together.

## Consequences

- The pill's measurements, states, motion and tests are in [../surfaces/overlays.md](../surfaces/overlays.md).
- Its motion overshoots and scales in, against the [motion foundation](../foundations/motion.md); that needs a recorded exception or a change.
- Its wordmark uses Poppins 200 for the F, drawn as outlines because fonts inside a shadow root are ignored. The extension ships only Poppins 100 and 900.
- Tests that pinned the old card's classes were replaced. [scripts/check-style-literals.mjs](../../scripts/check-style-literals.mjs) counts the pill's stylesheet in `visual-feedback.js`, and `checkOverlayTokens` reads it through `PILL_CSS`.

## Evidence

- Pull request #173 (branch `while-we-were-here`), commits `c51e39486` "replace the progress card with the compact status pill" and `f7e3fc8bd`
- The "FSB overlays" design canvas, boards Pill, PillStates, PillSpec, PillMotion and PillRules (see [../sources.md](../sources.md))
