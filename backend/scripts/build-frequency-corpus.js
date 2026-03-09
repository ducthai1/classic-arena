/**
 * build-frequency-corpus.js
 *
 * Builds Vietnamese word frequency data from Wikipedia articles.
 * Fetches top-viewed Vietnamese Wikipedia articles, extracts text,
 * and counts unigram + bigram frequencies.
 *
 * Output used by validate-dictionary-llm.js (cross-reference) and
 * mega-merge-dictionary.js (quality filtering for generated compounds).
 *
 * Usage:
 *   node scripts/build-frequency-corpus.js
 *   node scripts/build-frequency-corpus.js --max-articles 100 --min-freq 3
 *   node scripts/build-frequency-corpus.js --checkpoint  (resume)
 */

const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────
const OUTPUT_PATH = path.join(__dirname, '../src/data/sources/wikipedia-frequency.json');
const CHECKPOINT_PATH = path.join(__dirname, '.frequency-checkpoint.json');
const WIKI_API = 'https://vi.wikipedia.org/w/api.php';
const USER_AGENT = 'CroHopee-WordChain/1.0 (frequency corpus builder)';

// Vietnamese character regex for token filtering
const VIET_TOKEN_REGEX = /^[aàáảãạăằắẳẵặâầấẩẫậbcdđeèéẻẽẹêềếểễệghiklmnoòóỏõọôồốổỗộơờớởỡợpqrstuùúủũụưừứửữựvxyỳýỷỹỵ]+$/;

// ─── CLI Args ────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  if (typeof defaultVal === 'boolean') return true;
  return args[idx + 1] || defaultVal;
}

const MAX_ARTICLES = parseInt(getArg('max-articles', '5000'));
const MIN_FREQ = parseInt(getArg('min-freq', '2'));
const DELAY_MS = parseInt(getArg('delay', '200'));
const RESUME = getArg('checkpoint', false);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Checkpoint ──────────────────────────────────────────────
function loadCheckpoint() {
  if (!RESUME || !fs.existsSync(CHECKPOINT_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  } catch { return null; }
}

function saveCheckpoint(state) {
  // Only save counts > 1 to keep checkpoint small
  const trimmed = {
    ...state,
    unigrams: Object.fromEntries(
      Object.entries(state.unigrams).filter(([, v]) => v > 1)
    ),
    bigrams: Object.fromEntries(
      Object.entries(state.bigrams).filter(([, v]) => v > 1)
    ),
  };
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(trimmed), 'utf8');
}

// ─── Wikipedia API ───────────────────────────────────────────

// Content-rich Vietnamese Wikipedia categories (avoid stub/taxonomy articles)
const RICH_CATEGORIES = [
  'Việt_Nam', 'Lịch_sử_Việt_Nam', 'Văn_hóa_Việt_Nam',
  'Địa_lý_Việt_Nam', 'Kinh_tế_Việt_Nam', 'Giáo_dục_Việt_Nam',
  'Khoa_học', 'Công_nghệ', 'Y_học', 'Toán_học', 'Vật_lý',
  'Hóa_học', 'Sinh_học', 'Thiên_văn_học',
  'Văn_học', 'Âm_nhạc', 'Điện_ảnh', 'Thể_thao',
  'Chính_trị', 'Pháp_luật', 'Triết_học', 'Tôn_giáo',
  'Kiến_trúc', 'Nghệ_thuật', 'Ẩm_thực',
  'Hà_Nội', 'Thành_phố_Hồ_Chí_Minh', 'Đà_Nẵng',
  'Lịch_sử', 'Địa_lý', 'Kinh_tế', 'Xã_hội',
];

/** Fetch article titles from a content-rich category */
async function fetchCategoryArticles(category, cmcontinue, limit = 50) {
  const params = new URLSearchParams({
    action: 'query',
    list: 'categorymembers',
    cmtitle: `Thể_loại:${category}`,
    cmlimit: String(limit),
    cmnamespace: '0',
    cmtype: 'page',
    format: 'json',
  });
  if (cmcontinue) params.set('cmcontinue', cmcontinue);

  const url = `${WIKI_API}?${params.toString()}`;
  const data = await fetchWithRetry(url);
  const titles = (data?.query?.categorymembers || []).map(p => p.title);
  const nextContinue = data?.continue?.cmcontinue || null;
  return { titles, cmcontinue: nextContinue };
}

