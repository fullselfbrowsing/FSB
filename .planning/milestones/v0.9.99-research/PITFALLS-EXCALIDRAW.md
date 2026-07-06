# Domain Pitfalls: Excalidraw Canvas Automation for FSB

**Domain:** Canvas-based drawing application automation (Excalidraw mastery milestone)
**Researched:** 2026-03-23
**Overall confidence:** HIGH (verified against FSB codebase, Excalidraw source, CDP documentation)

---

## Critical Pitfalls

Mistakes that cause features to not work at all or require architectural changes.

---

### Pitfall 1: Text Entry Fails Because Excalidraw Uses a Transient Textarea, Not Contenteditable

**What goes wrong:** FSB's `type` tool checks `element.contentEditable === 'true'` or `element.tagName === 'INPUT'/'TEXTAREA'`. When AI targets Excalidraw's text editing, the `type` tool fails with "Element is not an input field" because the text editing textarea is created dynamically by Excalidraw only AFTER double-clicking on the canvas or pressing T. At the moment the AI issues the type command, the textarea either does not exist yet (race condition) or the ref points to the wrong element (stale ref).

**Why it happens:**
- Excalidraw creates a `<textarea>` element programmatically in `textWysiwyg.tsx` and appends it to `.excalidraw-textEditorContainer`
- The textarea is absolutely positioned, overlaying the canvas at the text element's coordinates
- It is removed from the DOM entirely when editing ends (Escape, Ctrl+Enter, blur)
- FSB's DOM snapshot captures the page state BEFORE the textarea exists, so refs point to canvas or toolbar elements
- Even if the textarea is captured, it may be destroyed and recreated between DOM snapshots

**Consequences:**
- Text entry on Excalidraw is completely broken
- AI retries with the same approach, gets stuck, wastes iterations
- Known error: "Element is not an input field" on Excalidraw text boxes
- Known error: "Unknown ref" when refs become stale after drawing actions

**Prevention:**
1. After activating text mode (double-click via CDP or press T), wait 200-400ms for the textarea to mount
2. Query for the textarea directly: `document.querySelector('.excalidraw-textEditorContainer textarea')` or `document.querySelector('textarea[data-type="wysiwyg"]')`
3. Do NOT rely on element refs from DOM snapshots for the text textarea -- it is ephemeral
4. Use CDP `Input.insertText` directly after confirming focus is on the textarea (the textarea receives focus automatically on creation)
5. After typing, press Escape or Ctrl+Enter via CDP to commit the text and destroy the textarea

**Detection:** The AI reports "Element is not an input field" or "Unknown ref" when attempting to type text on Excalidraw.

**Phase:** Must be solved in the core text entry phase (Phase 1 of Excalidraw mastery). Without this, no text features work.

---

### Pitfall 2: Canvas State Cannot Be Verified Through DOM Inspection

**What goes wrong:** FSB's action verification (`captureActionState`, `verifyActionEffect`) and completion validation (`validateCompletion`) rely on DOM changes to confirm actions worked. On Excalidraw, drawing a rectangle changes nothing in the DOM that FSB can observe -- the shape exists only in Excalidraw's internal React state and is rendered on an HTML5 `<canvas>` element. The DOM tree does not contain SVG elements or other DOM representations of drawn shapes.

**Why it happens:**
- Excalidraw renders all shapes on `<canvas>` elements (multiple layers: static, interactive)
- Shape data lives in Excalidraw's React component state (`elements` array), not in the DOM
- `capturePageState()` in `action-verification.js` checks `document.body.innerText`, input values, and visible elements -- none of which reflect canvas content
- The progress tracker in `background.js` uses `changeSignals.channels` (structural, content, pageState) -- canvas drawing triggers none of these
- `isCanvasBasedEditor()` currently only returns `true` for `docs.google.com`, NOT for Excalidraw

**Consequences:**
- AI draws shapes successfully but FSB detects "no progress" because DOM did not change
- After 6 iterations of "no progress," the hard stop triggers and the session aborts
- AI claims task completion prematurely because it cannot verify its work either
- Verification loop rejects valid completions because no DOM evidence exists

