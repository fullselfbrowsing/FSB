# FSB — final benchmark result (AI-reviewed)

Finalized 2026-10-22T06:32:59.048345+00:00. This is the primary reported result, replacing the earlier automated-only headline at the user’s request.

**277 / 300 tasks — 92.33%**

The final result combines **228 retained Claude-majority verdicts** with **49 supported outcomes** from Codex’s reassessment of the 72 recovered tasks. The remaining **23** receive zero. Each of the 300 tasks is counted once.

## Review attribution and scope

The reassessment was performed by the **Codex AI assistant**, not a human reviewer. It was a non-blind review by the same assistant that performed the recovery. The user completed Target’s human-verification challenge during recovery; that assistance does not constitute human review of the task verdicts.

This is a **mixed-actor composite result**, with native macOS observations, FSB task actions, multiple retries and shared browser state. It is not an autonomous Claude run or a new six-pass WebJudge evaluation. The other 228 tasks retain their previous majority verdicts and were not independently re-reviewed.

## Final task accounting

| Source / outcome | Tasks | Credited |
|---|---:|---:|
| Retained majority passes in both Claude variants | 228 | 228 |
| AI-reassessed, supported goal completion | 49 | 49 |
| AI-reassessed, qualified evidence | 6 | 0 |
| AI-reassessed, goal unmet | 17 | 0 |
| **Total** | **300** | **277** |

The original manual operational ledger marked 55 outcomes completed. Six were withheld after conservative reassessment because of unresolved dates, scenario assumptions, quiz-profile coverage, swimsuit size mapping, latest-news ordering or market-close freshness. No pending authorization is treated as a success.

| Difficulty | Credited / tasks | Rate |
|---|---:|---:|
| easy | 78/80 | 97.50% |
| medium | 133/141 | 94.33% |
| hard | 66/79 | 83.54% |

## Historical automated comparisons

These sealed measurements remain available for reproducibility, but are no longer the selected headline final result.

| Automated evaluation | Official mean, 3 passes | Strict mean, 3 passes |
|---|---:|---:|
| Original Claude run | 79.00% | 72.67% |
| Claude run after serial recovery | 83.33% | 77.00% |

The actor/judge family was Claude Opus 5.5, medium effort, using public FSB extension 0.9.92 and MCP 0.11.2. These substitute-model scores are uncalibrated and not OSU-verified; the composite result is also not directly comparable to the o4-mini leaderboard.

## Evidence and reproducibility

- [Primary machine-readable result](FINAL-RESULT.json)
- [All 300 final task verdicts — CSV](results/final-review-20261022/per-task-final.csv) · [JSON](results/final-review-20261022/per-task-final.json)
- [All 72 AI reassessments — CSV](results/final-review-20261022/task-reviews.csv) · [JSON](results/final-review-20261022/task-reviews.json)
- [Detailed methodology, qualifications and task ledger](FINAL-REPORT.md)
- [Evidence audit](results/final-review-20261022/FINAL-AUDIT.json) · [prior evaluation seal](results/final-review-20261022/FINAL-SEAL.json)
- [This publication’s seal](results/final-reviewed-20261022/FINAL-SEAL.json)

The detailed evaluation verifies 850 screenshot hashes and 43 earlier sealed benchmark files. Selecting this composite headline does not modify any prior task verdict, screenshot, judge output or sealed report.
