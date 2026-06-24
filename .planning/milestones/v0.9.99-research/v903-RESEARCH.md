# v9.0.3 Research -- Token Optimization & Reconnaissance Revamp

**Researched:** 2026-02-18
**Milestone:** v9.0.3

## Phase 1: Token Optimization & Site Guide Restructuring

### JSON vs YAML Verdict: Stay with JSON

Research conclusively showed YAML is NOT better than minified JSON for LLM communication:
- Minified JSON uses 6-19% FEWER tokens than YAML (confirmed by 5+ independent sources)
- No LLM provider offers guaranteed YAML output (all offer JSON structured output mode)
- FSB's input prompts are already plain text, not JSON -- only AI responses use JSON
- YAML would require 39KB js-yaml dependency and complete rewrite of 600+ lines of parsing code
- Cost savings would be ~$0.001 per session -- negligible

Sources: Wayne Workman tokenization analyzer, Nathaniel Thomas format comparison, Matt Rickard analysis, TOON benchmarks (o200k_base), StructEval paper

### Token Waste Audit Findings

Four parallel audits identified ~40-60% token reduction possible without quality loss.

#### Tier 1: Massive Wins, Easy Changes

1. **Strip stale DOM from conversation history** (6,000-18,000 tokens/call)
   - Old user turns carry full [PAGE_CONTENT] blocks completely superseded by current state
   - Fix: In updateConversationHistory(), regex-replace PAGE_CONTENT blocks before storing
   - File: ai-integration.js lines 776-808

2. **Strip verbose response fields from history** (600-2,400 tokens/call)
   - situationAnalysis, goalAssessment, assumptions, confidence, fallbackPlan stored but never read back
   - Only reasoning, actions, taskComplete, result are needed in history
   - Fix: Store slim response object in conversationHistory
   - File: ai-integration.js lines 776-808

3. **Enable JSON structured output mode** (300-500 tokens + eliminates retries)
   - response_format: {"type": "json_object"} is NEVER set despite all providers supporting it
   - Eliminates: format instructions (~300 tokens), model-specific instructions (~140 tokens), retry text
   - Guarantees valid JSON (eliminates entire parse failure class)
   - File: universal-provider.js line 145 (OpenAI), line 236 (Gemini), line 282 (Anthropic)

4. **Fix temperature from 0.7 to 0.1** (fewer retries)
   - universal-provider.js sends temperature: 0.7, legacy path uses 0.1
   - High temperature causes creative JSON malformation
   - File: universal-provider.js line 170

5. **Remove duplicate tool registry** (~800 tokens on first iteration)
   - TOOL_DOCUMENTATION constant (lines 15-99) duplicates allTools in getToolsDocumentation()
   - Dead code -- remove TOOL_DOCUMENTATION constant
   - File: ai-integration.js lines 15-99

#### Tier 2: High Impact, Medium Effort

6. **Eliminate triple element representation** (1,500-3,000 tokens/call)
   - Same elements appear in: (a) element list, (b) HTML context relevantElements, (c) semantic context KEY ELEMENTS BY PURPOSE
   - Fix: Use single compact snapshot as sole element representation
   - Files: ai-integration.js formatElements(), formatHTMLContext(), formatSemanticContext()

7. **Drop relevantElements from HTML context** (500-2,000 tokens/call)
   - Raw HTML of each element sent alongside already-parsed element data
   - AI gains nothing from seeing <button id="sign-in" class="btn">Sign In</button> when it has [e1] button "Sign In" #sign-in
   - Fix: Remove relevantElements from extractRelevantHTML(); keep only pageStructure
   - File: content.js lines 10592-10752

8. **Remove position data at (x, y)** (200-500 tokens/call)
   - Exact pixel positions for every element but AI never uses coordinates (uses refs)
   - Only [off-screen] flag matters
   - Fix: Remove position from formatElements() non-heavy mode
   - File: ai-integration.js lines 2822-2825

9. **Remove selectors when ref system active** (500-1,500 tokens/call)
   - CSS selectors like selector: "div.container > input[type='text']" are 80+ chars per element
   - AI uses ref: "e1" -- selectors resolved internally
   - Fix: Strip selectors from formatElements() when refMap active
   - File: ai-integration.js lines 2830-2835