**Prevention:**
1. Add Excalidraw to `isCanvasBasedEditor()` detection (check for `excalidraw.com` hostname or `canvas.interactive` selector)
2. For canvas apps, use Excalidraw's API to verify state: `document.querySelector('.excalidraw').excalidrawAPI?.getSceneElements()` returns the elements array
3. Alternatively, read localStorage key `excalidraw` which contains the serialized scene (elements array with types, positions, text)
4. Count elements before/after actions to verify shapes were created
5. For completion validation, the dynamic page fast-path already covers Excalidraw URLs (`canvasUrl` regex matches `excalidraw`) -- but the `isCanvasBasedEditor()` used in progress tracking does NOT

**Detection:** Session aborts with "No progress detected for 6 consecutive iterations" despite shapes being successfully drawn on the canvas.

**Phase:** Must be solved alongside or immediately after basic drawing (Phase 1-2). Without this, the automation loop breaks on any multi-step Excalidraw task.

---

### Pitfall 3: isCanvasBasedEditor() Does Not Include Excalidraw, Breaking the Type Tool Bypass

**What goes wrong:** The `type` tool has a critical code path at line 2132 of `content/actions.js`: `const canvasEditor = FSB.isCanvasBasedEditor()`. When this returns `true`, the type tool bypasses the "is it an input?" gate and uses CDP `Input.insertText` directly. But `isCanvasBasedEditor()` in `content/messaging.js` (line 217) only checks for `docs.google.com` and Google Docs/Sheets DOM selectors. Excalidraw is NOT detected as a canvas editor, so the bypass never triggers.

**Why it happens:**
- `isCanvasBasedEditor()` was written specifically for Google Docs/Sheets, not as a generic canvas detector
- The `canvasUrl` regex in `validateCompletion` (background.js line 4908) DOES include `excalidraw`, but this is a different check used only for completion validation
- There is no shared "is this a canvas app?" utility -- the detection is duplicated and inconsistent between content scripts and background script

**Consequences:**
- The type tool falls into the standard input/contenteditable path and fails
- Even if a textarea exists (the WYSIWYG editor), the type tool may not find it because it queries by the AI-provided selector (a ref), not by the textarea's actual DOM location
- The CDP direct path that works for Google Docs (which would also work for Excalidraw) is never reached

**Prevention:**
1. Expand `isCanvasBasedEditor()` to detect Excalidraw: check `window.location.hostname` for `excalidraw.com` or check for `canvas.interactive` in the DOM
2. Better: refactor into a generic canvas app detector that checks a list of known patterns (hostname regex, DOM selectors)
3. Ensure the same detection logic is used in both content scripts and background script -- single source of truth

**Detection:** The type tool returns "Element is not an input field" on Excalidraw even though CDP insertion would work if the canvas editor bypass were triggered.

**Phase:** Phase 1 fix -- this is a gating issue for all text entry on Excalidraw.

---

### Pitfall 4: CDP Debugger Attachment Conflicts Between Keyboard Emulator and CDP Tools

**What goes wrong:** FSB has two systems that both attach the Chrome debugger: the `KeyboardEmulator` (for `typeWithKeys`, `press_key`) and the CDP tools (`cdpClickAt`, `cdpDrag`, `cdpInsertText`). Chrome only allows ONE debugger attachment per tab. When Excalidraw workflows rapidly alternate between keyboard shortcuts (press R, press T) and CDP mouse events (cdpDrag), the debugger attachment/detachment cycle causes "Another debugger is already attached" errors.

**Why it happens:**
- `handleCDPInsertText` (line 11858) checks `keyboardEmulator.isAttachedTo(tabId)` and detaches first, but there is a race window
- `executeCDPAction` (line 12432) has its own attach/detach logic independent of the keyboard emulator
- Excalidraw workflows uniquely require rapid interleaving: press_key(R) -> cdpDrag -> press_key(T) -> cdpClickAt -> cdpInsertText
- Each tool attaches and detaches independently, creating a rapid attach-detach-attach cycle
- If a previous detach has not completed before the next attach, the error fires

