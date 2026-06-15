---
status: resolved
trigger: "AI cannot see Google Sheets cell content despite plan 24-05 fix"
created: 2026-03-09T00:00:00Z
updated: 2026-06-15
---

## Current Focus

hypothesis: The formula bar element is NOT being picked up by the contenteditable capture in formatInlineRef because of TWO separate pipeline gaps
test: Code analysis of the full snapshot pipeline
expecting: Structural reasons why the code never fires for the formula bar
next_action: Document root causes and fix directions

## Symptoms

expected: After plan 24-05, the AI should see cell content in the formula bar as `= "value"` in the snapshot
actual: AI is still blind to sheet content - no improvement after the fix
errors: None reported (silent failure)
reproduction: Open any Google Sheets spreadsheet, select a cell with content, take snapshot - formula bar value not shown
started: Always broken; plan 24-05 was supposed to fix it

## Eliminated

- hypothesis: formatInlineRef contenteditable capture code is missing or has wrong syntax
  evidence: Code exists at dom-analysis.js:2061-2068, checks `contenteditable === 'true' || isContentEditable`, reads `innerText` - syntax is correct
  timestamp: 2026-03-09

- hypothesis: The code is dead/unreachable in all cases
  evidence: The code IS reachable for elements that are contenteditable AND in the interactiveSet. The issue is that Sheets formula bar may not meet BOTH conditions.
  timestamp: 2026-03-09

## Evidence

- timestamp: 2026-03-09
  checked: Stage 1 candidate collection in getFilteredElements (dom-analysis.js:1753-1758)
  found: querySelectorAll includes `[contenteditable="true"]` - so formula bar WOULD be collected IF it has that attribute. Google Sheets formula bar (`#t-formula-bar-input` / `.cell-input`) is a contenteditable div, so it should be collected.
  implication: Formula bar likely enters the candidate pool.

- timestamp: 2026-03-09
  checked: Stage 1b canvas editor injection (dom-analysis.js:1764-1778)
  found: Canvas editor injection ONLY adds `.kix-page-column`, `.kix-appview-editor`, `.docs-title-input` - these are Google DOCS elements, NOT Sheets-specific elements. The formula bar and name box are NOT injected here.
  implication: Sheets formula bar relies entirely on the standard querySelectorAll collection path.

- timestamp: 2026-03-09
  checked: Stage 2 visibility filtering (dom-analysis.js:1781-1805)
  found: Standard visibility checks apply. Google Sheets formula bar, when no cell is being edited, may have aria-hidden="true" or display:none on the contenteditable input. The formula bar container is visible but the actual contenteditable input element may only be "active" (visible, contenteditable) when a cell is being edited.
  implication: CRITICAL - The formula bar contenteditable div may be filtered out by visibility checks when not in edit mode. When just viewing (cell selected but not being edited), the formula bar shows content via a DIFFERENT mechanism (possibly a plain text span overlay, not the contenteditable div).

- timestamp: 2026-03-09
  checked: aria-hidden filtering in both getFilteredElements AND isVisibleForSnapshot
  found: Both Stage 2 visibility filter (line 1802) and walkDOM's isVisibleForSnapshot (line 1972) reject elements with aria-hidden="true". Google Sheets commonly uses aria-hidden on the formula bar input when it's not active (not in edit mode). This means the formula bar contenteditable is filtered out TWICE.
  implication: ROOT CAUSE #1 - The formula bar contenteditable div is likely aria-hidden="true" when just viewing a cell (not editing). The contenteditable capture code at line 2062 never fires because the element is excluded before it gets there.

- timestamp: 2026-03-09
  checked: walkDOMToMarkdown visit logic (dom-analysis.js:2144-2153)
  found: Interactive elements in interactiveSet get formatInlineRef called AND THEN their children are SKIPPED ("return; // Don't recurse into interactive element children"). But the formula bar has a complex nested DOM structure. If a PARENT element is in the interactiveSet (like a toolbar container or the formula bar wrapper), the actual contenteditable child with the text would be skipped entirely.
  implication: ROOT CAUSE #2 - Even if the formula bar contenteditable passes visibility, it may not be in interactiveSet itself. If a parent is in interactiveSet, child text is skipped. If neither the element nor a parent is interactive, it would just be text content (but may still be hidden by aria-hidden/visibility).

- timestamp: 2026-03-09
  checked: Google Sheets formula bar DOM structure (from selectors in site guide and actions.js)
  found: The site guide references `#t-formula-bar-input` and `.cell-input`. Actions.js toolbar bypass also references these. The formula bar in Google Sheets has a complex structure: a container div, an inner contenteditable div, and often uses aria-hidden to toggle visibility between view mode and edit mode. When you select a cell (not editing), the formula bar shows content via a non-editable display layer. The contenteditable div becomes active only when you click into the formula bar or press F2.
  implication: The contenteditable capture was designed assuming the formula bar contenteditable is always visible and contains the cell content. In reality, Google Sheets has TWO states: (1) view mode - cell selected, formula bar shows content in a non-contenteditable display element, contenteditable div may be hidden/aria-hidden, (2) edit mode - contenteditable div is active and contains the content. The fix only works in edit mode, which is NOT the normal snapshot-taking state.

