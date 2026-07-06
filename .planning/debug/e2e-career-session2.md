---
status: resolved
trigger: "Analyze New E2E Career Search Session Log"
created: 2026-02-24T02:00:00Z
updated: 2026-06-15
session_file: logs/sessions/fsb-session-2026-02-24-1771897409695.json
---

# E2E Career Search Session Analysis (Session 2)

**Session ID:** session_1771897409695
**Duration:** 5m 6s (306,356ms) -- ended by TIMEOUT at 300s limit
**Status:** timeout (session time limit exceeded)
**Total Iterations:** 6 (across Microsoft search phase + Amazon phase + Sheets phase)
**Total Recorded Actions:** 3 (storeJobData, navigate, scroll)
**Model:** grok-4-1-fast via xAI

---

## Full Timeline

### Phase 1: Initialization (01:43:29 - 01:43:36)

| Time | Event | Details |
|------|-------|---------|
| 01:43:29 | Task received | "Find software engineer internship jobs at Microsoft and Amazon and put them in a Google Sheet" |
| 01:43:29 | Multi-site orchestration initialized | Companies: [Microsoft, Amazon], rewritten task: "Find software engineer internship jobs at Microsoft" |
| 01:43:29 | Session created | Tab 695749991 (on amazon.com), session_1771897409695 |
| 01:43:36 | Content script ready | After ~7s wait |
| 01:43:36 | Iteration 1 starts | On amazon.com homepage, 71 DOM elements |

### Phase 2: Microsoft Career Search (01:43:36 - 01:45:43) -- SUCCESS

| Time | Event | Details |
|------|-------|---------|
| 01:43:36 | Task type detected | career, no site guide, multi-site directive injected (Microsoft, 0/2) |
| 01:43:36 | AI prompt built | System prompt 18,154 chars, user prompt 7,465 chars |
| 01:43:48 | **Iteration 1 AI response** | navigate to https://careers.microsoft.com/ (12.3s LLM call) |
| 01:43:48 | Navigate succeeded | amazon.com -> careers.microsoft.com |
| 01:43:52 | **Iteration 2 starts** | On careers.microsoft.com/v2/global/en/home.html (17 elements) |
| 01:43:52 | Health check recovery | 1st attempt failed, 2nd succeeded (2s recovery) |
| 01:43:58 | **Iteration 2 AI response** | type "software engineer internship" + click Find Jobs (5.9s LLM) |
| 01:43:58 | Type succeeded | Text entered in job search field |
| 01:44:03 | **Click FAILED** | "Unknown ref e2" -- stale ref after page navigation from type+search |
| 01:44:04 | **Iteration 3 starts** | Now on apply.careers.microsoft.com with search results (36 elements) |
| 01:44:04 | URL changed | careers.microsoft.com -> apply.careers.microsoft.com (search results loaded despite stale click) |
| 01:44:35 | **Iteration 3 AI response** | getText(e8), getText(e30), scroll(down) -- extracting job details |
| 01:44:35 | getText e8 succeeded | "Software Engineer: Internship Opportunities - Neurodiversity Hiring Program, China, Beijing, Beijing + 2 more, Posted a month ago" |
| 01:44:35 | getText e30 succeeded | "Software Engineer: Internship Opportunities - Ignite Program for People with Disabilities, Egypt, Cairo, Posted a month ago" |
| 01:44:35 | Scroll succeeded | scrollY 0 -> 896 |
| 01:44:54 | **Iteration 4 AI response** | getText(e8), getText(e30), scrollToElement(e37) -- re-reading + scroll to 3rd job |
| 01:44:54 | getText e8 | "Neurodiversity Hiring Program" (truncated due to viewport change) |
| 01:44:54 | getText e30 | "Software Engineer 2 - Frontend" (different text -- element changed after scroll) |
| 01:44:54 | scrollToElement(e37) succeeded | CTJ Top Secret internship now visible |
| 01:45:17 | **Iteration 5 AI response** | getText(e1), getText(e2), getText(e3) -- final extraction |
| 01:45:17 | getText e1 | "software engineer internship" (search box text, not job card!) |
| 01:45:43 | **Iteration 6 AI response** | **storeJobData called** for Microsoft (3 jobs) |
| 01:45:43 | storeJobData succeeded | 3 jobs: Neurodiversity, Ignite, CTJ Top Secret |
| 01:45:43 | Completion validated | Score 0.55, approved=true |
| 01:45:43 | **Microsoft phase COMPLETE** | Page stability verified |