**Consequences:**
- Drawing actions fail intermittently ("Another debugger is already attached")
- Text insertion fails after a drag operation
- The error is transient and non-deterministic, making it hard to reproduce and debug

**Prevention:**
1. Implement a shared debugger manager that serializes all debugger attach/detach operations
2. Use a single persistent debugger session for the entire Excalidraw automation workflow instead of attach-per-action
3. Add retry-with-backoff specifically for the "already attached" error (partially exists in `cdpInsertText` but not in `executeCDPAction`)
4. The existing `keyboardEmulator.isAttachedTo()` check should be replicated in ALL CDP tool paths

**Detection:** Intermittent errors mentioning "debugger" or "already attached" during multi-step Excalidraw workflows.

**Phase:** Phase 2-3. Workaround possible with retry logic, but proper fix needs a unified debugger manager.

---

### Pitfall 5: Tool Auto-Switch After Drawing Causes Silent Failures

**What goes wrong:** After drawing a shape in Excalidraw, the active tool automatically switches back to the Selection tool (V). If the AI issues two consecutive `cdpDrag` commands expecting to draw two rectangles, the second drag creates a selection box instead of a rectangle. The drag "succeeds" (CDP events are dispatched without error) but the intended shape is not created.

**Why it happens:**
- Excalidraw's default behavior: after completing a shape draw, revert to selection mode
- The site guide documents this ("After drawing, Excalidraw auto-switches back to selection tool -- re-press R before each rectangle")
- But the AI does not always follow this instruction, especially when batching actions
- FSB cannot detect this failure because canvas state is not observable (Pitfall 2)
- CDP drag returns `success: true` regardless of what Excalidraw did with the mouse events

**Consequences:**
- Missing shapes in the output diagram
- AI does not realize shapes are missing and marks task as complete (premature completion)
- Difficult to debug because each individual action reports success

**Prevention:**
1. After EVERY cdpDrag on Excalidraw, the AI prompt must enforce re-pressing the tool shortcut before the next draw
2. Add Excalidraw-specific post-draw verification: read `excalidrawAPI.getSceneElements().length` before and after each draw, confirm it increased by 1
3. In the site guide, make the re-press instruction even more prominent (currently a warning, should be a hard rule in the workflow steps)
4. Consider wrapping cdpDrag in an Excalidraw-specific "drawShape" composite action that automatically presses the tool key first

**Detection:** Element count in Excalidraw state does not increase after a drag operation.

**Phase:** Phase 1 (basic drawing). The site guide already documents this but enforcement is needed.

---

## Moderate Pitfalls

Mistakes that cause degraded functionality or require significant debugging.

---

### Pitfall 6: Canvas Clear via Select All + Backspace is Unreliable

**What goes wrong:** To clear the Excalidraw canvas before starting a new diagram, the natural approach is Ctrl+A (select all) followed by Delete/Backspace. This fails intermittently because: (a) Ctrl+A may not select elements if focus is not on the canvas, (b) the text WYSIWYG editor may intercept Ctrl+A if a text element is being edited, (c) Backspace may trigger browser back-navigation if focus is on the wrong element.

**Why it happens:**
- Excalidraw's Ctrl+A only works when the canvas has focus (the interactive canvas layer must have received a recent pointer event)
- If a modal, dialog, or tooltip is open, keyboard shortcuts are captured by that overlay instead
- The welcome dialog on first visit can intercept keyboard shortcuts
- Browser's default Backspace behavior navigates back if no editable element has focus

**Prevention:**
1. Before Select All: click on the canvas via CDP to ensure it has focus, then dismiss any dialogs (press Escape first)
2. Use Delete key instead of Backspace (less likely to trigger browser navigation)
3. Alternatively, use Excalidraw's API: `excalidrawAPI.resetScene()` clears everything programmatically
4. Verify selection happened before deleting: check if Excalidraw shows selection handles (though this requires canvas state inspection)