- timestamp: 2026-03-09
  checked: Site guide guidance text (google-sheets.js:48-50)
  found: Guide says "The formula bar element shows the content of the currently selected cell. After navigating to a cell, check the formula bar ref in the snapshot for its value (shown as = 'value' in the element ref)."
  implication: The guide PROMISES the AI will see the value, but the pipeline cannot deliver because of the structural DOM issues above.

## Resolution

root_cause: |
  **TWO ROOT CAUSES preventing AI from seeing Sheets cell content:**

  **Root Cause 1: Google Sheets formula bar dual-state DOM**
  The Google Sheets formula bar has two DOM states:
  - **View mode** (cell selected, not editing): The cell content is displayed in a non-contenteditable
    element (likely a plain text span or div). The actual contenteditable div (`#t-formula-bar-input` /
    `.cell-input`) may be aria-hidden="true", display:none, or have zero dimensions.
  - **Edit mode** (F2 pressed or formula bar clicked): The contenteditable div becomes visible and active,
    containing the cell content as editable text.

  The contenteditable capture code (dom-analysis.js:2061-2068) ONLY works in edit mode. Snapshots are
  taken in view mode, so the code never fires.

  **Root Cause 2: No Sheets-specific element injection in Stage 1b**
  The canvas editor injection (dom-analysis.js:1764-1778) only injects Google DOCS elements
  (.kix-page-column, .kix-appview-editor, .docs-title-input). There are NO Sheets-specific injections
  for the formula bar or name box. These elements rely on the generic querySelectorAll path, which
  depends on them having contenteditable="true" attribute AND passing visibility filters.

  **Root Cause 3: Multiple exclusion gates**
  Even if the formula bar element exists in DOM, it is filtered out by:
  1. Stage 2 visibility: aria-hidden="true" check (line 1802)
  2. isVisibleForSnapshot: aria-hidden="true" check (line 1972)
  3. isVisibleForSnapshot: zero-dimension check (line 1991)
  Any ONE of these gates kills the element before formatInlineRef ever runs.

  **Summary:** The plan 24-05 fix added code to capture contenteditable innerText, but that code
  is structurally unreachable for Google Sheets because the formula bar's contenteditable div is
  hidden/inactive during normal snapshot-taking. The fix addressed the wrong layer of the problem.

fix_direction: |
  **Recommended fix approach (in priority order):**

  1. **Add Sheets-specific element injection in Stage 1b** (like Google Docs has):
     Add formula bar and name box to canvasEditorSelectors when on Google Sheets:
     ```javascript
     // When on Sheets (check pathname for /spreadsheets/)
     { selector: '#t-formula-bar-input, .cell-input', role: 'formula-bar', label: 'Formula bar (shows selected cell content)' },
     { selector: '#t-name-box, .waffle-name-box', role: 'name-box', label: 'Name Box (cell reference)' }
     ```
     AND bypass aria-hidden/visibility filters for these injected elements (like fsbRole bypass at line 1794).

  2. **Read formula bar content regardless of contenteditable state**:
     In formatInlineRef, for elements with data-fsbRole === 'formula-bar', read content from:
     - The contenteditable div's innerText (edit mode)
     - OR the display span's textContent (view mode)
     - OR use a direct DOM query for the formula bar text container
     The key insight: the formula bar ALWAYS shows cell content somewhere in its DOM subtree,
     just not always in the contenteditable div.

  3. **Alternative: Use getText action in site guide workflow**:
     Instead of relying on the snapshot pipeline, the site guide could instruct the AI to use
     the `getText` action on the formula bar element after navigating to a cell. This is already
     partially described in the guide but is not a passive snapshot solution.

  **Enhanced logging recommendations:**
  - In getFilteredElements Stage 1, log when Sheets formula bar selectors are found in DOM
  - In Stage 2, log when elements with known guide selectors are filtered out (and why)
  - In walkDOMToMarkdown, log when visiting nodes near the formula bar region
  - In formatInlineRef, log when contenteditable check triggers (or doesn't)
  - Add a debug mode that dumps all aria-hidden elements that match site guide selectors

verification: not yet verified
files_changed: []

## Resolution

Resolved by archived v10.0 Google Sheets follow-up work. `.planning/milestones/v10.0-ROADMAP.md`
records Phase 24 gap closure for Sheets Stage 1b injection, formula bar
content reading, and enhanced pipeline logging; Phase 25 then shipped
snapshot pipeline fixes so formula bar content and name box refs appear
regardless of DOM visibility and parent filtering; Phase 26 added selector
resilience and diagnostics for empty formula bar/name box visibility.
