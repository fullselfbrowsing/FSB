# Calibration status — 2026-10-15

The deterministic 180-item historical sample is prepared (30 paired items per agent, seed `20261015`). Source files are pinned to OSU commit `f0d805ee0e9e0b3ea70911e45e5264b72968f3dc`; downloads and hashes are cached locally. Human label `2` is mapped to failure, matching the declared denominator policy.

| Judge on this sample | Agreement | Kappa | Success precision | Success recall | Mean signed SR gap |
|---|---:|---:|---:|---:|---:|
| Published o4-mini labels | 85.0% | 0.685 | 83.8% | 78.1% | −2.78 pp |
| Claude Opus 5.5 text replay | Pending | Pending | Pending | Pending | Pending |
| Codex GPT-6.1 Sol text replay | Pending | Pending | Pending | Pending | Pending |

For the published o4-mini labels, 95% bootstrap intervals clustered by task are 79.9–89.8% agreement, 0.572–0.784 kappa, 74.3–92.2% precision and 67.8–87.2% recall (2,000 resamples). The mean absolute per-agent SR gap is 9.44 pp; signed gaps can cancel and should not be reported alone. These are recomputed historical baseline metrics, not new model judgments.

Claude is blocked by its subscription quota until 1pm America/Chicago. Codex passed an image-complete synthetic pipeline test; its 180-item text replay has not been run. No new judge has been established as calibrated against humans.

Reproduce the baseline with `judge/.venv/bin/python calibration/text_replay.py --prepare-only` from the bench directory. Run the same fixed sample with `--engine claude` and `--engine codex` when available. Replies are resume-safe; errors stop a run rather than silently dropping rows. Summary metrics always identify requested and completed counts and compute the paired o4-mini comparison on exactly the completed subset.

Text replay supplies o4-mini's own screenshot descriptions, historical task and key points, without images or action history. It tests agreement conditional on that evidence and can inherit its omissions and bias. It does not replace human grading of fresh FSB trajectories or image-complete calibration. Historical task versions are not claimed to match the current gated live task set. Model-family comparisons are diagnostic and do not establish a statistically significant bias.