/** Fetch article text extract (plain text, no markup) */
async function fetchArticleText(titles) {
  const params = new URLSearchParams({
    action: 'query',
    titles: titles.join('|'),
    prop: 'extracts',
    explaintext: 'true',
    exlimit: String(titles.length),
    exsectionformat: 'plain',
    format: 'json',
  });

  const url = `${WIKI_API}?${params.toString()}`;
  const data = await fetchWithRetry(url);
  const pages = data?.query?.pages || {};
  const texts = [];

  for (const page of Object.values(pages)) {
    if (page.extract && page.extract.length > 100) {
      texts.push(page.extract);
    }
  }

  return texts;
}

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT }
      });

      if (response.status === 429) {
        await sleep(DELAY_MS * attempt * 5);
        continue;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      if (attempt < retries) {
        await sleep(DELAY_MS * attempt * 2);
      } else {
        throw err;
      }
    }
  }
}

// ─── Text Processing ─────────────────────────────────────────

/** Clean Wikipedia extract text — remove section headers, references, etc. */
function cleanText(text) {
  return text
    .replace(/==+[^=]+=+/g, ' ')         // Remove section headers
    .replace(/\([^)]*\)/g, ' ')           // Remove parenthetical content
    .replace(/\[[^\]]*\]/g, ' ')          // Remove bracket content
    .replace(/[0-9.,;:!?"""''(){}[\]<>\/\\|@#$%^&*+=~`—–·•…]/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokenize text into Vietnamese tokens */
function tokenize(text) {
  const cleaned = cleanText(text);
  const rawTokens = cleaned.split(/\s+/);
  const tokens = [];

  for (const token of rawTokens) {
    const normalized = token.toLowerCase().normalize('NFC');
    // Must be Vietnamese-only characters, reasonable length
    if (normalized.length >= 1 && normalized.length <= 15 && VIET_TOKEN_REGEX.test(normalized)) {
      tokens.push(normalized);
    }
  }

  return tokens;
}

/** Count unigrams and bigrams from tokens */
function countFrequencies(tokens, unigrams, bigrams) {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    unigrams[token] = (unigrams[token] || 0) + 1;

    // Bigram: consecutive pair = potential 2-syllable word
    if (i < tokens.length - 1) {
      const bigram = token + ' ' + tokens[i + 1];
      bigrams[bigram] = (bigrams[bigram] || 0) + 1;
    }
  }
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log('Vietnamese Wikipedia Frequency Corpus Builder');
  console.log('=============================================\n');

  // Load checkpoint or start fresh
  let state = loadCheckpoint() || {
    articlesProcessed: 0,
    totalTokens: 0,
    categoryIndex: 0,
    cmcontinue: null,
    processedTitles: [],
    unigrams: {},
    bigrams: {},
  };

  // Rebuild processed titles set from checkpoint
  const processedSet = new Set(state.processedTitles || []);

  console.log(`Target: ${MAX_ARTICLES} articles from ${RICH_CATEGORIES.length} categories, min frequency: ${MIN_FREQ}`);
  if (state.articlesProcessed > 0) {
    console.log(`Resuming from checkpoint: ${state.articlesProcessed} articles, category ${state.categoryIndex}`);
  }
  console.log('');

  const BATCH_SIZE = 50; // Articles per API call

  outerLoop:
  for (let ci = state.categoryIndex; ci < RICH_CATEGORIES.length; ci++) {
    if (state.articlesProcessed >= MAX_ARTICLES) break;

    const category = RICH_CATEGORIES[ci];
    let cmcontinue = (ci === state.categoryIndex) ? state.cmcontinue : null;

    console.log(`\n  Category: ${category}`);

    while (state.articlesProcessed < MAX_ARTICLES) {
      const result = await fetchCategoryArticles(category, cmcontinue, BATCH_SIZE);

      if (result.titles.length === 0) break; // Category exhausted

      // Filter out already-processed titles
      const newTitles = result.titles.filter(t => !processedSet.has(t));
      if (newTitles.length === 0) {
        if (!result.cmcontinue) break;
        cmcontinue = result.cmcontinue;
        await sleep(DELAY_MS);
        continue;
      }

      await sleep(DELAY_MS);

      // Fetch texts in sub-batches of 20 (API limit for extracts)
      for (let i = 0; i < newTitles.length; i += 20) {
        const batch = newTitles.slice(i, i + 20);
        const texts = await fetchArticleText(batch);

        for (const text of texts) {
          const tokens = tokenize(text);
          countFrequencies(tokens, state.unigrams, state.bigrams);
          state.totalTokens += tokens.length;
        }

        // Track processed titles (keep only count to save memory)
        for (const t of batch) processedSet.add(t);
        state.articlesProcessed += batch.length;

        process.stdout.write(`  Articles: ${state.articlesProcessed}/${MAX_ARTICLES} | Tokens: ${state.totalTokens.toLocaleString()} | Unigrams: ${Object.keys(state.unigrams).length} | Bigrams: ${Object.keys(state.bigrams).length}\r`);

        if (state.articlesProcessed >= MAX_ARTICLES) break outerLoop;
        if (i + 20 < newTitles.length) await sleep(DELAY_MS);
      }

      // Save checkpoint
      if (state.articlesProcessed % 100 < BATCH_SIZE) {
        state.categoryIndex = ci;
        state.cmcontinue = result.cmcontinue;
        state.processedTitles = Array.from(processedSet);
        saveCheckpoint(state);
      }

      if (!result.cmcontinue) break; // No more pages in category
      cmcontinue = result.cmcontinue;
      await sleep(DELAY_MS);
    }
  }

  console.log('\n\nFiltering by minimum frequency...');

  // Filter by min frequency
  const filteredUnigrams = {};
  const filteredBigrams = {};
  let unigramCount = 0;
  let bigramCount = 0;

  for (const [word, freq] of Object.entries(state.unigrams)) {
    if (freq >= MIN_FREQ) {
      filteredUnigrams[word] = freq;
      unigramCount++;
    }
  }

  for (const [word, freq] of Object.entries(state.bigrams)) {
    if (freq >= MIN_FREQ) {
      filteredBigrams[word] = freq;
      bigramCount++;
    }
  }

  console.log(`  Unigrams: ${Object.keys(state.unigrams).length} → ${unigramCount} (freq >= ${MIN_FREQ})`);
  console.log(`  Bigrams: ${Object.keys(state.bigrams).length} → ${bigramCount} (freq >= ${MIN_FREQ})`);

  // Write output
  const output = {
    metadata: {
      source: 'viwiki-allpages',
      articlesProcessed: state.articlesProcessed,
      totalTokens: state.totalTokens,
      minFreq: MIN_FREQ,
      generatedAt: new Date().toISOString(),
    },
    unigrams: filteredUnigrams,
    bigrams: filteredBigrams,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  const fileSize = fs.statSync(OUTPUT_PATH).size;

  // Summary
  console.log('\n=============================================');
  console.log('SUMMARY');
  console.log('=============================================');
  console.log(`  Articles processed: ${state.articlesProcessed}`);
  console.log(`  Total tokens: ${state.totalTokens.toLocaleString()}`);
  console.log(`  Unique unigrams (freq >= ${MIN_FREQ}): ${unigramCount.toLocaleString()}`);
  console.log(`  Unique bigrams (freq >= ${MIN_FREQ}): ${bigramCount.toLocaleString()}`);
  console.log(`  Output: ${OUTPUT_PATH}`);
  console.log(`  File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
  console.log('=============================================');

  // Top 20 bigrams for sanity check
  console.log('\nTop 20 bigrams:');
  const topBigrams = Object.entries(filteredBigrams)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  for (const [word, freq] of topBigrams) {
    console.log(`  ${word}: ${freq}`);
  }

  // Cleanup checkpoint
  if (fs.existsSync(CHECKPOINT_PATH)) fs.unlinkSync(CHECKPOINT_PATH);
  console.log('\nCheckpoint cleaned up. Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
