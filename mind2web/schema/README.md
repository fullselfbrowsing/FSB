# Online-Mind2Web Submission Schema — v2

**Status:** Proposal for the next iteration of the Online-Mind2Web submission format
**Schema version identifier:** `online-mind2web-v2`
**Audience:** Benchmark maintainers and trajectory submitters

---

## 1. Why a new version

### The headline problem in v1: actions, thoughts, screenshots, and URLs can silently desync

In v1, a submission carries the trajectory across **three independent parallel collections**:

- `action_history: string[]` — what the agent did, in order.
- `thoughts: string[]` — the agent's reasoning, in order.
- `trajectory/*.png` files on disk — the screenshots, ordered by filename sort.

Mapping a step to its action, its thought, and its screenshot is purely positional and entirely implicit. Nothing in the payload says "thought #7 belongs to action #7" or "screenshot `0007.png` is the state right before action #7." If any one of those collections is even slightly off — a missing thought, a duplicated scroll, a screenshot the recorder dropped, a filename that sorts unexpectedly — every downstream step is misaligned and there's no way to detect or recover from it.

Concretely, here's the failure mode we keep seeing in real v1 payloads:

```jsonc
// v1 — three parallel arrays, easy to desync
{
  "action_history": [
    "page -> NAVIGATE -> https://example.com/",
    "CLICK coords(902, 204) -> open menu | SUCCESS",
    "TYPE … -> 'unemployment' | SUCCESS",   // ← agent recorded 3 actions
    "TASK_COMPLETE -> ANSWER: …"
  ],
  "thoughts": [
    "Navigating to the URL.",
    "Opening the menu."                      // ← only 2 thoughts captured
                                             //    (the typing thought was dropped)
  ]
  // screenshots on disk: 0000.png, 0001.png, 0002.png, 0004.png  ← gap at 0003
}
```

Three things go wrong at once:
- The third action ("TYPE …") gets paired with the wrong thought because `thoughts[2]` doesn't exist and consumers fall back to position-2.
- The screenshot for the TYPE action is `0004.png`, not `0003.png`, because the agent dropped a frame — but a viewer that maps `index → file at sorted position N` will show the wrong image.
- The terminal `TASK_COMPLETE` action has no thought and no screenshot, and there's no field to say so.

None of these are rare. They're the dominant source of labeling errors and broken viewers we've debugged on Online-Mind2Web data.

A related v1 footgun: the destination URL of a NAVIGATE was embedded inside the action string (`URL: <from> -> <to>`), so consumers had to regex it back out, and there was no place to put the page URL for non-NAVIGATE steps. Same desync risk, second-class citizen.

