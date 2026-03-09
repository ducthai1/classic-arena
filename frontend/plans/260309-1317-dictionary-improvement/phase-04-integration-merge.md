# Phase 4: Integration & Merge

**Parent Plan:** [plan.md](./plan.md)
**Dependencies:** Phases 1, 2, 3 (all must complete first)
**Date:** 2026-03-09
**Priority:** High
**Status:** Pending

## Overview

Integrate all outputs from Phases 1-3 into the existing mega-merge pipeline. Add Wiktionary as new source, use frequency data to filter generated compounds, apply LLM cleanup results. Re-run pipeline to produce improved `vietnamese-wordlist.txt`.

## Key Insights

- `mega-merge-dictionary.js` has clean separation: Phase 2 (sources) → Phase 3 (generation) → Phase 4 (cleanup) → Phase 5 (output)
- Adding a new source = one `processPlainTextFile()` call in Phase 2
- Frequency-based filtering = check generated compounds against bigram frequencies
- LLM cleanup = load blacklist of confirmed-invalid words, exclude from final output
- Must validate final output loads correctly in `word-chain-dictionary.ts`

## Requirements

- All Phase 1-3 outputs available:
  - `backend/scripts/cleaned-wordlist.txt` or `validation-report.json` (Phase 1)
  - `backend/src/data/sources/wiktionary-crawled.txt` (Phase 2)
  - `backend/src/data/sources/wikipedia-frequency.json` (Phase 3)
- Backup current `vietnamese-wordlist.txt` before overwriting
- Validate final output with existing loader

## Architecture

```
┌──────────────────────────┐
│ mega-merge-dictionary.js │
│ (updated)                │
└──────────┬───────────────┘
           │
  Phase 2 (sources):
  ├── existing 12 sources
  ├── NEW: wiktionary-crawled.txt  ◄── Phase 2 output
  │
  Phase 3 (generation):
  ├── existing compound generation
  ├── NEW: frequency filter         ◄── Phase 3 output
  │   (skip compounds with 0 freq
  │    AND both syllables low-freq)
  │
  Phase 4 (cleanup):
  ├── existing validation
  ├── NEW: LLM blacklist filter     ◄── Phase 1 output
  │   (remove confirmed-invalid words)
  │
  Phase 5 (output):
  └── vietnamese-wordlist.txt (improved)
         │
         ▼
  Validate with word-chain-dictionary.ts loader
```

## Related Code Files

- `backend/scripts/mega-merge-dictionary.js` — main merge script (689 lines)
- `backend/src/services/word-chain-dictionary.ts` — runtime loader (validation target)
- `backend/src/data/vietnamese-wordlist.txt` — output file

## Implementation Steps

### 1. Backup current dictionary

1. Before any changes: `cp vietnamese-wordlist.txt vietnamese-wordlist.txt.bak`
2. Record current word count for comparison

### 2. Update mega-merge: Add Wiktionary source

1. In Phase 2 section of `mega-merge-dictionary.js`, add after Source 11:
   ```javascript
   // Source 12: Wiktionary Crawled (comprehensive)
   console.log('  [12/13] Wiktionary Crawled (comprehensive)');
   processPlainTextFile(
     path.join(SOURCES_DIR, 'wiktionary-crawled.txt'),
     wordSet, 'wiktionary-crawled'
   );
   ```
2. Update source numbering comments (12/12 → 13/13 etc.)

### 3. Update mega-merge: Frequency-based compound filtering

1. At top of Phase 3 (compound generation), load frequency data:
   ```javascript
   const FREQ_PATH = path.join(SOURCES_DIR, 'wikipedia-frequency.json');
   let bigramFreq = null;
   if (fs.existsSync(FREQ_PATH)) {
     bigramFreq = JSON.parse(fs.readFileSync(FREQ_PATH, 'utf8'));
     console.log('  Loaded frequency corpus for quality filtering');
   }
   ```
