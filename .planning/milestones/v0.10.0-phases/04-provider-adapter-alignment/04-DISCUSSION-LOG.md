# Phase 4: Provider adapter alignment - Discussion Log (Assumptions Mode)

> Audit trail only. Decisions captured in CONTEXT.md.

**Date:** 2026-05-24
**Phase:** 04-provider-adapter-alignment
**Mode:** assumptions (autonomous -- user directive + user pre-confirmed Phase 4 defaults)

## User Pre-Confirmed Defaults (Phase 4 entry)

- Test strategy: fake providers / fake fetch (no live API calls)
- Adapter scope: parity-only (provider-specific extensions deferred)
- FSB `universal-provider.js` UNTOUCHED (Lattice-side INV-03 parity smoke only)
- Non-streaming first
- ~5 plans across ~4 waves

## Assumptions Presented

### Adapter implementation strategy
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| 5 sibling files: Anthropic + Gemini full custom; xAI + OpenRouter + LM Studio thin wrappers around createOpenAICompatibleProvider | Likely | FSB PROVIDER_CONFIGS at universal-provider.js:7-52 -- only Anthropic + Gemini have customFormat: true; xAI/OpenRouter/LM-Studio confirmed OpenAI-compat at FSB level; sibling-file pattern matches Phase 2/3 module hygiene |

### Test strategy (per-adapter coverage)
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Each adapter ships .test.ts with makeFakeFetch pattern; ~7 cases each; no createFakeProvider at per-adapter layer; no live API calls | Confident | adapters.test.ts:10-16 makeFakeFetch helper exists; createOpenAICompatibleProvider.fetch is injectable; user pre-confirmed no live calls |

### INV-03 parity smoke design
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| ONE Lattice-side parity.test.ts iterating 7 logical providers + ONE FSB-side thin surface-presence smoke (Phase 1-3 ceremony parity) | Likely | Phase 3 IN-02 noted "INV-06: FSB consumes, Lattice owns contract coverage"; per-phase FSB smoke ceremony from Phases 1-3 |

### Audit-doc row mapping
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| 5 rows flip to Covered (Anthropic + Gemini + xAI + LM Studio + OpenRouter); LM Studio latency-tail + OpenRouter routing sub-clauses explicitly deferred via row notes | Likely | lattice/docs/fsb-integration-gaps.md lines 43-51 inventory; Phase 3 precedent for multi-commit backlinks |

### Phase 5 boundary preservation
| Assumption | Confidence | Evidence |
|------------|-----------|----------|
| Single-shot Promise adapters; AbortSignal threaded but no streaming/eviction-resume; provider-specific extensions deferred | Confident | adapters.ts:48-130 single-shot pattern; ROADMAP Phase 5 has MV3-survivability scope; user pre-confirmation locks |

## Corrections Made

No human corrections -- autonomous mode.

## Auto-Resolved

No Unclear assumptions surfaced.

## External Research Flagged

5 items flagged for plan-phase researcher (sanity-check against FSB's universal-provider.js authoritative shape):

- Anthropic Messages API current schema (anthropic-version header)
- Gemini generateContent schema (BLOCK_NONE thresholds, v1beta)
- xAI Grok completion_tokens_details.reasoning_tokens stability
- LM Studio OpenAI-compat parity guarantees
- OpenRouter model routing feature (Phase 4 defers; JSDoc carryforward)

Default: trust FSB's production-running universal-provider.js as authoritative; researcher confirm-or-fix if research-time gates demand.

## Phase Boundary Anchor

5 native adapters + 2 smokes + audit-doc closure + LATTICE-PIN/REQUIREMENTS ceremony. NO FSB extension/* modifications. NO streaming. NO provider-specific extensions beyond parity. NO mid-flight eviction/resume.

## Question/Answer Statistics

- Areas analyzed: 5
- Assumptions surfaced: 5
- Confident: 2
- Likely: 3
- Unclear: 0
- Human interactions: 0 (autonomous; user pre-confirmed Phase 4 defaults)
- External research items flagged for plan-phase: 5
- Scope creep redirects: 0 (analyzer stayed within Providers domain)
