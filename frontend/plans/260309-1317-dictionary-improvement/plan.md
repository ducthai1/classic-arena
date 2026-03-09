# Vietnamese Dictionary Improvement System

**Date:** 2026-03-09
**Status:** Planning
**Goal:** Clean ~120K auto-generated compounds via LLM validation, enrich dictionary with Wiktionary/Wikipedia data, re-merge with higher quality output.

## Summary

Current dictionary (255K words) contains ~120K auto-generated compounds from `mega-merge-dictionary.js` Phase 3. Many are plausible but nonsensical Vietnamese. This plan uses Gemini Flash to flag invalid compounds, crawls Wiktionary for verified words, builds a Wikipedia frequency corpus for cross-referencing, then re-runs the merge pipeline with improved quality.

**Safety principle:** NEVER delete words that might be valid. When in doubt, KEEP.

## Phases

| # | Phase | File | Status | Dependencies |
|---|-------|------|--------|-------------|
| 1 | LLM-based Safe Word Filter | [phase-01-llm-word-filter.md](./phase-01-llm-word-filter.md) | done | Phase 3 (optional, for cross-ref) |
| 2 | Wiktionary Enrichment | [phase-02-wiktionary-enrichment.md](./phase-02-wiktionary-enrichment.md) | done | none |
| 3 | Wikipedia Frequency Corpus | [phase-03-wikipedia-frequency.md](./phase-03-wikipedia-frequency.md) | done | none |
| 4 | Integration & Merge | [phase-04-integration-merge.md](./phase-04-integration-merge.md) | done | Phases 1-3 |

## Execution Order

Phases 2 and 3 can run in parallel (independent data sources). Phase 1 benefits from Phase 3 output (frequency data as cross-ref signal) but can run standalone. Phase 4 depends on all prior phases.

Recommended: Run 2 + 3 first, then 1 (with frequency data), then 4.

## Key Files

- Dictionary: `backend/src/data/vietnamese-wordlist.txt` (255K words)
- Merge script: `backend/scripts/mega-merge-dictionary.js`
- Dictionary loader: `backend/src/services/word-chain-dictionary.ts`
- Sources dir: `backend/src/data/sources/` (23 files)
- Missing word model: `backend/src/models/MissingWord.ts`
- Scan script: `backend/src/data/scan_invalid_words.ts`

## Estimated Cost

- Gemini Flash validation: <$0.15 (free tier possible at 15 RPM)
- Wikipedia dump: free (bandwidth only)
- Wiktionary API: free (rate-limited crawl)