**Detection:** Canvas still shows elements after the clear operation, or browser navigates away.

**Phase:** Phase 2 (canvas management).

---

### Pitfall 7: Coordinate Precision Errors Due to Zoom, Scroll, and Canvas Offset

**What goes wrong:** CDP mouse events use viewport coordinates. The AI calculates drawing coordinates based on the canvas bounding rect, but Excalidraw has its own internal coordinate system that differs from viewport coordinates due to: (a) canvas zoom level, (b) canvas pan/scroll position, (c) the canvas element's offset from the viewport top-left, (d) device pixel ratio scaling.

**Why it happens:**
- Excalidraw transforms mouse viewport coordinates through its own zoom and pan transforms
- The default zoom is 100% but users or previous automations may have changed it
- Canvas pan position is stored in appState.scrollX/scrollY and shifts all coordinates
- The canvas element may not start at (0,0) of the viewport due to toolbar, sidebars
- `getBoundingClientRect()` returns viewport coordinates for the canvas element, but Excalidraw internally applies `appState.zoom.value` and `appState.scroll{X,Y}` to translate
- Shapes drawn at viewport coordinate (400, 300) appear at different canvas-space positions depending on zoom/pan

**Consequences:**
- Shapes appear in wrong locations relative to each other
- Text placed at "the center of rectangle A" misses entirely
- Alignment looks wrong even when coordinates seem correct
- Connectors (arrows) miss their intended anchor points

**Prevention:**
1. Always reset zoom to 100% before automation: Ctrl+Shift+0 or via `excalidrawAPI.resetZoom()`
2. Always reset pan to origin: Ctrl+Shift+F (fit to screen) or set scrollX/scrollY to 0
3. Get canvas bounding rect FRESH before every coordinate calculation (it can change if sidebar opens/closes)
4. Use relative coordinates within the canvas: calculate positions as offsets from the canvas top-left corner
5. Account for CSS `transform: scale()` if the canvas element has a scale transform applied

**Detection:** Shapes appear misaligned or outside the visible canvas area despite correct-seeming coordinates.

**Phase:** Phase 1 (basic drawing). Coordinate handling is foundational.

---

### Pitfall 8: Minimum Drag Distance Threshold Causes Failed Shape Creation

**What goes wrong:** Excalidraw requires a minimum drag distance (~30px) to register a mouse interaction as a "draw shape" rather than a "click to select." If the AI calculates coordinates for a small shape (e.g., 20px wide), the drag is interpreted as a click and no shape is created. CDP returns success because the mouse events were dispatched correctly.

**Why it happens:**
- Excalidraw uses a dead zone / minimum distance threshold to distinguish click from drag
- This threshold may vary by Excalidraw version
- The AI might attempt to draw precisely sized shapes without knowing about the minimum
- When drawing inside a bounded area (e.g., a frame), the AI may make shapes too small to fit

**Prevention:**
1. Enforce minimum 50px drag distance in both X and Y axes (30px is the known minimum, 50px adds safety margin)
2. Validate coordinates before dispatching cdpDrag: `abs(endX - startX) >= 50 && abs(endY - startY) >= 50`
3. Document this constraint prominently in the site guide (already partially there)
4. For small shapes needed by the diagram, draw larger and then resize programmatically

**Detection:** cdpDrag succeeds but element count does not increase.

**Phase:** Phase 1 (basic drawing).

---

### Pitfall 9: Undo/Redo Stack Corruption from Automation Actions

**What goes wrong:** Excalidraw's new undo/redo manager (v0.18.0+) uses `CaptureUpdateAction` to decide what enters the history stack. Direct API manipulation or rapid CDP events can create history entries that do not correspond to coherent user actions, making undo produce unexpected states (partial shape draws, orphaned text elements, broken bindings).