**Microsoft Phase Assessment:** WORKED. Successfully navigated to careers.microsoft.com, searched, extracted 3 internship listings, and called storeJobData. Minor issues: stale ref on iteration 2 click (recovered), some getText hits on wrong elements due to DOM dynamism. Total time: ~2m 7s.

### Phase 3: Amazon Career Search (01:45:43 - 01:46:27) -- FAILED (Critical Bug)

| Time | Event | Details |
|------|-------|---------|
| 01:45:43 | Launching Amazon search | Task rewritten: "Find software engineer internship jobs at Amazon" |
| 01:45:44 | **Iteration 1 starts** | STILL ON MICROSOFT CAREERS PAGE (apply.careers.microsoft.com) |
| 01:45:44 | API call | Task says "Amazon" but DOM shows Microsoft careers |
| 01:45:44 | Multi-turn conversation | History from Microsoft phase carried over (compacted) |
| 01:46:12 | **AI response** | getStoredJobs({}) + taskComplete=true -- AI THINKS MICROSOFT TASK IS STILL IN PROGRESS |
| 01:46:12 | AI reasoning | "Find/store software engineer internship jobs at **Microsoft** (company 1/2)" -- WRONG COMPANY |
| 01:46:12 | Completion blocked | Score 0.45, needs 0.5+ for career type |
| 01:46:12 | Stuck counter = 1 | |
| 01:46:26 | **Iteration 2 AI response** | taskComplete=true, no actions |
| 01:46:26 | AI reasoning | Still says "Microsoft (1/2)" -- never understood it should search Amazon |
| 01:46:26 | Completion validated | Score 0.7, approved=true |
| 01:46:27 | **Amazon phase "COMPLETE"** | But the result preview shows MICROSOFT jobs, not Amazon! |
| 01:46:27 | **FALLBACK triggered** | "AI did not call storeJobData -- attempting fallback parse" |
| 01:46:27 | Fallback storeJobData | Parsed 3 "Amazon" jobs from result text -- BUT THESE ARE MICROSOFT JOBS tagged as Amazon! |
| 01:46:27 | Dedup runs | 6 total -> 3 after dedup (removed 3 duplicates) -- because "Amazon" jobs were identical to Microsoft jobs |

**Amazon Phase Assessment:** COMPLETELY FAILED.

Root causes:
1. **No navigation to Amazon careers**: The AI was never directed to navigate away from Microsoft's careers page. The multi-site orchestration reused the same tab showing Microsoft results.
2. **Stale conversation context**: The multi-turn conversation history was compacted but still carried Microsoft context. The AI's reasoning explicitly says "Microsoft (company 1/2)" even though the task prompt said "Amazon."
3. **No site guide for Amazon**: Unlike Microsoft (which had a known careers URL), Amazon had no site guide directive telling the AI to navigate to amazon.jobs.
4. **Fallback stored duplicate data**: The fallback parser extracted Microsoft jobs from the AI result text and tagged them as "Amazon", creating duplicates that dedup correctly removed, leaving only 3 Microsoft jobs total.

### Phase 4: Sheets Data Entry (01:46:27 - 01:48:36) -- PARTIAL (Timed Out)

