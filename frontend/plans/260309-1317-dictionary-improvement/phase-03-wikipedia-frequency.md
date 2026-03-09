# Phase 3: Wikipedia Frequency Corpus

**Parent Plan:** [plan.md](./plan.md)
**Dependencies:** None
**Date:** 2026-03-09
**Priority:** Medium
**Status:** Pending

## Overview

Build a word/bigram frequency corpus from Vietnamese Wikipedia. Used as cross-reference signal in Phase 1 (LLM validation) — words appearing in Wikipedia are likely real. Also useful for Phase 4 to filter low-quality generated compounds.

## Key Insights

- Vietnamese Wikipedia: ~1.3M articles, ~90M words of running text
- Full dump is ~700MB compressed — too heavy for this use case
- Better approach: use pre-processed Vietnamese word frequency lists or Wikipedia dump with streaming parser
- Alternative: use Wikimedia dump API to get article text in batches
- We only need bigram (2-word) frequencies since most compounds are 2 syllables
- A simpler alternative: use the `viwiki-frequency` dataset from Hugging Face or similar

## Requirements

- Node.js 18+ (native fetch + streaming)
- ~500MB disk for processing (temp, deleted after)
- Output: JSON frequency map, <50MB
- NFC normalization on all extracted text

## Architecture

```
Option A: Pre-processed dataset
  huggingface/viwiki-frequency
        │
        ▼
  download + parse
        │
        ▼

Option B: Wikipedia dump (streaming)
  dumps.wikimedia.org/viwiki/latest/
  viwiki-latest-pages-articles.xml.bz2
        │
        ▼
  streaming XML parser (sax)
  → extract article text
  → tokenize by spaces
  → count unigrams + bigrams
        │
        ▼

┌─────────────────────┐
│ build-frequency      │──► .frequency-checkpoint.json
│    -corpus.js        │
└─────────┬───────────┘
          │
          ▼
  NFC normalize all tokens
  Filter: Vietnamese chars only
  Count: unigrams + bigrams
          │
          ▼
  wikipedia-frequency.json
  → backend/src/data/sources/
```

## Related Code Files

- `backend/scripts/mega-merge-dictionary.js` — VIETNAMESE_CHAR_REGEX for filtering
- `backend/src/services/word-chain-dictionary.ts` — normalizeWord reference

## Implementation Steps

### 1. Script setup (`backend/scripts/build-frequency-corpus.js`)

1. CLI args: `--source <dump|dataset>`, `--min-freq <n>` (default 2), `--max-entries <n>`
2. Output: `backend/src/data/sources/wikipedia-frequency.json`
3. Dependencies: none for dataset approach; `sax` for dump parsing (optional)

### 2. Option A: Pre-processed dataset (recommended — simpler)

1. Check for existing Vietnamese word frequency datasets:
   - GitHub: `other Vietnamese NLP resources`
   - Alternative: Build from Wiktionary article text (reuse Phase 2 data)
2. If using a frequency list CSV/TSV:
   - Download, parse, NFC normalize
   - Filter to Vietnamese-only characters
   - Output as JSON map

### 3. Option B: Wikipedia dump streaming (if no dataset available)

1. Download: `https://dumps.wikimedia.org/viwiki/latest/viwiki-latest-pages-articles.xml.bz2`
2. Stream decompress with `zlib` or shell `bzcat` pipe
3. Parse XML with streaming SAX parser (no full DOM load)
4. For each `<text>` element:
   - Strip wikimarkup: `[[link|text]]` → `text`, remove `{{templates}}`, `<tags>`
   - Simple regex cleanup: remove non-text content
   - Split into sentences, then tokens (space-separated)
5. Count:
   - Unigrams: single token frequency
   - Bigrams: consecutive token pairs (= potential 2-syllable words)
6. Checkpoint: save progress every 10K articles

### 4. Token normalization

1. NFC normalize every token
2. Lowercase
3. Filter: must match `VIETNAMESE_CHAR_REGEX` (from mega-merge)
4. Skip tokens >20 chars (noise)

### 5. Output format

```json
{
  "metadata": {
    "source": "viwiki-20260309",
    "articlesProcessed": 1300000,
    "totalTokens": 90000000,
    "minFreq": 2,
    "generatedAt": "ISO"
  },
  "unigrams": {
    "của": 5200000,
    "là": 3100000,
    "và": 2800000
  },
  "bigrams": {
    "việt nam": 180000,
    "thành phố": 95000,
    "hoa hồng": 1200
  }
}
```

Only include entries with freq >= `minFreq` to keep file size manageable.

### 6. Optimization

1. Use `Map` for counting (faster than object for large counts)
2. Flush to disk periodically if memory exceeds threshold
3. Final sort by frequency descending
4. Expected output size: 20-40MB JSON (with min-freq=2)

## Todo

- [ ] Research available Vietnamese frequency datasets (avoid full dump if possible)
- [ ] Create `backend/scripts/build-frequency-corpus.js`
- [ ] Implement dataset download + parse (Option A)
- [ ] Implement Wikipedia dump streaming as fallback (Option B)
- [ ] Implement token normalization + Vietnamese filtering
- [ ] Implement bigram counting
- [ ] Implement checkpoint for long-running dump processing
- [ ] Test with small sample first
- [ ] Full build run
- [ ] Verify output loads correctly in Phase 1 script

## Success Criteria

- Frequency corpus contains 100K+ unique bigrams
- Covers majority of common Vietnamese 2-syllable words
- File size <50MB
- All entries NFC-normalized
- Processing completes within 30 min (dataset) or 2 hours (dump)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Wikipedia dump too large for disk | Low | Medium | Use dataset approach; or stream without saving |
| No good pre-processed dataset | Medium | Low | Fall back to dump approach |
| Memory issues with large corpus | Medium | Medium | Streaming parser, periodic flush |
| Wikimarkup not fully cleaned | Medium | Low | Conservative regex, Vietnamese-only filter catches noise |

## Security Considerations

- No API keys needed
- Downloads from trusted sources (Wikimedia, Hugging Face)
- No user data involved
- Large file downloads — verify checksums if available

## Next Steps

Output `wikipedia-frequency.json` used by:
- Phase 1: cross-reference signal for LLM validation
- Phase 4: optional frequency-based filtering for generated compounds
