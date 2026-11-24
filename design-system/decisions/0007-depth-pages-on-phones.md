# 0007. Depth pages on phones: one plane per screen, nothing scrolls sideways, opened content scrolls instead of shrinking

- Status: Accepted
- Date: 2026-11-24

The decisions below were made between 2026-11-13 and 2026-11-15, during the 3D redesign of the showcase.

## Context and problem statement

Since the 3D redesign, the home, about, agents, privacy and support routes are "depth" pages. They are fixed stages whose sections are planes along the z axis; wheel, keys and touch move the camera between them. Planes are scaled to fit the window. On phones that raised three questions:

- what to do with a section taller than the screen;
- what to do with rows wider than it;
- what to do when an FAQ answer opens inside a fitted plane.

## Considered options

1. Compact phone layouts, with each plane shrunk to fit one screen. No sideways scrolling anywhere. Content that opens on demand keeps the plane at its resting size and scrolls inside it.
2. Split tall sections into several swipe steps.
3. Sideways swipe rows for wide content.
4. Zoom a plane out while an answer opens, so the whole section stays in view.

## Decision outcome

Chosen option 1, by the owner:

- **Sections at rest.** One 3D swipe moves one section on home, about, agents and support. No section scrolls inside itself at rest. Privacy stays a scrolling document.
- **No sideways scrolling.** Everything in a section shows at once: cards as short rows or two columns, chips wrapped, and the plane shrinks to fit. Smaller is accepted over hidden or scrolled. Sideways swipe rows were built, polished and then removed.
- **Opened content.** An opened answer never shrinks its plane. The plane keeps its resting size and scrolls inside itself once the answer does not fit, with the opened answer scrolled into view. A smooth zoom-out was tried and rejected: the shrinking itself was the problem, not its smoothness.
- **Motion feedback.** When someone describes a motion by naming its parts, every part they name is unwanted. Plan toward the end state, such as "the answer opens and nothing else changes size", rather than smoothing what exists.

## Consequences

- New content on a depth page goes inside a plane's fit box and must be checked at phone sizes and in the long locales. German and Russian text runs longer than English, so their planes scale down further.
- No carousels, scrolling chip lines or scrolling tab strips on these four routes.
- Opened content carries `[data-depth-grows]` so the engine fits the plane without it.

## Evidence

- Pull request #165 (commit `037328ffa` on main), which squashed these commits from the redesign branch: `a675deb1c` "move one section per swipe on phones instead of scrolling inside it", `8601f1129` "show everything in a section at once instead of scrolling sideways", `fa07cda88` (the reverted zoom), `bbcd4e346` "open a support answer without shrinking its section"
- [showcase/angular/src/styles/depth.scss](../../showcase/angular/src/styles/depth.scss)
- [design-system/surfaces/showcase.md](../surfaces/showcase.md)
