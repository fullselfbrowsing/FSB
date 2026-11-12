# Validation — 2026-10-16

The approved GPT-6.1 Sol driver is implemented. Its real CLI and the installed FSB extension have completed a live local fixture; both real judge backends graded that recording successfully. Dataset access is enabled and the full 300-task collection has started. **A completed Online-Mind2Web benchmark score is still pending.**

## October 16 acceptance

| Check | Result |
|---|---|
| Current automated suites | 43 Node + 12 judge + 4 calibration tests passed; 1 optional Chrome for Testing test skipped |
| GPT-6.1 Sol with the synthetic MCP server | Passed; real CLI, one read, correct price, valid export, owned-tab cleanup |
| GPT-6.1 Sol with the real Chrome/FSB extension | Passed; blue filter applied, $19.99 answer, 11 tool calls / 5 mutating actions, 7 exported frames, owned-tab cleanup |
| Failed calls in the live model attempt | Three retained; model recovered without a rerun |
| Claude primary judge on the real-extension fixture | Success; 9 model calls, no format/transport errors |
| Codex secondary judge on the same fixture | Success; 9 model calls, no format/transport errors |
| Resume and resource recovery | Automated coverage for dataset access, 300 frozen IDs, quota readiness probes, interrupted finals, one infrastructure retry, terminal task failures, active/stale locks and independent judge jobs |
| Shared-browser connectivity | Extension 0.9.92 connected; existing hub relays work; Autopilot configuration is unnecessary |
| Disk | Approximately 120.9 GB available; full-run headroom check passes |
| Official dataset | Access enabled through FSB after user-approved contact sharing; pinned URL returns HTTP 200 and all 300 unique IDs are frozen |

Live model evidence is at workspace `.context/om2w/codex-live-20261016/`; the real-CLI synthetic-server run is at `results/codex-driver-acceptance-20261016/`. The real-extension attempt took 28.2 seconds before cleanup, recorded 162,935 input tokens (137,984 cached) and 419 output tokens, and used approximately 2 MB for raw evidence plus its v2 copy. These are fixture observations, not full-run resource estimates or benchmark scores. Both judges used the upstream-pipeline `official` variant for this acceptance check.

The active full queue, `results/full-codex-20261016-capture-recovery/`, uses `--driver codex --browser existing --tasks all --judge --judge-passes 3 --wait-for-resources`. It does not depend on the previously failing Chrome for Testing launcher. It loaded dataset revision `eacad896a84dc5b65e29b0b06e4699ab0544d701` with SHA256 `7dedf381531d423dc0fc48d21dc1d425655dd75f38b10211a880fa09102f257f`. The new Hugging Face token permits only reading public gated repositories, is saved locally with mode `0600`, and is excluded from model environments. The run's `REPORT.md` and manifest record current progress.

The archived `results/full-codex-20261016/` stopped after both attempts of its first task hit “Frame with ID 0 was removed” during screenshot capture after refresh. It produced zero terminal task outcomes and zero exports. The recorder now retries only transient frame/context capture failures, at most four fresh screenshot requests; each attempt remains visible in the raw log. Regression tests cover successful recovery and exhaustion without fabricated images. A separate real-extension local fixture refreshed three times and exported valid evidence with successful cleanup (`.context/om2w/capture-recovery-smoke/`); no capture retry was needed in that fixture. The new full run has a distinct source fingerprint, preserves the archived traces, and discloses both prior infrastructure attempts in its provenance and per-task files. Its agent model, effort, prompt, toolset and action/time limits are unchanged. No production extension or MCP code was changed.

## October 15 baseline