**Why it happens:**
- Each CDP mouse event (mousePressed, mouseMoved, mouseReleased) is a separate action from Excalidraw's perspective
- If automation is interrupted mid-drag (debugger detach, error, timeout), the mousePressed without a matching mouseReleased leaves Excalidraw in an inconsistent drag state
- Calling `excalidrawAPI.updateScene()` with `CaptureUpdateAction.IMMEDIATELY` after each programmatic change creates a history entry per change, not per logical operation
- Undo after automation may undo one step of a multi-step logical operation, leaving the diagram in a broken intermediate state

**Prevention:**
1. Always complete drag operations: ensure mouseReleased is sent even if an error occurs during mouseMoved steps (use try/finally)
2. If using the Excalidraw API for programmatic element creation, batch all elements in a single `updateScene()` call with `CaptureUpdateAction.IMMEDIATELY`
3. After automation completes, clear the undo history: `excalidrawAPI.history.clear()`
4. Do not mix API-based element creation with CDP-based drawing in the same workflow -- pick one approach

**Detection:** Undo produces visually broken or partially complete diagrams.

**Phase:** Phase 3 (advanced operations).

---

### Pitfall 10: Multi-Select Fails Because Shift+Click Misses Shape Centers

**What goes wrong:** To select multiple specific shapes (not all), the workflow uses Shift+click on each shape. But since shapes are rendered on canvas, `elementFromPoint()` returns the canvas element, not the shape. The AI must calculate the center of each shape from its known coordinates and use `cdpClickAt` with `shiftKey: true`. If the calculated center is even slightly off (due to Pitfall 7), the click lands on empty canvas area and deselects everything.

**Why it happens:**
- Canvas-rendered shapes have no individual DOM elements to target
- Shape positions are in Excalidraw's internal coordinate space, not viewport space
- A shift+click on empty canvas in selection mode starts a new selection box, deselecting previous selections
- The selection rubber-band must FULLY enclose shapes -- partial overlap does not select

**Consequences:**
- Multi-select operations fail, preventing alignment, grouping, and distribution
- Deselection of previously selected shapes when one click misses
- Alignment buttons do not appear because fewer than 2 shapes are selected

**Prevention:**
1. Prefer Ctrl+A when selecting all shapes (simpler, more reliable)
2. For selective multi-select, use rubber-band selection: cdpDrag from a point above-left of all target shapes to below-right of all target shapes
3. If shift+click is needed, read element positions from Excalidraw API first and calculate viewport coordinates accounting for zoom/pan
4. After multi-select, verify selection count matches expected count via API: `excalidrawAPI.getAppState().selectedElementIds`

**Detection:** Alignment toolbar buttons do not appear after multi-select attempt.

**Phase:** Phase 2 (multi-element operations).

---

### Pitfall 11: Welcome Dialog and Modals Block All Canvas Interaction

**What goes wrong:** Excalidraw shows a welcome splash screen, tips dialog, or cookie consent banner on first visit or after clearing localStorage. These modals capture keyboard focus and mouse events. All keyboard shortcuts (R, T, V) and canvas clicks are intercepted by the modal, silently failing. The AI does not detect the modal because it may not appear in the DOM snapshot viewport area or may not match expected selectors.

**Why it happens:**
- Modals use z-index layering above the canvas
- Keyboard event listeners on the modal prevent propagation to the canvas
- The modal may render after a short delay (lazy loading), so it was not present in the initial DOM snapshot
- Different Excalidraw deployments (excalidraw.com vs self-hosted) may show different modals

**Prevention:**
1. At the start of every Excalidraw session, press Escape first to dismiss any potential modal
2. Check for modal presence: `document.querySelector('[class*="Modal"], [class*="Dialog"], [class*="welcome"]')`
3. If modal found, click its close button or the overlay backdrop
4. Add a 500ms wait after navigation to excalidraw.com to let modals render before attempting dismissal
5. The site guide already documents this but the AI does not always follow it on the first iteration

**Detection:** All keyboard shortcuts and canvas clicks have no effect despite reporting success.

**Phase:** Phase 1 (session setup). Must be handled before any drawing operations.