| Time | Event | Details |
|------|-------|---------|
| 01:46:27 | Sheets orchestration starts | 6 rows (3 Microsoft + 3 "Amazon" duplicates), 6 columns |
| 01:46:27 | Sheets session launched | maxIterations=30, target=new sheet |
| 01:46:49 | **Iteration 1 AI response** | taskComplete=true, no actions -- AI STILL THINKS IT'S DOING CAREER SEARCH |
| 01:46:49 | Completion blocked | Score 0.35 (taskType changed to "form", needs higher threshold) |
| 01:47:16 | **Iteration 2 AI response** | storeJobData again for Microsoft -- STILL confused, not entering Sheets data |
| 01:47:16 | Completion blocked | Score 0.30 |
| 01:47:31 | **Iteration 3 AI response** | taskComplete=true, no actions |
| 01:47:31 | Completion blocked | Score 0.45 |
| 01:47:33 | Stuck counter = 3 | Recovery triggered (severity: low, 0 strategies applied) |
| 01:47:33 | **Fresh system prompt rebuilt** | Multi-site directive + Sheets data entry directive BOTH injected |
| 01:47:49 | **Iteration 4 AI response (with fresh prompt)** | FINALLY navigates to https://docs.google.com/spreadsheets/create |
| 01:47:49 | Navigate succeeded | microsoft careers -> Google Sheets |
| 01:47:57 | Health check recovery | 2s (content script re-injection after cross-domain nav) |
| 01:47:57 | Navigation confirmed | Now on https://docs.google.com/spreadsheets/d/1pvPCLjPV1W3n9OTuMqJNou3cxMU5bRFONviVDyo0sbg/edit |
| 01:48:16 | **Iteration 5 AI response** | Tried type + key("Tab") actions -- but "key" tool validation FAILED |
| 01:48:16 | Validation error | tool "key" marked as invalid twice |
| 01:48:16 | Retry 1/3 | "Invalid response structure: missing required fields" |
| 01:48:34 | **Retry AI response** | scroll(up, max) -- conservative fallback |
| 01:48:35 | Scroll succeeded | Already at top of Sheets page |
| 01:48:36 | **SESSION TIMEOUT** | 306,356ms > 300,000ms limit. Session ended. |

**Sheets Phase Assessment:** MOSTLY FAILED. Created a new Google Sheet successfully but never entered any data. 3 of 4 iterations were wasted because the AI was still confused from the career search context. When it finally got the right prompt (iteration 4), it navigated to Sheets but the first data entry attempt used an invalid "key" tool, and after retry only managed a scroll before timeout.

### Phase 5: Formatting -- NEVER REACHED

Formatting auto-trigger was never reached because data entry never completed.

---

## Issues Found (Ranked by Severity)

### CRITICAL: Amazon Search Never Executed (Multi-Site Handoff Bug)

**What happened:** When the multi-site orchestrator advanced from Microsoft (index 0) to Amazon (index 1), the AI was given a new task ("Find software engineer internship jobs at Amazon") but:
- The tab was still showing Microsoft careers search results
- The conversation history was compacted but still retained Microsoft context
- No explicit directive told the AI to navigate to Amazon's careers site
- The AI's reasoning explicitly referenced "Microsoft (company 1/2)" -- it never understood the company switch

**Evidence:**
- LOG[344]: API call task = "Find software engineer internship jobs at Amazon"
- LOG[360]: AI reasoning says "Microsoft (company 1/2)" and "storeJobData confirmed via unchanged page"
- LOG[415]: Amazon result preview shows "**Microsoft** Software Engineer Internship Jobs"
- LOG[416]: "AI did not call storeJobData" fallback triggered
- LOG[419]: Dedup removed 3 duplicates (all "Amazon" jobs = Microsoft jobs)

**Root cause candidates:**
1. Multi-turn conversation history from Microsoft phase is being carried forward into the Amazon phase. The compacted summary likely describes Microsoft results, overpowering the new task directive.
2. The multi-site directive for company 2 may not have been injected into the system prompt for the Amazon phase iterations (only seen at iteration 4 during Sheets stuck recovery: LOG[577]).
3. No "NAVIGATE TO AMAZON CAREERS NOW" instruction was added when transitioning companies.

### HIGH: Sheets Data Entry Consumed by Stale Career Context (3 wasted iterations)

**What happened:** After Sheets orchestration launched, the first 3 iterations (01:46:27 - 01:47:33) were completely wasted because the AI still believed it was doing a career search task:
- Iteration 1: Said taskComplete=true (career search mindset)
- Iteration 2: Called storeJobData AGAIN for Microsoft
- Iteration 3: Said taskComplete=true again

Only after stuck detection hit counter=3 and a fresh system prompt was built (with explicit Sheets directive) did the AI understand it should enter data into Google Sheets.

**Root cause:** The Sheets data entry session reused the multi-turn conversation from the career search. The AI never received a clear "phase change" signal.

### HIGH: Session Timeout at 5 Minutes Before Sheets Work Started

**What happened:** The session's 300s (5 min) time limit was hit just as the AI was beginning to enter data into the new Google Sheet. Only managed to navigate + scroll.