| Check | Result |
|---|---|
| Node harness tests | 20 passed; 1 optional Chrome test skipped in the default suite |
| Python judge tests | 11 passed |
| Calibration statistics tests | 4 passed |
| Offline synthetic task, v2 export, validation and fake WebJudge | Passed |
| Resume of the identical completed run | Passed; no repeat task/model calls |
| Resume with changed limits | Correctly refused |
| FSB source tool inventory | All 72 registered tools match the saved inventory |
| Vendored judge/schema primary source verification | 13 source files match pinned upstream bytes |
| Real Codex WebJudge smoke | Passed on the synthetic three-frame trajectory |
| Real Claude driver attempt | Correctly recorded `never_started`; subscription limit until 1pm America/Chicago |
| Chrome for Testing protocol integration | Failed before CDP connection; details below |
| Real FSB extension through the existing hub | 10 tool calls passed; `go_back` failed; 12 valid screenshot captures; export validated |
| Real FSB smoke cleanup | Only the temporary owned tab closed; existing daemon left running |

The original 35 passing automated tests cover restricted MCP exposure and ownership, concurrent-call serialization, failed calls, bootstrap failure, upstream exit, process timeout, Unicode streaming, screenshot integrity, fresh evidence after reads, corrupt logs, v2 invariants, judge message conversion, parser traps/re-asks, expected-task denominators, strict variants, source fingerprints, dataset integrity, deterministic sampling and statistical metrics. October 16 adds Codex-driver and batch-recovery tests; see the current test command output for the complete count.

The final synthetic run is under `results/final-smoke/`. It answered “The Blue Widget costs $19.99.” Its v2 submission contains bootstrap navigation, one click and task completion, each with a valid PNG; the two read calls and their screenshots remain in the raw record. The terminal frame uses the latest read observation. `results/acceptance-20261015/` holds the real Codex result: success, five calls, 56,527 input tokens, 285 output tokens, 25.6 seconds of summed call time, zero format/transport errors. Its submitted result and image bytes exactly match the final smoke output, as recorded in `results/verification/final-input-equivalence.json`.

Synthetic runs are explicitly marked `synthetic: true`. A pass demonstrates the pipeline and fixture evidence, not FSB's performance on websites. The Claude access attempt and quota message are preserved under `results/dryrun-claude-access/`; it exported no trajectory.

The real-extension smoke is in `.context/om2w/live-fsb-integration/` at the workspace root. It used a local form fixture for typing, selecting a blue filter, clicking Apply and reading the $19.99 result, then navigated to example.com and read its actual documentation-example notice. `go_back` returned “Cannot find a next page in history.” The test recorded that failure, recovered with direct navigation and exported all evidence, including the failed action. The command exits nonzero because the tool check failed; `pipeline_ok: true` only describes recording/export validation. The application was real FSB and Chrome; the task/data were a synthetic fixture. This trace is not a benchmark score.

The 180-item historical calibration sample and o4-mini baseline are prepared. New Claude/Codex text-replay judgments are pending. The published-label baseline has 85.0% agreement, kappa 0.685, success precision 83.8% and recall 78.1%; [calibration/RESULTS.md](calibration/RESULTS.md) gives intervals and limitations. No new judge is human-calibrated yet.

## Historical blockers and current status

- The October 15 Claude quota has cleared; its real judge now passes.
- Hugging Face authentication and the dataset contact-sharing gate are resolved; the 300-task queue has started.
- The previous native-host PID and 5.2 GB free-space readings are historical. Existing Chrome and relays passed on October 16, with approximately 120.9 GB free. The 15 GB check is a conservative headroom policy, not a measured requirement.
- Resolve Chrome startup on this Mac. Optional tests launched isolated, extension-free, headless CfT 146.0.7680.153 and 131.0.6778.204. Neither produced `DevToolsActivePort` before timeout. Adding mock-keychain/password-store flags did not resolve it. The launcher now times out with diagnostics and kills its own process group. The CDP dialog handling, extension storage seeding and live FSB pairing therefore remain unverified in this environment.

Preflight evidence is saved in `results/verification/preflight-full.json`. Code and configuration changes are confined to `mind2web/`; the extension, MCP server and user CLI configuration are unchanged. No commits, branch changes or PRs were made. Live browser actions were limited to the smoke test's temporary owned tab.