10. **Cap and restructure site guides** (2,000-10,000 tokens/call)
    - social.js is 42K chars (~12,000 tokens) -- ALL injected regardless of which platform
    - LinkedIn dominates 65%, YouTube 15%, Twitter 10%, rest are stubs
    - Triple redundancy: guidance prose contains selectors that are also in selectors object AND workflows
    - Fix: Split into per-website files (see below)

11. **Compress section headers** (200-400 tokens/call)
    - "=== PAGE UNDERSTANDING ===" (27 chars) vs "[PAGE]" (6 chars) across 15+ sections
    - Fix: Use compact bracketed headers

#### Tier 3: Structural Improvements

12. **Slim down system prompt** (700-1,400 tokens on first iteration)
    - Security rules (900 chars) says same thing 5 ways
    - Reasoning framework (900 chars) redundant with response format fields
    - Tool preferences (600 chars) has unnecessary sub-explanations
    - Fix: Consolidate repetitive sections

13. **Use 4-field response format on continuations** (~100-150 output tokens x14 iterations)
    - Drop situationAnalysis, goalAssessment, assumptions, fallbackPlan from continuation format
    - Already done in MINIMAL_CONTINUATION_PROMPT but AI still generates them
    - Fix: Explicitly tell AI to use compact format on continuations

14. **Conditional prompt sections** (200-600 tokens/call)
    - Code editor rules only needed for coding
    - Login rules only needed on login pages
    - Output formatting (charts/mermaid) only needed near completion
    - Google selectors only needed on Google
    - Fix: Inject conditionally based on page type/task state

15. **Remove formatPageStructureSummary()** (200-500 tokens)
    - Duplicates what's already visible in element list
    - Fix: Remove entirely or replace with one-line summary

16. **Remove compaction API call** (saves 1 API round-trip per session)
    - Session memory + local fallback already capture same info
    - Fix: Use local extractive fallback only

17. **Skip unused data collection in content.js** (CPU/memory savings)
    - getVisualProperties(), getElementCluster(), getARIARelationships() computed per element but never reach prompt
    - Fix: Gate behind debug flag

#### Total Session Impact

| Metric | Current | After Optimization | Reduction |
|--------|---------|-------------------|-----------|
| Input tokens/session (15 iter) | ~55,000-80,000 | ~25,000-40,000 | 45-55% |
| Output tokens/session | ~8,000-15,000 | ~6,000-10,000 | 25-33% |
| Cost/session (grok-4-1-fast) | ~$0.015-0.020 | ~$0.007-0.011 | ~50% |
| Cost/session (GPT-4o) | ~$0.22-0.30 | ~$0.10-0.16 | ~50% |
| Parse failures | ~5-10% of calls | ~0% (JSON mode) | Eliminated |

### Site Guide Restructuring

**Current state:** 9 category-based files totaling 124K chars. social.js alone is 42K.

**Problem:** Visit Amazon, get eBay/Walmart/Target selectors. Visit LinkedIn, get YouTube/Twitter/Instagram content. Every category file dumps ALL platform content regardless of which site is visited.

**Solution:** Per-website site guide files.

Split plan:
- social.js (42K) -> linkedin.js, youtube.js, twitter.js, social-other.js
- ecommerce.js (7K) -> amazon.js, ecommerce-other.js
- productivity.js (17K) -> google-sheets.js, google-docs.js, productivity-other.js
- email.js (6K) -> gmail.js, outlook.js, email-other.js
- coding.js (13K) -> github.js, coding-other.js
- career.js (8K) -> keep as-is or split by major job sites
- finance.js (9K) -> keep as-is or split
- travel.js (9K) -> keep as-is or split
- gaming-platforms.js (6K) -> keep as-is or split

Within each file:
- Deduplicate selectors (currently appear in guidance prose AND selectors object AND workflows)
- Remove generic workflow steps the AI already knows
- Keep only site-specific intelligence (framework quirks, selector instability warnings, etc.)

No architecture changes needed -- registerSiteGuide() and getGuideForUrl() already support multiple guides with URL patterns.

---

## Phase 2: Reconnaissance Revamp -- AI-Refined Dynamic Site Intelligence

### Current State

FSB has a reconnaissance system spread across:
- **Site Explorer** (utils/site-explorer.js, 670 lines) -- BFS crawler that maps site structure
- **Explorer Data Collection** (content.js lines 12465-12688) -- per-page recon: nav, headings, layout, links, key selectors, loading patterns
- **DOM Snapshots** (automation-logger.js) -- full DOM snapshots stored per session
- **Memory System** (lib/memory/) -- episodic/semantic/procedural memories from sessions