**Impact:** No job data was entered into the sheet. No formatting occurred.

**Contributing factors:**
- Microsoft search used 6 iterations (~2m 7s) -- reasonable
- Amazon "search" wasted 2 iterations (~43s) doing nothing useful
- Sheets phase wasted 3 iterations (~1m 6s) in stale career context
- Only 2 effective Sheets iterations before timeout

### MEDIUM: Compaction Failures (Repeated "summary too short" warnings)

**What happened:** Conversation history compaction (used to keep multi-turn context manageable) repeatedly failed:
- 6 occurrences of "Compaction summary too short, retrying with stronger prompt"
- All retries also failed: "Compaction still too short after retry, using local fallback"
- Summary lengths: 16, 16, 27, 27, 27, 317 chars (all very short)

**Impact:** The compacted conversation context may have been too terse to convey the task correctly across phase transitions. This likely contributed to the AI losing track of what company/phase it was working on.

### MEDIUM: "key" Tool Validation Failure in Sheets

**What happened:** When the AI tried to enter data into the Google Sheet using the "key" tool (for Tab navigation between cells), the validation rejected it twice:
- LOG at 01:48:16: `{"tool": "key", "type": "action_tool", "valid": false}`
- This caused the entire response to be rejected: "Invalid response structure: missing required fields"
- The retry produced only a conservative scroll action

**Impact:** Even if the session had more time, the AI's approach to Sheets data entry (type + key Tab) would have been blocked by tool validation.

### LOW: Stale Ref Errors on Microsoft Careers

**What happened:** Click on "Find Jobs" button (e2) failed with stale ref after the type action triggered page navigation. The search still worked because typing + Enter triggered the search form submission.

**Impact:** Minor -- the search results loaded anyway. The AI recovered naturally.

### LOW: False hasErrors/hasModal Detection

**What happened:** Microsoft careers search results page was falsely detected as having errors and a modal dialog throughout the session. "MODAL/DIALOG DETECTED - INTERACT WITH MODAL FIRST" was injected into prompts.

**Impact:** Potentially confusing to the AI, though it handled it correctly by ignoring the "modal" warning.

---

## What Worked

1. **Task type detection**: Correctly identified "career" task type with companies [Microsoft, Amazon]
2. **Microsoft careers navigation**: Directly navigated to careers.microsoft.com (used site knowledge memory)
3. **Microsoft job search**: Successfully typed query and loaded results (despite stale ref click failure)
4. **Microsoft job extraction**: Extracted 3 relevant internship listings with getText
5. **storeJobData**: Successfully called and persisted Microsoft job data
6. **Multi-site completion detection**: Correctly detected Microsoft phase completion and attempted Amazon
7. **Sheets orchestration launch**: Correctly detected sheets intent and launched data entry session
8. **Google Sheets creation**: Successfully navigated to docs.google.com/spreadsheets/create and new sheet was created
9. **Stuck detection and recovery**: After 3 stuck iterations, rebuilt system prompt with correct directives

## What Failed

1. **Amazon career search** -- never executed, AI stayed on Microsoft page
2. **Fallback storeJobData** -- tagged Microsoft jobs as Amazon jobs (garbage data)
3. **Dedup** -- correctly removed duplicates but masked the failure (appeared to succeed with 3 jobs)
4. **Sheets data entry** -- 3 wasted iterations in stale context, then timeout
5. **Data entry actions** -- "key" tool validation failure blocked Tab-based cell navigation
6. **Formatting** -- never reached

---

## Recommendations (Fix Priority)

### P0: Fix multi-site company transition

The conversation history MUST be reset or explicitly overwritten when transitioning between companies. Options:
1. Clear the multi-turn conversation history entirely when switching companies (new AI instance)
2. Inject a very explicit "PHASE CHANGE" message: "You have COMPLETED the search for {prev_company}. You are now searching for {next_company}. NAVIGATE to {company}'s careers site. You are NOT on the right page."
3. Force navigation to the new company's careers page before starting the AI loop
4. Add Amazon to site-guides/index.js with a careers URL (amazon.jobs)

### P1: Fix conversation context reset on Sheets transition

When Sheets data entry starts, the conversation history from the career search should be cleared. The Sheets prompt should start fresh with only the data to enter, not the career search history.

