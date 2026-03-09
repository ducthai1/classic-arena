# Phase 2: Wiktionary Enrichment

**Parent Plan:** [plan.md](./plan.md)
**Dependencies:** None
**Date:** 2026-03-09
**Priority:** Medium
**Status:** Pending

## Overview

Crawl Vietnamese Wiktionary via MediaWiki API to extract all Vietnamese word entries. These are guaranteed real words (have definitions). Output as new source file for the merge pipeline.

## Key Insights

- Vietnamese Wiktionary has ~60K entries with definitions
- Existing `sources/wiktionary-words.txt` already has some Wiktionary data (JSON lines format) — this crawl will be more comprehensive
- MediaWiki API supports category member enumeration — "Mục từ tiếng Việt" category
- API is free, no key needed, just rate-limit courtesy (200ms between requests)
- Words with definitions = highest confidence source

## Requirements

- Node.js 18+ (native fetch)
- No API key needed
- NFC normalization on all output
- Resumable checkpoint for the crawl
- Output compatible with mega-merge pipeline

## Architecture

```
vi.wiktionary.org API
        │
        ▼ (categorymembers query, 500/page)
┌─────────────────────┐
│ crawl-wiktionary     │──► .wiktionary-checkpoint.json
│      -vi.js          │
└─────────┬───────────┘
          │
          ▼
    NFC normalize
    lowercase, trim
    dedup vs current dict
          │
          ▼
  wiktionary-crawled.txt (plain text, one word/line)
  → backend/src/data/sources/
```

## Related Code Files

- `backend/src/data/sources/wiktionary-words.txt` — existing partial Wiktionary data
- `backend/scripts/mega-merge-dictionary.js` — will consume new source in Phase 4
- `backend/src/services/word-chain-dictionary.ts` — normalizeWord for reference

## Implementation Steps

### 1. Script setup (`backend/scripts/crawl-wiktionary-vi.js`)

1. No external dependencies (native fetch + fs)
2. CLI args: `--checkpoint <path>`, `--delay <ms>` (default 200), `--max-pages <n>` (optional, for testing)
3. Output path: `backend/src/data/sources/wiktionary-crawled.txt`

### 2. Category enumeration

1. Target category: "Mục từ tiếng Việt" (Vietnamese entries)
2. Also crawl sub-categories:
   - "Danh từ tiếng Việt" (nouns)
   - "Động từ tiếng Việt" (verbs)
   - "Tính từ tiếng Việt" (adjectives)
   - "Phó từ tiếng Việt" (adverbs)
   - "Thành ngữ tiếng Việt" (idioms — skip if >4 syllables)
3. API endpoint: `https://vi.wiktionary.org/w/api.php`
4. Query params:
   ```
   action=query
   list=categorymembers
   cmtitle=Thể_loại:Mục_từ_tiếng_Việt
   cmlimit=500
   cmnamespace=0
   cmtype=page
   format=json
   ```
5. Pagination: use `cmcontinue` token until exhausted

### 3. Word extraction and filtering

1. From each category member, extract `title` field
2. Skip titles containing: `/`, `:`, `Phụ lục`, `Bản mẫu`, `Wiktionary:`
3. NFC normalize: `word.normalize('NFC').trim().toLowerCase()`
4. Apply tone position normalization (port from `word-chain-dictionary.ts`)
5. Validate with Vietnamese char regex from mega-merge
6. Skip words >8 syllables (not useful for word chain)

### 4. Checkpoint system

1. File: `backend/scripts/.wiktionary-checkpoint.json`
2. Structure:
   ```json
   {
     "category": "Mục_từ_tiếng_Việt",
     "cmcontinue": "...",
     "wordsCollected": 45000,
     "pagesProcessed": 90,
     "categories": {
       "Mục_từ_tiếng_Việt": { "done": true, "words": 42000 },
       "Danh_từ_tiếng_Việt": { "done": false, "cmcontinue": "..." }
     }
   }
   ```
3. Save after every API page (500 entries)
4. On resume: skip completed categories, resume from cmcontinue

### 5. Deduplication

1. Load current `vietnamese-wordlist.txt` into Set (normalized)
2. Load existing `wiktionary-words.txt` into Set
3. Report: "X total from Wiktionary, Y already in dictionary, Z genuinely new"

### 6. Output

1. Write `wiktionary-crawled.txt` — plain text, one word per line, NFC normalized, sorted
2. Console summary:
   - Total words crawled
   - By category breakdown
   - New words not in current dictionary
   - Skipped entries (with reason counts)

## Todo

- [ ] Create `backend/scripts/crawl-wiktionary-vi.js`
- [ ] Implement MediaWiki API category member pagination
- [ ] Implement sub-category crawling (nouns, verbs, adjectives, adverbs)
- [ ] Implement NFC normalization + Vietnamese char validation
- [ ] Implement checkpoint save/load
- [ ] Implement deduplication against current dictionary
- [ ] Test with `--max-pages 2` first
- [ ] Full crawl run
- [ ] Verify output file loads correctly in mega-merge pipeline

## Success Criteria

- Crawl completes all target categories
- Output contains 40K+ unique Vietnamese words
- 5K+ genuinely new words not in current dictionary
- All words NFC-normalized and valid Vietnamese characters
- Checkpoint allows resume after network interruption
- Rate limiting respected (no 429 errors)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Wiktionary API down/slow | Low | Low | Checkpoint resume, retry logic |
| Category structure changed | Low | Medium | Log warnings, fall back to main category |
| Non-Vietnamese entries in category | Medium | Low | Regex validation filters them |
| Rate limiting by Wikimedia | Low | Medium | 200ms delay, exponential backoff on 429 |

## Security Considerations

- No API key needed — public API
- No user data sent
- Only reads public Wiktionary data
- Respectful crawling: 200ms delay, proper User-Agent header

## Next Steps

Output file `wiktionary-crawled.txt` feeds into Phase 4 as a new source for mega-merge pipeline.