---

### Pitfall 12: localStorage Auto-Save Interferes with Clean State Assumptions

**What goes wrong:** Excalidraw auto-saves to `localStorage` (key: `excalidraw`) and `IndexedDB`. When automation navigates to excalidraw.com, it loads the previously saved scene, not a blank canvas. If the previous session drew shapes, those shapes appear on the canvas, contaminating the new diagram. The AI may not realize the canvas is not empty.

**Why it happens:**
- Excalidraw's `LocalData` class uses debounced saves (saves shortly after any change)
- On page load, `restoreElements()` reads localStorage and IndexedDB and restores the full scene
- There is a 5MB localStorage limit, and large scenes may partially save (data corruption)
- Previous automation sessions leave their work persisted

**Consequences:**
- New automation task starts with leftover elements from previous session
- AI draws "on top of" existing shapes without realizing they exist
- Element count verification is wrong because baseline count is non-zero
- If localStorage is corrupted (partial save), Excalidraw may error on load

**Prevention:**
1. At the start of each Excalidraw automation session, clear the canvas: use `excalidrawAPI.resetScene()` or Ctrl+A then Delete
2. Alternatively, clear localStorage before navigating: `localStorage.removeItem('excalidraw')` (but this must be done from the excalidraw.com origin)
3. Always check initial element count before starting and account for it
4. If starting from a specific diagram (not blank), load it explicitly via the API

**Detection:** DOM snapshot shows elements on canvas before any drawing commands were issued.

**Phase:** Phase 1 (session setup).

---

## Minor Pitfalls

Mistakes that cause inconvenience or edge-case failures.

---

### Pitfall 13: Export Workflows Face File Dialog and Clipboard Permission Barriers

**What goes wrong:** Exporting diagrams (Save As PNG, Copy to Clipboard, Export to File) triggers browser-native file dialogs or clipboard permission prompts. Chrome extension automation cannot interact with native OS file dialogs. Clipboard write requires the `clipboard-write` permission and user gesture.

**Prevention:**
1. Use "Copy to Clipboard" with SVG/PNG instead of "Save as File" -- clipboard is accessible via CDP
2. For file export, use Excalidraw's API: `excalidrawAPI.exportToBlob()` or `excalidrawAPI.exportToSvg()` which return data programmatically without file dialogs
3. Use `navigator.clipboard.write()` in a content script with the `clipboardWrite` permission
4. Never try to automate native file picker dialogs -- they are outside Chrome's control

**Phase:** Phase 3 (export features).

---

### Pitfall 14: Arrow/Connector Routing Requires Endpoint Binding Knowledge

**What goes wrong:** Drawing an arrow between two shapes requires the arrow endpoints to land ON the target shapes (within their bounding boxes). If the arrow starts/ends in empty space near a shape but not on it, the arrow is freestanding and does not bind to the shape. Moving the shape later does not update the arrow.

**Prevention:**
1. Calculate shape center coordinates precisely before drawing arrows
2. Draw arrows starting from the center of shape A to the center of shape B -- Excalidraw's smart routing will snap to edges
3. Verify binding after drawing: check if the arrow element's `startBinding` and `endBinding` properties are non-null via the API
4. Use sufficient drag steps (15+) for smooth arrow path registration

**Phase:** Phase 2 (connectors and arrows).

---

### Pitfall 15: Natural Language to Diagram Layout Planning Is Unbounded

**What goes wrong:** When the AI interprets "draw a flowchart with 5 steps" or "create an architecture diagram," it must decide on layout coordinates (positions, spacing, sizes). Without a layout algorithm, the AI places shapes with arbitrary spacing, resulting in overlapping shapes, uneven spacing, and cramped or sprawling diagrams.

**Prevention:**
1. Define a grid system in the site guide: shapes should be placed on a grid with configurable cell size (e.g., 200px x 150px)
2. Provide layout templates for common diagram types (flowchart: vertical, architecture: horizontal layers)
3. After placing shapes, use Excalidraw's distribute/align tools to fix spacing automatically
4. Limit initial diagram complexity: prefer fewer, well-placed shapes over many cramped ones
5. Use Excalidraw's frame tool to define bounded areas, then fill them systematically