### P2: Increase session time limit for multi-phase tasks

The 300s (5 min) limit is too short for a multi-site career search + Sheets data entry + formatting pipeline. For tasks detected as multi-site + sheets, the limit should be at least 600s (10 min) or dynamically calculated based on company count.

### P3: Fix "key" tool validation

The AI tried to use a "key" tool for Tab key presses in Sheets. Either:
- The tool exists but validation is too strict
- The tool doesn't exist and the AI should use keyPress or pressEnter instead
- The Sheets site guide should teach the AI the correct tool names

### P4: Fix compaction quality

Compaction summaries of 16-27 characters are useless. The compaction prompt needs tuning to produce meaningful summaries that preserve task context across iterations.

---

## Metrics Summary

| Metric | Value |
|--------|-------|
| Total LLM calls | ~12 (across all phases) |
| Total tokens (input) | ~130,000 |
| Total tokens (output) | ~8,000 |
| LLM latency (avg) | ~15s per call |
| Longest LLM call | 31.1s (iteration 3, career extraction) |
| Actions succeeded | 15+ (navigate, type, getText x many, scroll, storeJobData) |
| Actions failed | 2 (stale ref click, key tool validation) |
| Microsoft jobs found | 3 (correct) |
| Amazon jobs found | 0 (critical failure) |
| Sheets rows entered | 0 (timeout) |
| Formatting applied | None (never reached) |

---

## Evidence

- timestamp: 2026-02-24T01:43:29Z
  checked: Multi-site orchestration initialization
  found: Companies correctly detected as [Microsoft, Amazon], task rewritten per company
  implication: Task parsing works correctly

- timestamp: 2026-02-24T01:45:43Z
  checked: Microsoft storeJobData call
  found: 3 jobs stored successfully with correct structure
  implication: Microsoft career search pipeline works end-to-end

- timestamp: 2026-02-24T01:46:12Z
  checked: Amazon phase AI reasoning
  found: AI says "Microsoft (company 1/2)" -- never understood company switch
  implication: Multi-turn conversation history contaminated the Amazon phase

- timestamp: 2026-02-24T01:46:27Z
  checked: Amazon fallback storeJobData
  found: 3 "Amazon" jobs are actually Microsoft jobs (identical data)
  implication: Fallback parser blindly tagged result text as Amazon data

- timestamp: 2026-02-24T01:46:27Z
  checked: Dedup results
  found: 6 -> 3 jobs after dedup (removed 3 duplicates)
  implication: Dedup worked correctly but masked the Amazon search failure

- timestamp: 2026-02-24T01:47:33Z
  checked: Stuck recovery during Sheets phase
  found: After stuck counter=3, fresh system prompt rebuilt with both multi-site and Sheets directives
  implication: Stuck recovery correctly identified need for prompt refresh

- timestamp: 2026-02-24T01:48:16Z
  checked: Sheets "key" tool validation
  found: Tool "key" rejected as invalid twice, causing response rejection
  implication: AI's Sheets data entry strategy incompatible with available tools

- timestamp: 2026-02-24T01:48:36Z
  checked: Session timeout
  found: 306,356ms > 300,000ms limit, session killed
  implication: 5 min limit insufficient for multi-site + Sheets pipeline

## Resolution

root_cause: Multiple cascading failures. Primary: Multi-site company transition does not reset AI conversation context, causing the AI to stay confused about which company it is searching. The Amazon phase completed on the Microsoft page with Microsoft data tagged as Amazon. Secondary: Same stale context problem when transitioning to Sheets data entry, wasting 3 iterations. Tertiary: 5-minute session timeout too short for this multi-phase pipeline.

fix: Not applied (diagnosis only)

verification: N/A

files_involved:
- background.js: Multi-site orchestration loop, company transition logic, session time limits
- ai/ai-integration.js: Multi-turn conversation management, compaction, prompt building
- site-guides/index.js: Missing Amazon careers site guide
- content.js: "key" tool validation

## Closeout

Closed as historical. The failures from this diagnostic were split into later
multi-site, Sheets, and CLI workflow workstreams, including archived v9.4 and
v10.0 phases for career search orchestration, Sheets data entry, Sheets CLI
navigation, and formula-bar verification.
