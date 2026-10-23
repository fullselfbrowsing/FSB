# Browser manual v2

`harness/repair-benchmark.mjs` runs the FSB benchmark in existing, signed-in Chrome; `harness/public-benchmark.mjs` wraps it for the unmodified public release (see [PUBLIC-RELEASE.md](PUBLIC-RELEASE.md)). The actor is Claude Code (`claude -p`) on **Claude Opus 5.5 (`claude-opus-5-5`) at medium effort**, and the same model judges. `config/model-family.json` holds the family, model, effort, pinned CLI and quota headroom for every stage. Each fresh task receives 1,200 wall-clock seconds and 120 mutating/UI tool-call attempts. Failed attempts, rejected JavaScript, unknown tools and browser-based spreadsheet reads consume that budget. Claude Code's built-in tools are disabled (`--tools ""`), only the task MCP server is loaded (`--strict-mcp-config`), MCP resources are disallowed, and `--max-turns 400` is set high enough that the time and action budgets bind first.

The named profile is [config/browser-manual-v2.json](config/browser-manual-v2.json), with exactly 46 tools. It includes visual controls, synchronous DOM JavaScript, owned tabs, waits, site guides and browser spreadsheet tools. It excludes file uploads, synthetic file drops, memory, vault, service/API tools, triggers and Autopilot. Search always sets `allow_web_fallback:false`.

JavaScript is governed by a recorded usage policy, not a sandbox: use rendered DOM/UI operations; do not use direct network/API calls, extract credentials, fabricate uploads or defer background actions. Code and results remain in the raw evidence.

## Installation and provenance

Before editing, archive the historical sources, actual installed extension/runtime fingerprints and preservation receipts. Historical run IDs, scores, caches and exports must remain unchanged. Build the repaired MCP package with `npm run build` from `mcp/`, then pin a separate runtime package and extension directory. The pipeline verifies staged `build/` and `ai/` bytes against that worktree build. It records the original installed native hub separately; a pinned repaired MCP client can use that hub as transport.

Load the repaired extension in the existing Chrome profile and verify its actual loaded path and ID. Preserve the installed public manifest key and permissions when updating that same extension. Fingerprinting a directory alone does not prove Chrome loaded it. The real installed-route fixture must pass before any model pilot.

The run uses a byte-pinned copy of Claude Code 2.1.302 (`.context/om2w/public-v1/toolchain/`), because the installed CLI auto-updates in place. Every Claude child gets an allowlisted environment (no inherited Claude Code session variables, API keys or base URLs) with auto-memory, tool search, the auto-updater and nonessential traffic disabled. The sole MCP server is the task gateway; any tool outside the FSB profile, in the init inventory or in a model turn, stops the actor.

Claude Code transcodes screenshots larger than its limit to a JPEG of at most 2000 px before the model sees them; small PNGs pass through unchanged. It forwards completed tool failures (`isError`) as joined text only, so the failed observation's image is recorded but not shown. Tool results above `MAX_MCP_OUTPUT_TOKENS` are saved to a file with only a preview inline, which would drop the screenshot, so the actor runs with that limit raised to 100,000. Before live browser gates, `harness/claude-image-contract.mjs` sends a screenshot-sized PNG and a 45k-token read through the production recorder and CLI arguments to a local Messages API (dummy key, no inference). It verifies the exact 44-tool surface, the frozen system prompt, the model and effort, the inline large result, the delivered image's geometry and colors, the error-text path and the exact saved PNG. Its receipt is bound to the frozen run and checked on resume. The prompt tells the actor that images may be downscaled and to convert positions with the observation's `css_rect`.

Use fresh output and run IDs. For example, from this directory:

```sh
node harness/repair-benchmark.mjs \
  --extension-dir /absolute/repaired-extension \
  --output /absolute/workspace/.context/om2w/new-manual-v2 \
  --full-run-id full-manual-v2-new \
  --fsb-server-cmd '["/absolute/node","/absolute/pinned-runtime/build/index.js","stdio"]'
```

The output's parent must already exist inside this workspace's `.context/`. The full collection goes into `results/<full-run-id>/`. The controller freezes dataset, source, profile, prompt, runtime, extension and executable toolchain fingerprints before gates; it refuses drift on resume. Dataset bytes are pinned to revision `eacad896a84dc5b65e29b0b06e4699ab0544d701` and SHA256 `7dedf381531d423dc0fc48d21dc1d425655dd75f38b10211a880fa09102f257f`.

## Gates and task execution

The local installed-MCP gate checks all seven compact-ref tools independently, waits, stale and colliding refs, selector precedence, SVG observations, grounded canvas input, popup ownership, explicit target isolation, real PNG hashes, valid exports and owned cleanup. It runs synthetic local waves at 1, 2, 5 and 10. Source and controller fixtures separately cover connection loss, capture failures, deadline cancellation and long spreadsheet work. CSS or text fallback cannot satisfy the compact-ref assertions.

A completed action can retain an unknown native result when FSB's generic effect verifier cannot recognize a fixture's change. The gate saves that result and its physical image, emits a fresh nonmutating observation, and asserts the exact fixture goal. It never repeats the uncertain action or substitutes CSS/text targeting for the original compact reference. In-flight work, pending cleanup and missing or mismatched images still stop the gate.

The live pilot uses the highest passing local level and the fixed outcome-blind ten-task sample in `browser-manual-v2-canary.json`. Every candidate runs five serial attempts, all ten concurrent attempts, then the remaining five serial attempts. Each task has a balanced serial/concurrent pair. Timing fallbacks follow 10 → 5 → 2 → 1, with a fresh paired pilot at each tested fallback. Pilot attempts are separate from the 300 fresh collection attempts.