2. In each compound generation strategy, add optional frequency check:
   - If `bigramFreq` loaded AND compound exists in `bigramFreq.bigrams` with freq > 0 → always keep
   - If compound NOT in bigrams AND both syllables have unigram freq < 10 → skip (low-quality)
   - This is a SOFT filter — only skips the most dubious combinations
3. Log how many compounds were filtered by frequency

### 4. Update mega-merge: LLM blacklist integration

1. At top of Phase 4 (cleanup), load LLM validation results:
   ```javascript
   const BLACKLIST_PATH = path.join(__dirname, 'validation-report.json');
   let llmBlacklist = new Set();
   if (fs.existsSync(BLACKLIST_PATH)) {
     const report = JSON.parse(fs.readFileSync(BLACKLIST_PATH, 'utf8'));
     llmBlacklist = new Set(report.removedWords || []);
     console.log(`  Loaded LLM blacklist: ${llmBlacklist.size} words to remove`);
   }
   ```
2. In Phase 4 validation loop, add blacklist check:
   ```javascript
   if (llmBlacklist.has(word)) {
     rejected++;
     continue;
   }
   ```
3. Log blacklist rejection count separately

### 5. Run updated merge pipeline

1. `node backend/scripts/mega-merge-dictionary.js`
2. Compare output stats with previous run:
   - Total words (expect slight decrease from cleanup, increase from Wiktionary)
   - New words from Wiktionary source
   - Words removed by LLM blacklist
   - Words filtered by frequency

### 6. Validate output

1. Load new `vietnamese-wordlist.txt` with dictionary loader:
   ```javascript
   // Quick validation script
   const { loadDictionary } = require('../src/services/word-chain-dictionary');
   const dict = loadDictionary();
   console.log('Total:', dict.totalWords);
   console.log('By first syllable entries:', dict.byFirstSyllable.size);
   ```
2. Verify:
   - No loading errors
   - Word count is reasonable (200K-260K range)
   - First-syllable index has similar coverage
   - Spot-check: common words still present ("xin chào", "cảm ơn", "việt nam")
   - Spot-check: known invalid words removed

### 7. Integration test

1. Start backend server locally
2. Create a Word Chain game room
3. Play a few rounds — verify word validation works
4. Test edge cases: long words, tone variants, common compounds

## Todo

- [ ] Backup current `vietnamese-wordlist.txt`
- [ ] Add `wiktionary-crawled.txt` as new source in mega-merge Phase 2
- [ ] Add frequency-based filtering in mega-merge Phase 3
- [ ] Add LLM blacklist filtering in mega-merge Phase 4
- [ ] Update source numbering and log messages
- [ ] Run updated mega-merge pipeline
- [ ] Compare before/after stats
- [ ] Validate output with dictionary loader
- [ ] Integration test with Word Chain game
- [ ] Remove backup file after confirming success

## Success Criteria

- Pipeline runs without errors
- Final dictionary: 200K-260K words (within reasonable range)
- Wiktionary adds 3K+ new words
- LLM blacklist removes 15K-30K invalid compounds
- Dictionary loader validates successfully
- Word Chain game works correctly with new dictionary
- No regression: common words still present

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Merge produces too few words | Low | High | Backup + easy rollback; frequency filter is soft |
| Valid words accidentally removed | Low | High | Source words exempt; UNCERTAIN=keep; manual review |
| Dictionary loader fails | Low | Medium | Validate before deploying; backup available |
| Game regression | Low | Medium | Integration test before deploy |

## Security Considerations

- No external API calls in this phase
- Backup file ensures rollback capability
- No secrets or credentials involved
- Test locally before any production deployment

## Next Steps

After successful integration:
1. Deploy updated dictionary to production
2. Monitor Word Chain game for player complaints about missing words
3. Review `MissingWord` collection periodically — if spike, investigate
4. Consider scheduling periodic re-validation (quarterly)