**Phase:** Phase 3 (diagram intelligence). This is an AI prompt engineering challenge, not a tools challenge.

---

### Pitfall 16: Color Picker and Property Panel Interaction Complexity

**What goes wrong:** Excalidraw's style panel (background color, stroke color, fill pattern, stroke width) uses custom dropdown/picker components that are not standard `<select>` or `<input type="color">` elements. They may use custom CSS panels with swatches, opacity sliders, or hex input fields that require multi-step interaction (click swatch button -> click color -> close picker).

**Prevention:**
1. Identify property panel selectors precisely: `[data-testid="background-color"]`, `[data-testid="stroke-color"]`
2. After clicking a color button, wait for the picker panel to appear (it may animate in)
3. Color swatches are typically buttons with background-color style -- match by color value if needed
4. For hex color input, find the text input within the picker panel and use the type tool
5. Use the Excalidraw API for color changes when possible: update element properties directly

**Phase:** Phase 2-3 (styling features).

---

## Integration Pitfalls

Pitfalls specific to integrating Excalidraw automation into FSB's existing architecture.

---

### Pitfall 17: DOM Snapshot Token Explosion from React Virtual DOM

**What goes wrong:** Excalidraw is a large React application. FSB's DOM analysis traverses the entire DOM tree and serializes it for the AI. Excalidraw's DOM includes thousands of React-generated elements (toolbar, property panels, layer UI, modals) that consume massive token counts in the AI prompt, crowding out the actual task context.

**Why it happens:**
- React generates deeply nested div structures with generated class names
- The Excalidraw layer UI (`layer-ui__wrapper`) contains the entire toolbar, property panel, and context menu structure
- Even with FSB's element filtering, Excalidraw produces 500+ interactive elements
- AI context window fills with toolbar button descriptions instead of task-relevant information

**Prevention:**
1. Implement Excalidraw-specific DOM filtering: exclude `.layer-ui__wrapper` subtree except for targeted selectors (alignment buttons, tool buttons)
2. Use the `data-testid` attributes (which Excalidraw provides) as primary selectors, filtering out elements without them
3. Limit DOM snapshot depth for Excalidraw pages
4. The site guide already notes this: "React DOM can be very large -- use targeted data-testid selectors to reduce tokens"

**Phase:** Phase 1. Essential for keeping AI responses coherent.

---

### Pitfall 18: Progress Detection Treats All Excalidraw Actions as "No Progress"

**What goes wrong:** This is the background.js side of Pitfall 2. The `madeProgress` calculation (line 11097) checks `changeSignals.channels` for structural/content/pageState changes. Canvas drawing produces NONE of these signals. The special canvas editor check (line 11103) only fires for `docs.google.com` URLs (via `isCanvasEditorUrl`). Excalidraw URLs are not covered.

**Why it happens:**
- `isCanvasEditorUrl()` (line 11074) uses a regex that only matches `docs.google.com/(spreadsheets|document|presentation)/d/`
- The `canvasUrl` regex (line 4908) in `validateCompletion` includes `excalidraw` but is a DIFFERENT check used only for completion, not progress
- Two separate functions, inconsistent coverage

**Prevention:**
1. Add Excalidraw to `isCanvasEditorUrl()`: extend the regex to include `excalidraw\.com`
2. Better: unify `isCanvasEditorUrl()` and the `canvasUrl` regex into a single shared utility
3. For Excalidraw specifically, treat successful `cdpDrag`, `cdpClickAt`, and `press_key` actions as progress indicators (same pattern as Google Sheets)

**Detection:** Sessions abort after 6 iterations with "No progress detected" despite successful drawing.