Acceptance requires zero ownership, evidence, export, cleanup and queue-expiry faults; p95 queue wait at most 30 seconds; p95 ordinary tool round-trip at most 60 seconds; and p95 lease-held service time at most 1.5 times serial. The hard queue limit is 60 seconds. Spreadsheet operations have a separate bounded request deadline. Timing failures step down; correctness failures require repair and a new gate. Descriptive blinded pixel checkpoints are independent of this operational decision; action counts and CLI completion do not establish goal success.

After operational acceptance, the pipeline pauses at `paused_review` with ten blinded A/B pairs under `pilot/descriptive-checkpoints/review/`. Claude agents inspect all 20 unchanged final native PNGs, complete the visible-evidence notes, and record a receipt with `harness/manual-pilot-review.mjs`. Resume the same pipeline with `--resume`. This automated descriptive review requires no human reviewer, does not alter the concurrency decision, and does not establish calibrated success labels.

Each task owns its MCP connection and browser tabs. Explicit owned-tab targets and logical selection are preserved. Only authoritative owned children are adopted; unrelated tabs and closing the final working tab are rejected. The global foreground lease starts before potentially native input and remains through capture. Background DOM reads can overlap, with captures scheduled separately.

Every page observation/action returns a native PNG image block with a frame receipt binding its operation, tab, URL, viewport, timestamp and SHA256. The same bytes are saved and exported. Explicit screenshots use one capture. Coordinate tools require the latest emitted target-tab frame and validate current navigation, viewport, scroll and pixel ratio before dispatch. Site guides and tab inventory do not replace page frames.

Both the per-task gateway queue and the foreground lease queue have a maximum wait of 60 seconds. Requests carry their receipt-time deadline through setup, dispatch and capture within the actor's 300-second MCP tool timeout (`MCP_TOOL_TIMEOUT`). Queue, focus, upstream, capture and emission timestamps remain separate. Cancelled or expired queued work never dispatches, and failed or unknown mutating/UI requests still consume the attempt budget.

No queued work dispatches after the task deadline. Already-dispatched work drains within its bounded operation deadline so uncertain results can be recorded. Uncertain actions are never replayed automatically. Completed unknown outcomes require a new emitted observation before another mutation; in-flight work or unverified native cleanup halts dispatch. Cleanup is recorded separately from task outcome. Infrastructure work before actor mutation can use the one permitted retry. A provider availability interruption (quota, rate limit or transport) after mutation on a task's first attempt is retained, never scored, and the task reruns once from its start page after the circuit admits it; a second interruption, or an authentication/configuration failure after mutation, pauses dispatch and cannot be replayed on ordinary resume.

The pilot measures artifact usage. The disk gate uses its forecast with 25% headroom plus a 5 GB reserve; there is no fixed 15 GB requirement. The nominal collection ceiling is 100 actor-hours, excluding pilots and cleanup.

## Resume and model limits

Resume the identical command with `--resume`. `SIGUSR2` stops new task dispatch and drains active tasks. `SIGINT`/`SIGTERM` stop actors and cancel queued work, then retain cleanup evidence. A health fault pauses the run; ordinary resume cannot bypass it or silently change concurrency. Completed/timed-out tasks are not restarted because cleanup failed.

The shared durable Claude-family circuit (`--family claude`) is checked immediately before every CLI spawn, by both collection and judging. Quota opens it immediately. A rejected `rate_limit_event` carries the window's `resetsAt`, and known reset times add 60 seconds; otherwise probe delays are 30 minutes, 1, 2, 4 and 6 hours, with at most six probes per rolling day. The next actual pending call is the probe; status polling creates no synthetic model calls. Claude Code reports subscription utilization on every session: when a finished actor or judge call sees the five-hour window at 90% or the seven-day window at 97%, the circuit pauses new spawns until that window resets (a `headroom` pause, which reopens without a probe), so in-flight tasks finish and the account keeps some capacity. Authentication/configuration failures require a recorded operator repair. An unused half-open admission is abandoned without spending a probe. See [judge/README.md](judge/README.md) for circuit operations.

## Judging and reporting

Collection must contain 300 fresh terminal task results before judging. Exactly six jobs run: three official and three strict Claude Opus 5.5 passes, one job active at a time, ten task workers and a process-safe global cap of ten judge CLI processes. Valid stages and ordinary terminal verdicts are cached. Only missing/infrastructure-pending work resumes. Format attempts are bounded at three; transient transport attempts at two. Infrastructure-pending work is never completed failure credit.

The `scorefield-v2` local protocol preserves vendored WebJudge bytes, prompts, filter rubric, threshold three, ordered first 50 qualifying images and strict answer removal. One shared parser accepts exactly one standalone final integer `Score` field from 1–5 in supported upstream numbered/Markdown forms. It rejects duplicates, malformed values and trailing prose, and parses final `Status` as an exact enum. Raw responses remain unchanged.

Reports use the full 300 denominator and include six pass rates, official/strict means and ranges, per-task outcomes, missing evidence, format errors, usage and latency. Scores must be labelled **uncalibrated Claude Opus 5.5 substitute judging**. Seeded blinded 60-task saved-evidence bundles are prepared without waiting for human reviewers; their existence is not completed calibration.

Chrome cookies and site state are shared across tasks. Product repairs, toolset, time/action budgets and parser changed together. Live websites can also change. Score differences therefore cannot be attributed solely to the repairs, and no target success rate is promised.
