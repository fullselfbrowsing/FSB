# FSB on Online-Mind2Web

The **FSB benchmark — AI-reviewed** result is **277/300 (92.33%)**. See the [benchmark report](BENCHMARK-REPORT.md), [machine-readable result](BENCHMARK-RESULT.json), and [methodology](results/benchmark-publication-20261022/METHODOLOGY.md). The report includes the top-10 chart and per-task evidence. Historical evaluations and their seals remain unchanged.

The current runner measures the **unmodified public release** (Chrome Web Store extension 0.9.92 with fsb-mcp-server 0.11.2) driven by **Claude Code on Claude Opus 5.5** (`claude-opus-5-5`, medium effort), with Claude Opus 5.5 also judging. It is documented in [PUBLIC-RELEASE.md](PUBLIC-RELEASE.md) and [BROWSER-MANUAL-V2.md](BROWSER-MANUAL-V2.md): the 44-tool public browser profile, native image delivery, a 1,200-second/120-attempt task budget, measured concurrency gates and six Claude judge jobs. Start new collection with `harness/public-benchmark.mjs`. The commands below describe the historical 17-tool runner (whose full run used GPT-6.1 Sol through Codex) and are retained for reproducibility.

## Historical runner

The approved full run measures **GPT-6.1 Sol (`gpt-6.1-sol`, medium) using a restricted set of FSB MCP tools in the existing Chrome profile**. Claude (`claude-opus-5-5`, medium) is the primary WebJudge backbone; Codex (`gpt-6.1-sol`, medium) is the secondary backbone. The Claude driver and isolated browser mode remain available. Production extension and MCP code are unchanged.

The recording proxy owns one tab, exposes 17 tools, injects the required `client: "Codex"` or `"Claude"` field, and saves a PNG after each action and read, including failed calls. Reads remain in the raw log; their latest frame supplies terminal evidence without inventing an extra browser action. Each exported v2 step contains its action, reason if available, screenshot and URL. Missing screenshots prevent export. No model's hidden reasoning is requested.

If navigation replaces a frame during capture, the recorder makes at most four fresh screenshot requests with bounded delays. Every capture attempt and error stays in `steps.jsonl`; only a genuine valid PNG can satisfy the step. This retries observation, never the browser action. Exhausted capture retries pause the task as an infrastructure failure. An optional `provenance.json` is fingerprinted into the run and reproduced in the report; per-task files disclose infrastructure attempts from an earlier invalid run.

## Setup

Use Node 24+ and Python 3.14. From this directory:

```sh
python3 -m venv judge/.venv
judge/.venv/bin/python -m pip install -r judge/requirements.lock.txt
npm test
judge/.venv/bin/python -m unittest discover -s judge/tests -v
judge/.venv/bin/python -m unittest discover -s calibration -p 'test_*.py' -v
```

