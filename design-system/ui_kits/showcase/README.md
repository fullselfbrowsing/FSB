# Showcase site UI kit

**Prototype, and stale.** This is the design tool's click-through recreation of the older, flat home and agents pages. The live home, about, agents, privacy and support pages are depth pages now; see [../../surfaces/showcase.md](../../surfaces/showcase.md). The kit loads `_ds_bundle.js`, which only the design tool builds, so it runs inside the design tool rather than from disk. Do not copy its layouts into shipped code.

| File | What it is |
|---|---|
| `index.html` | The runnable kit. Nav routes between screens; a button flips the theme. |
| `HomeScreen.jsx` | Hero, feature grid, provider grid, comparison block. |
| `AgentsScreen.jsx` | Site-guide directory with live search and an API-only filter. |

Screens receive the bundle's namespace as an `NS` prop rather than importing it, so the page runs without a build step.