### Critical Gap

Explorer data is stored in chrome.storage.local for manual review on the options page. It is NEVER fed back into the automation loop. The AI never sees recon data.

Meanwhile, static site guides provide hardcoded selectors that could have been auto-discovered.

### Proposed Architecture: AI-Refined Site Intelligence

The idea: reconnaissance collects raw page data -> sends to AI (Grok) for refinement -> stores as structured site intelligence profiles -> profiles are injected into automation prompts like dynamic site guides.

Pipeline:
1. Reconnaissance collects raw data (existing explorerExtractKeySelectors, explorerExtractNavigation, etc.)
2. Raw data is sent to AI (Grok-4-1-fast or similar) with a refinement prompt
3. AI produces structured site intelligence (stable selectors, page type classifications, workflow hints, warnings)
4. Stored in chrome.storage.local as structured site profiles
5. During automation, _buildDynamicGuidance() reads profile for current domain and injects relevant intelligence

### What Recon Already Collects

Per page (from collectExplorerData in content.js):
- Navigation: nav elements with links, menus, breadcrumbs
- Headings: h1-h6 with text, id, selector
- Layout: header/footer/sidebar/main/search/form regions
- Internal links: same-domain links with URL, text, selector
- Key selectors: data-testid (high reliability), stable IDs (medium), aria-label (medium)
- Loading patterns: spinners, loaders, aria-busy elements

From getStructuredDOM:
- All interactive elements with multi-strategy selectors (scored 2-11)
- Page context: type, state, intent, primary actions
- Form signatures
- E-commerce product data

### What the AI Refinement Step Produces

Input to AI: raw recon data for a page
Output from AI: structured site intelligence

```javascript
{
  domain: "linkedin.com",
  pages: {
    "/feed": {
      type: "feed",
      stableSelectors: { postComposer: { sel: "[data-testid='share-box']", score: 95 } },
      navigation: ["/messaging", "/mynetwork", "/jobs"],
      framework: "ember",
      warnings: ["SPA navigation", "Lazy-loads on scroll"]
    }
  },
  workflows: { sendMessage: ["navigate /messaging", "click compose", "type recipient", "type message", "click send"] },
  warnings: ["reCAPTCHA v3 scoring iframe (not interactive)", "Dual UI systems"]
}
```

### Selector Stability Scoring

Discovered selectors scored by reliability:
- data-testid / data-test / data-cy: 95
- Stable id (not auto-generated): 85
- aria-label: 80
- role + aria combination: 75
- name attribute (form elements): 70
- Semantic tag + class: 50
- Structural/positional: 15-30
- Auto-generated classes (css-*, sc-*): 10

### Cache Strategy

- Storage: chrome.storage.local (10MB, expandable with unlimitedStorage permission)
- Key: domain name
- Invalidation: structure hash change or selector failure
- TTL: 7 days for navigation, 24 hours for selectors, immediate on failure
- Eviction: LRU by lastVisit timestamp

### Industry Context

- browser-use: 5-stage DOM pipeline with accessibility tree, indexed refs, per-step analysis
- Skyvern: vision-first, no cached selectors, remaps by intention
- Playwright MCP: accessibility tree snapshots, YAML-like format for input
- Agent-E: custom mmid attributes injected per page
- None do persistent cross-session site profiling -- this is a differentiator for FSB

### Key Insight

No major browser agent does upfront site-wide reconnaissance with persistent profiles. They all use observe-act-observe per step. FSB's site explorer already does more than competitors. The missing piece is closing the loop: recon data -> AI refinement -> cached intelligence -> prompt injection.

---

## Milestone Scope Summary

**Phase 1:** Token Optimization & Site Guide Restructuring
- All Tier 1-3 optimizations from the audit
- Split category-based site guides into per-website files
- Deduplicate triple-redundant content within guides
- Enable provider JSON structured output mode
- Target: 40-55% reduction in token usage per session

**Phase 2:** Reconnaissance Revamp -- AI-Refined Dynamic Site Intelligence
- Recon data sent to AI (Grok) for structured refinement
- Site intelligence profiles stored and cached per domain
- Dynamic guide injection into automation prompts
- Selector stability scoring and cross-session learning
- Over time, dynamic profiles supplement/replace static guides

---
*Research completed: 2026-02-18*
*Ready for requirements: pending Phase 2 details on AI refinement*