**v2 fixes this at the schema level:** every step is a single self-contained object that names its own screenshot, carries its own thought, and (recommended) records its own URL. Misalignment becomes either a validation error (the screenshot file doesn't exist, the step index doesn't match its position) or impossible by construction (the thought lives inside the step, so it can't pair with the wrong action). There is exactly one way to read a step's action, thought, URL, and screenshot, and the schema enforces it.

### Other improvements (lower priority but worth doing in the same version bump)

| # | Problem in v1 | Cost |
|---|---|---|
| 2 | No version field in the payload — producers and consumers had no shared way to negotiate format changes; we sniffed shape. | Every schema change is a breaking change. |
| 3 | The action string grammar was undocumented — verbs, target syntax, and the `\| SUCCESS` / `\| FAILED` suffix were de-facto conventions. Submitters mixed grammars and put reasoning inside the action text. | Inconsistent data, painful parsing, lower-quality labels. |
| 4 | The agent's final answer was buried inside the last action string after `TASK_COMPLETE -> ANSWER:`. Every consumer had to regex it out. | Fragile downstream pipelines. |
| 5 | `task_id` format was loose — we saw both `tasks/<hash>` and bare `<hash>` in the wild. | Inconsistent joins against the upstream dataset. |

---

## 2. v1 → v2 at a glance

| Concern | v1 | v2 |
|---|---|---|
| **Step ↔ thought ↔ url ↔ screenshot mapping** | **Three parallel collections + URLs embedded in strings. Mapping is implicit and silently desyncs when any one is off.** | **One self-contained `ActionStep` per step. `step`, `screenshot`, `url`, `action`, and `thought` live together; misalignment is a validation error.** |
| Version negotiation | *(none)* | `schema_version: "online-mind2web-v2"` (required, pinned) |
| Per-step structure | `action_history: string[]` + parallel `thoughts: string[]` | `action_history: ActionStep[]` |
| Reasoning per step | Separate array, easy to desync, easy to omit | `thought` is required on every step (may be `null` — must be explicit, never absent) |
| URL per step | Embedded inside NAVIGATE strings as `URL: from -> to`; missing for other actions | First-class optional `url` per step (strongly recommended on every step) |
| Final answer | Embedded in last action string | First-class top-level `agent_final_answer` |
| Action grammar | Undocumented convention | Documented in this README §4, fixed verb vocabulary, two accepted grammars |
| Per-step success/failure | Trailing `\| SUCCESS` / `\| FAILED` substring only | Same suffix preserved in `action`, plus optional structured `action_status` mirror |
| `task_id` format | Loose (saw both `tasks/<hash>` and bare `<hash>`) | Bare upstream ID only — no `tasks/` prefix, regex-enforced |
| Strict validation | `additionalProperties: true` (implicit) | `additionalProperties: false` everywhere |

### Why these changes are better

- **Desync becomes impossible or detectable.** Per-step records can't drift apart, because everything for a step lives in one object. A missing screenshot becomes a validation error at ingest, not a misaligned label three weeks later.
- **Forward-compatible.** A pinned `schema_version` lets us ship `online-mind2web-v3` without breaking validators.
- **Easier to label well.** Submitters know exactly what verbs, targets, and statuses are accepted.
- **Cheaper to consume.** No regex extraction of the final answer or the URL; no sniffing for format variants.
- **Backwards-friendly migration.** v1 payloads convert mechanically to v2 — see §8.

---

## 3. Full v2 JSON Schema

See [`schema.json`](./schema.json) in this directory. It validates as JSON Schema draft 2020-12.

---

## 4. Action dictionary

Choose **one** grammar per submission and stay consistent.

### 4.1 Grammar A — verbose pipe form (recommended)

Format:
```
<TARGET> -> <VERB> -> <description> | <STATUS>
```

- **TARGET** — what the verb operates on. One of:
  - `page` — the whole page (used by `NAVIGATE`, `SCROLL`, `WAIT`, `GO_BACK`, `GO_FORWARD`, `REFRESH`).
  - `coords(x, y)` — pixel coordinates relative to the screenshot (used by pointer verbs when no selector is available).
  - A CSS or XPath selector — e.g. `[data-blink-ref='000003']`, `input,textarea,[contenteditable='true']` (used by `CLICK`, `TYPE`, `HOVER`, `SELECT`, `PRESS_KEY`).
- **VERB** — see the dictionary below. Always uppercase.
- **STATUS** — `SUCCESS` or `FAILED`. Required for executed actions; omit for pure observation steps and for `TASK_COMPLETE`.
- **description** — short, factual, human-readable. **Do not put reasoning here** — that goes in the step's `thought`.
- **URLs** — for `NAVIGATE`, set the destination URL in the step's top-level `url` field, **not** in the action string. The legacy `URL: from -> to` substring is deprecated.

#### Verb dictionary

| Verb | Typical target | Status required | Description (what it means) | Example `action` string |
|---|---|---|---|---|
| `NAVIGATE` | `page` | yes | Direct URL navigation. Destination URL goes in the step's `url` field. | `page -> NAVIGATE -> Direct navigation to the Health Measures index after repeated click failures | SUCCESS` |
| `CLICK` | `coords(x,y)` or selector | yes | Single primary-button click on an element or coordinate. | `CLICK coords(902, 204) -> click the 'Explore Data' navigation button | SUCCESS` |
| `TYPE` | selector | yes | Type text into a focused or selected input. The text content goes in the description; never include passwords or PII. | `TYPE [data-blink-ref='00000v'] -> search for the 'Unemployment' measure | SUCCESS` |
| `SCROLL` | `page` (or selector for scrollable container) | yes | Scroll the page or a container. Direction/amount goes in the description if relevant. | `SCROLL page -> scroll down to reveal the comparison controls and trend graph section | SUCCESS` |
| `HOVER` | `coords(x,y)` or selector | yes | Move the pointer over an element to reveal a tooltip or hover state. | `HOVER coords(740, 320) -> hover over the top mover row to reveal the index code | SUCCESS` |
| `WAIT` | `page` | optional | Pure observation / pause. Use when the agent is reasoning or waiting for content without acting. | `WAIT page -> waiting for the comparison chart to render | SUCCESS` |
| `PRESS_KEY` | `page` or selector | yes | Press a single key or chord. Key name in the description (e.g. `Enter`, `Escape`, `Tab`, `Cmd+L`). | `PRESS_KEY page -> press Enter to submit the search query | SUCCESS` |
| `SELECT` | selector | yes | Choose an option from a native `<select>` or a custom dropdown. Selected value in the description. | `SELECT [name="sortBy"] -> select 'Rating' from the Sort By dropdown | SUCCESS` |
| `GO_BACK` | `page` | yes | Browser back. | `page -> GO_BACK -> return to the previous results page | SUCCESS` |
| `GO_FORWARD` | `page` | yes | Browser forward. | `page -> GO_FORWARD -> re-enter the comparison page | SUCCESS` |
| `REFRESH` | `page` | yes | Reload the current page. | `page -> REFRESH -> reload to dismiss the stale modal | SUCCESS` |
| `TASK_COMPLETE` | *(none)* | **omit** | Terminal step. Format is `TASK_COMPLETE -> ANSWER: <text>`. The `<text>` must also appear in the top-level `agent_final_answer`. | `TASK_COMPLETE -> ANSWER: The figure comparing unemployment trends among women in Illinois and Michigan is displayed on the current page.` |

#### Status semantics

- `SUCCESS` — the action took effect on the page (the click hit, the input received text, the scroll moved the viewport, the navigation completed).
- `FAILED` — the action was attempted but had no observable effect (selector didn't match, click hit nothing, navigation 404'd). The agent typically recovers in subsequent steps.
- Omit for `WAIT` (pure observation) and `TASK_COMPLETE` (terminal).
- When `action_status` is also set on the step, it must agree with the suffix.

### 4.2 Grammar B — compact form (legacy Mind2Web traces)

Format:
```
<verb>_at(x=<int>, y=<int>)
<verb>(<args>)
```

Verbs:

| Verb | Args | Maps to Grammar A verb |
|---|---|---|
| `click_at` | `(x=<int>, y=<int>)` | `CLICK` |
| `type_at` | `(x=<int>, y=<int>, text="…")` | `TYPE` |
| `scroll` | `(direction="down"|"up", amount=<int>)` | `SCROLL` |
| `hover` | `(x=<int>, y=<int>)` | `HOVER` |
| `wait` | `(ms=<int>)` | `WAIT` |
| `press_key` | `(key="Enter")` | `PRESS_KEY` |
| `select_option` | `(selector="…", value="…")` | `SELECT` |
| `navigate` | `(url="…")` | `NAVIGATE` (still copy the URL into the step's `url` field) |
| `go_back` | `()` | `GO_BACK` |
| `go_forward` | `()` | `GO_FORWARD` |

Reasoning belongs in `thought`, never inside the action string. Mixing Grammar A and Grammar B within a single submission is not allowed.

---

## 5. Submission package layout

A submission is a directory (or zip of one) per attempt at a single task.

```
<task_id>/
├── result.json                # The v2 submission document
└── trajectory/                # Per-step screenshots, one per step
    ├── 0000.png
    ├── 0001.png
    ├── 0002.png
    └── …
```

Rules:
- The directory name **should** be the bare `task_id`.
- `result.json` must validate against [`schema.json`](./schema.json).
- Every `screenshot` value referenced in `action_history` must exist as a file inside `trajectory/`. Extra files are allowed but discouraged.
- Filenames in `trajectory/` must sort lexicographically into the same order as the `step` index. Zero-padded 4-digit names (`0000.png`) are the safest choice; `<step>_full_screenshot_<unix_ms>.png` is also accepted.
- Allowed image formats: `.png`, `.jpg`, `.jpeg`, `.webp`.
- For batch submissions, wrap multiple `<task_id>/` directories in a single zip:

```
submission.zip
├── 1b867afecf072cb877ebfa4069263746/
│   ├── result.json
│   └── trajectory/0000.png …
├── d392e154c1c6ffbb26e2331c3afafc67/
│   ├── result.json
│   └── trajectory/0000.png …
└── …
```

---

## 6. Validation rules consumers will enforce

In addition to the JSON Schema, a v2 submission must satisfy:

1. `schema_version === "online-mind2web-v2"`.
2. `task_id` matches `^[A-Za-z0-9_\-]+$` (no `tasks/` prefix, no slashes).
3. `action_history[i].step === i` for every `i` (no gaps, strictly increasing).
4. Every `action_history[i].screenshot` resolves to an existing file under `trajectory/`.
5. Every step has a `thought` key present (value may be `null`, but the key must exist).
6. The final step's `action` starts with `TASK_COMPLETE`. If `agent_final_answer` is non-null, it equals the text after `TASK_COMPLETE -> ANSWER:` in that final action (modulo whitespace).
7. If `action_status` is set on a step, it agrees with any `| SUCCESS` / `| FAILED` suffix in `action`.
8. If `url` is present on a `NAVIGATE` step, it must be the destination URL of that navigation. Submissions **should** populate `url` on every step; consumers will treat a missing `url` as "unknown" rather than inheriting from a previous step.
9. `reference_length` is the **human** reference length for the task, not the submitter's step count.

Rules 3, 4, 5, and 8 are the ones that close the v1 desync hole. Together they make it impossible for an action to be paired with the wrong thought, the wrong screenshot, or the wrong URL.

---

## 7. Example

See [`example.json`](./example.json) in this directory for a complete, validating submission.

---

## 8. Migrating a v1 payload to v2 (mechanical recipe)

The v1→v2 conversion is the moment to detect and fix any latent desync. Don't paper over gaps — surface them.

1. Add `"schema_version": "online-mind2web-v2"` at the top.
2. Strip any `tasks/` prefix from `task_id`.
3. Walk the v1 `action_history` string array by index `i`:
   - Build an `ActionStep` with `step: i`, `screenshot: "<padded i>.png"`, `action: <v1 string>`.
   - Set `thought: thoughts[i] ?? null`. **If `thoughts.length !== action_history.length` in the source, log a warning and explicitly null-fill — do not silently shift.** This is the most common v1 desync.
   - If the action string ends in `| SUCCESS` or `| FAILED`, set `action_status` accordingly.
   - If the v1 action string contains an explicit `URL: <from> -> <to>` (NAVIGATE), lift the destination URL into the step's top-level `url` field and **strip** the `URL: …` substring from `action`. For non-NAVIGATE steps, populate `url` with the page URL the agent was on at the time of the action — usually available from the recorder's metadata even though v1 didn't expose it.
4. Verify each generated `screenshot` filename exists in `trajectory/`. **If a screenshot is missing, fail the migration loudly rather than re-numbering surrounding files** — re-numbering is exactly how silent misalignment creeps in.
5. Extract the text after `TASK_COMPLETE -> ANSWER:` from the last action and put it in top-level `agent_final_answer`.
6. Keep `reference_length` as-is.
7. Validate against `schema.json` and the rules in §6.