**Phase:** Phase 1. Without this fix, multi-step Excalidraw tasks always abort.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Session setup | Pitfall 11 (modals), Pitfall 12 (localStorage) | Press Escape first, clear canvas on start |
| Basic shape drawing | Pitfall 5 (auto-switch), Pitfall 7 (coordinates), Pitfall 8 (minimum drag) | Re-press tool key, reset zoom, enforce 50px minimum drag |
| Text entry | Pitfall 1 (transient textarea), Pitfall 3 (isCanvasBasedEditor) | Wait for textarea mount, expand canvas editor detection |
| Canvas state verification | Pitfall 2 (no DOM reflection), Pitfall 18 (progress detection) | Use Excalidraw API, expand isCanvasEditorUrl |
| Multi-element operations | Pitfall 10 (shift+click misses), Pitfall 6 (canvas clear) | Prefer Ctrl+A or rubber-band, use Delete not Backspace |
| Styling and properties | Pitfall 16 (custom pickers) | Use data-testid selectors, wait for picker panels |
| Connectors and arrows | Pitfall 14 (endpoint binding) | Draw center-to-center, verify binding via API |
| Export | Pitfall 13 (file dialogs) | Use API export, avoid native file pickers |
| Diagram intelligence | Pitfall 15 (layout planning) | Grid system, templates, align/distribute tools |
| Debugger management | Pitfall 4 (attachment conflicts) | Shared debugger manager, retry logic |
| Undo/redo | Pitfall 9 (history corruption) | Complete all drags, batch API updates, clear history |
| DOM performance | Pitfall 17 (token explosion) | Filter React DOM, use data-testid selectors |

---

## Codebase-Specific Fix Locations

For developer reference, these are the exact code locations that need modification:

| Fix | File | Line(s) | Change |
|---|---|---|---|
| Add Excalidraw to canvas editor detection | `content/messaging.js` | 217-225 | Add hostname check for excalidraw.com |
| Add Excalidraw to progress tracking | `background.js` | 11074-11077 | Expand `isCanvasEditorUrl()` regex |
| Unify canvas URL detection | `background.js` | 4908 + 11074 | Merge into shared utility |
| Text entry for transient textarea | `content/actions.js` | 2117-2336 | Add Excalidraw textarea detection path |
| CDP debugger conflict handling | `background.js` | 12267-12358 | Add shared debugger lock/manager |
| DOM snapshot filtering for Excalidraw | `content/dom-analysis.js` | varies | Filter .layer-ui__wrapper subtree |

---

## Sources

- FSB codebase analysis: `content/actions.js`, `content/messaging.js`, `background.js`, `site-guides/design/excalidraw.js`, `utils/action-verification.js`
- [Excalidraw state management](https://dev.to/karataev/excalidraw-state-management-1842) - MEDIUM confidence
- [Excalidraw text rendering and font management (DeepWiki)](https://deepwiki.com/excalidraw/excalidraw/5.3-text-elements-and-text-rendering) - MEDIUM confidence
- [Excalidraw textWysiwyg.tsx source](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/wysiwyg/textWysiwyg.tsx) - HIGH confidence (verified textarea element creation)
- [Excalidraw localStorage persistence](https://github.com/excalidraw/excalidraw/issues/10255) - MEDIUM confidence
- [Excalidraw localStorage autosave discussion](https://github.com/excalidraw/excalidraw/discussions/6463) - MEDIUM confidence
- [Excalidraw undo/redo v0.18.0 release](https://github.com/excalidraw/excalidraw/releases/tag/v0.18.0) - HIGH confidence
- [Chrome DevTools Protocol Input domain](https://chromedevtools.github.io/devtools-protocol/tot/Input/) - HIGH confidence
- [CDP Input.insertText focus issues](https://github.com/ChromeDevTools/devtools-protocol/issues/45) - MEDIUM confidence
- [Canvas automation testing challenges (PixiJS discussion)](https://github.com/pixijs/pixijs/discussions/10788) - LOW confidence (different canvas lib but same fundamental problem)
- [Excalidraw MCP server for programmatic canvas interaction](https://github.com/yctimlin/mcp_excalidraw) - MEDIUM confidence