For live runs, accept the [dataset terms](https://huggingface.co/datasets/osunlp/Online-Mind2Web) and sign in locally with `hf auth login`. If `hf` is not installed, use `uvx --from huggingface_hub hf auth login`. The loader reads the local Hugging Face token file on every access check; `HF_TOKEN`, `HF_TOKEN_PATH` and `HF_HOME` are also supported. Keep tokens out of chat and command-line arguments. The loader pins revision `eacad896a84dc5b65e29b0b06e4699ab0544d701`, stores a SHA256 and checks it on reuse. It does not pass reference answers to the agent. A local dataset can be supplied with `--dataset`; its checksum is recorded and its revision is reported as local.

Both CLIs must already be signed in. The judges use subscription authentication, without API keys or edits to CLI configuration. Claude runs with no user/project settings, hooks, skills or unrelated MCP servers. Codex ignores user configuration and rules and receives the model explicitly. Each model call has a timeout and a bounded retry count.

## Dry run and tests

```sh
node harness/run-bench.mjs --dry-run --run-id demo --judge
node harness/validate-v2.mjs results/demo/trajectories
```

This exercises the recording proxy, synthetic MCP server, scripted driver, v2 writer, validator, upstream WebJudge pipeline and fake model transport. Its manifest and judge summary say `synthetic: true`; it makes **no claim about FSB task performance**.

To use the real Claude driver against the synthetic MCP server:

```sh
node harness/run-bench.mjs --dry-run --real-agent --run-id demo-claude --max-turns 10
```

To exercise the real Codex CLI and its controller-owned MCP connection against that server:

```sh
node harness/run-bench.mjs --dry-run --real-agent --driver codex \
  --browser existing --run-id demo-codex --max-actions 6 --timeout-seconds 120
```

To grade an existing synthetic trajectory with Codex:

```sh
PYTHONPATH=judge judge/.venv/bin/python -m om2w_judge.runner \
  --engine codex --trajectories_dir results/demo/trajectories \
  --output_path results/demo/judge --task_ids results/demo/task-ids.json
```

The optional Chrome protocol test starts a clean, headless Chrome for Testing with **no extension**, dismisses a confirmation dialog and closes only the browser it started:

```sh
OM2W_TEST_CFT=1 node --test harness/test/chrome.test.mjs
```

`OM2W_CFT_PATH` overrides the binary for that test. See [VALIDATION.md](VALIDATION.md) for observed results and current blockers.

## Live pilot and full run

An existing FSB-connected Chrome can run the real integration smoke immediately:

```sh
node harness/live-smoke.mjs
```

This joins the existing daemon as a relay, opens one temporary owned tab, exercises form input/filtering and public-page navigation, captures real screenshots, validates the v2 export, and closes its tab. It needs neither a dataset token nor a model subscription call. Results go under the workspace's `.context/om2w/`. Tool failures remain in the report and make the command exit nonzero even if recovery and export work. The task is synthetic test data operated through the real extension; it is not an Online-Mind2Web score. `--fsb-server-cmd` can override the installed native-host runtime command.

The Codex-driven real-extension smoke opens a local form, lets the model select and apply a blue filter, checks the answer, validates the export and verifies owned-tab cleanup:

```sh
node harness/codex-smoke.mjs
```

The full queue uses existing Chrome and joins the installed FSB hub as a relay. Occupied ports are expected in this mode. FSB's internal Autopilot provider does not need configuration because Codex drives the manual tools. Keep Chrome open, the screen unlocked, and the machine awake while tasks run. Browser cookies and site state are shared; model contexts are independent. Avoid concurrent browser automation during collection.

```sh
node harness/run-bench.mjs --run-id full-codex-01 --driver codex \
  --browser existing --tasks all --max-actions 60 --timeout-seconds 600 \
  --judge --judge-passes 3 --wait-for-resources
```

`--wait-for-resources` checkpoints and polls every 60 seconds for dataset access, extension connectivity, or a model quota reset. Without it, unavailable resources leave a resumable pause. Subscription recovery uses a separate one-word probe before spending the permitted infrastructure retry. Agent failures are never selectively retried. All 300 unique IDs and the dataset checksum are saved before the first task action.

Codex uses an ephemeral context, explicit model/effort and a temporary instruction file. Shell, patching, web search and multi-agent tools are disabled. A non-FSB tool event invalidates the attempt. The parent controller owns FSB and a private Unix socket, so killing the model on timeout leaves ownership available for cleanup. The proxy blocks actions beyond 60; reads do not count toward that action limit. Each attempt has a 600-second model deadline. The legacy Claude driver additionally supports `--max-turns` and `--budget-usd` (a CLI accounting cap, not a subscription billing promise).

The agent must stay on the starting website and stop before payments, account creation or messages. Site compliance can be reviewed using the recorded URLs; the proxy restricts tools and tab ownership, not website redirects. Tool failures, including the observed Back failure, remain in the trace. Production FSB is not changed during a run.

Preflight reserves 2 GB free for a pilot and 15 GB for a full run. This is conservative disk headroom, not an allocation or a measured minimum. The October 16 real fixture used approximately 2 MB for raw evidence and its v2 copy; long tasks and screenshots can be much larger. Actual artifact bytes are reported. The existing-browser preflight checks extension connectivity and the selected driver; it does not require Chrome for Testing or free bridge ports. By default it uses `~/.fsb/native-host/runtime/package/build/index.js`; `--fsb-server-cmd '["command","arg"]'` overrides it.

The legacy `--browser isolated` mode discovers Chrome for Testing or accepts `--chrome <binary>`. It refuses occupied bridge ports and never kills other processes. Its launcher, storage seeding and extension pairing remain unverified on this Mac after Chrome startup failures; they are not required by the approved existing-browser run.

`--tasks path/to/ids.json` runs a chosen subset. Pilot sampling is seeded and proportional by difficulty. All selected IDs are saved before execution and should be treated as seen during later development.

Resume with the same command plus `--resume`. It requires the same dataset/IDs, model, limits, prompt, allowlist, harness, installed native-runtime fingerprint and judge code. A lock prevents overlapping controllers. Task failures are terminal; infrastructure, startup and quota failures may have one retry, with both traces preserved and the first valid attempt selected. If that retry fails, the queue pauses for inspection. An interrupted saved final is processed without another model call. Completed collection can resume judging without browser access. Unattempted tasks always remain in the expected denominator.

## Judging and reporting

```sh
sh judge/run_judges.sh results/pilot-01/trajectories \
  results/pilot-01/judge results/pilot-01/task-ids.json 3
```

This runs both judges for three passes each, with two variants:

- `official`: the unchanged upstream v2 loading behavior, including the terminal answer in action history.
- `strict`: removes that terminal answer from the action text; screenshots stay unchanged.

The name `official` describes the upstream pipeline variant, **not OSU verification or official judge-model equivalence**. See [judge/README.md](judge/README.md) for transport and parser deviations.

The queue schedules both families independently: a Claude quota pause does not prevent Codex judgments. Resume retries only infrastructure errors and keeps previous verdicts. Always use the expected-ID file. Missing and errored trajectories count as zero while pending infrastructure judgments are identified separately. `REPORT.md` lists every pass; aggregates appear only after all requested passes and collection are complete. Per-task CSV/JSON include judge verdicts, and `judge-disagreements.json` records differences.

Publish each pass and its denominator, both judges, the selected dataset revision, restrictions, limits and failures. A full score uses all 300 tasks. Label it **“GPT-6.1 Sol + FSB; WebJudge (claude-opus-5-5, medium), unverified”** and separately report Codex/strict results. These substitute-model scores are not directly comparable to o4-mini leaderboard scores. Synthetic tests and text replay are not benchmark results or human calibration.

## Calibration

```sh
judge/.venv/bin/python calibration/text_replay.py --prepare-only
judge/.venv/bin/python calibration/text_replay.py --engine claude
judge/.venv/bin/python calibration/text_replay.py --engine codex
```

The fixed sample has 30 historical trajectories per released agent (180 total). It pairs OSU's released human labels with o4-mini outputs and supplies the new judges with the historical task, key points and o4-mini's screenshot summaries. It has **no original screenshots or action history**. It measures diagnostic outcome agreement conditional on another judge's descriptions; it cannot validate an end-to-end judge or support a leaderboard score. Historical task versions are retained; they are not asserted to match the current live dataset.

Metrics include accuracy, kappa, success precision/recall/F1, per-agent signed/absolute success-rate gaps, paired McNemar, a model-family false-positive probe, and 95% intervals from 2,000 bootstrap samples clustered by task. Labels `2` count as failure and remain identifiable in source data. Runs cache replies and stop on the first transport/quota error. See [calibration/RESULTS.md](calibration/RESULTS.md).

## Artifacts

`results/<run>/` contains `manifest.json`, frozen `task-ids.json`, `attempts.jsonl`, `outcomes.jsonl`, raw per-task attempt directories with `steps.jsonl`, `shots/`, model stream and `final.json`, exported `trajectories/<task_id>/result.json` plus `trajectory/`, and judge JSONL/usage/summary files. `per-task.csv`, `per-task.json`, `summary.json`, `REPORT.md` and `judge-disagreements.json` are regenerated at checkpoints. Usage totals include failed infrastructure attempts; resource probes and judge usage are logged separately. An execution outcome of `complete` means the CLI finished, not that the task passed WebJudge. Caches, profiles, credentials and results are ignored by Git. Treat run files as private until reviewed for personal information.

The submission schema and judge sources are pinned to [OSU commit f0d805ee](https://github.com/OSU-NLP-Group/Online-Mind2Web/tree/f0d805ee0e9e0b3ea70911e45e5264b72968f3dc). Vendoring manifests record checksums. Node uses built-ins only; Python dependency versions are pinned.
