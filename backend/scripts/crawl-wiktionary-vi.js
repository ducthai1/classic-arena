/**
 * crawl-wiktionary-vi.js
 *
 * Crawls Vietnamese Wiktionary to extract verified Vietnamese words.
 * Words with Wiktionary entries = guaranteed real words (have definitions).
 *
 * Usage:
 *   node scripts/crawl-wiktionary-vi.js
 *   node scripts/crawl-wiktionary-vi.js --delay 300 --max-pages 5
 *   node scripts/crawl-wiktionary-vi.js --checkpoint  (resume from saved progress)
 */

const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────
const API_URL = 'https://vi.wiktionary.org/w/api.php';
const OUTPUT_PATH = path.join(__dirname, '../src/data/sources/wiktionary-crawled.txt');
const CHECKPOINT_PATH = path.join(__dirname, '.wiktionary-checkpoint.json');
const USER_AGENT = 'CroHopee-WordChain/1.0 (dictionary enrichment bot)';

// Vietnamese character validation (from mega-merge)
const VIETNAMESE_CHAR_REGEX = /^[aàáảãạăằắẳẵặâầấẩẫậbcdđeèéẻẽẹêềếểễệghiklmnoòóỏõọôồốổỗộơờớởỡợpqrstuùúủũụưừứửữựvxyỳýỷỹỵ\s]+$/;
const VOWEL_REGEX = /[aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵ]/;

// Categories to crawl
const CATEGORIES = [
  'Mục_từ_tiếng_Việt',
  'Danh_từ_tiếng_Việt',
  'Động_từ_tiếng_Việt',
  'Tính_từ_tiếng_Việt',
  'Phó_từ_tiếng_Việt',
];

// Skip patterns in page titles
const SKIP_PATTERNS = ['/', ':', 'Phụ lục', 'Bản mẫu', 'Wiktionary:', 'Thể loại:'];

// ─── CLI Args ────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  if (typeof defaultVal === 'boolean') return true;
  return args[idx + 1] || defaultVal;
}

const DELAY_MS = parseInt(getArg('delay', '200'));
const MAX_PAGES = parseInt(getArg('max-pages', '0')); // 0 = unlimited
const RESUME = getArg('checkpoint', false);

// ─── Vietnamese tone normalization (simplified from word-chain-dictionary.ts) ─
const TONE_TABLE = {
  'o': ['o', 'ò', 'ó', 'ỏ', 'õ', 'ọ'],
  'a': ['a', 'à', 'á', 'ả', 'ã', 'ạ'],
  'e': ['e', 'è', 'é', 'ẻ', 'ẽ', 'ẹ'],
  'u': ['u', 'ù', 'ú', 'ủ', 'ũ', 'ụ'],
  'y': ['y', 'ỳ', 'ý', 'ỷ', 'ỹ', 'ỵ'],
};

const CHAR_TO_TONE = {};
for (const [base, variants] of Object.entries(TONE_TABLE)) {
  variants.forEach((ch, idx) => { CHAR_TO_TONE[ch] = [base, idx]; });
}

const DIPHTHONG_PAIRS = [
  { v1: 'o', v2: 'a' },
  { v1: 'o', v2: 'e' },
  { v1: 'u', v2: 'y' },
];

function normalizeSyllableTone(syllable) {
  for (const { v1, v2 } of DIPHTHONG_PAIRS) {
    for (let i = 0; i < syllable.length - 1; i++) {
      const ch1 = CHAR_TO_TONE[syllable[i]];
      const ch2 = CHAR_TO_TONE[syllable[i + 1]];
      if (!ch1 || !ch2) continue;
      if (ch1[0] !== v1 || ch2[0] !== v2) continue;
      if (v1 === 'u' && i > 0 && syllable[i - 1] === 'q') continue;
      const tone1 = ch1[1];
      const tone2 = ch2[1];
      if (tone1 === 0 && tone2 === 0) continue;
      const tone = tone1 !== 0 ? tone1 : tone2;
      const toneOnFirst = (i + 2 >= syllable.length);
      return syllable.substring(0, i)
        + TONE_TABLE[v1][toneOnFirst ? tone : 0]
        + TONE_TABLE[v2][toneOnFirst ? 0 : tone]
        + syllable.substring(i + 2);
    }
  }
  return syllable;
}

function normalizeWord(word) {
  const nfc = word.trim().toLowerCase().normalize('NFC');
  return nfc.split(' ').map(normalizeSyllableTone).join(' ');
}

function isValidVietnamese(word) {
  if (!word || word.length === 0) return false;
  if (!VIETNAMESE_CHAR_REGEX.test(word)) return false;
  if (!VOWEL_REGEX.test(word)) return false;
  if (word.includes('  ')) return false;
  const syllables = word.split(/\s+/);
  if (syllables.length > 8) return false;
  return true;
}

function shouldSkipTitle(title) {
  for (const pattern of SKIP_PATTERNS) {
    if (title.includes(pattern)) return true;
  }
  return false;
}

// ─── Checkpoint ──────────────────────────────────────────────
function loadCheckpoint() {
  if (!RESUME || !fs.existsSync(CHECKPOINT_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  } catch { return null; }
}

function saveCheckpoint(state) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// ─── API ─────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCategoryMembers(category, cmcontinue) {
  const params = new URLSearchParams({
    action: 'query',
    list: 'categorymembers',
    cmtitle: `Thể_loại:${category}`,
    cmlimit: '500',
    cmnamespace: '0',
    cmtype: 'page',
    format: 'json',
  });
  if (cmcontinue) params.set('cmcontinue', cmcontinue);

  const url = `${API_URL}?${params.toString()}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT }
      });

      if (response.status === 429) {
        const wait = DELAY_MS * attempt * 3;
        console.log(`    Rate limited, waiting ${wait}ms...`);
        await sleep(wait);
        continue;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      if (attempt < 3) {
        console.log(`    Retry ${attempt}/3: ${err.message}`);
        await sleep(DELAY_MS * attempt * 2);
      } else {
        throw err;
      }
    }
  }
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log('Vietnamese Wiktionary Crawler');
  console.log('============================\n');

  // Load checkpoint
  let state = loadCheckpoint() || {
    categories: {},
    allWords: [],
  };

  const wordSet = new Set(state.allWords);
  const stats = { total: 0, skipped: 0, invalid: 0, duplicate: 0 };

  for (const category of CATEGORIES) {
    // Check if category already completed
    if (state.categories[category]?.done) {
      console.log(`  [SKIP] ${category} — already completed (${state.categories[category].words} words)`);
      continue;
    }

    console.log(`\nCrawling: ${category}`);
    let cmcontinue = state.categories[category]?.cmcontinue || null;
    let pageCount = 0;
    let categoryWords = 0;

    if (!state.categories[category]) {
      state.categories[category] = { done: false, cmcontinue: null, words: 0, pages: 0 };
    }

    while (true) {
      const data = await fetchCategoryMembers(category, cmcontinue);
      const members = data?.query?.categorymembers || [];

      for (const member of members) {
        stats.total++;
        const title = member.title;

        if (shouldSkipTitle(title)) {
          stats.skipped++;
          continue;
        }

        const normalized = normalizeWord(title);

        if (!isValidVietnamese(normalized)) {
          stats.invalid++;
          continue;
        }

        if (wordSet.has(normalized)) {
          stats.duplicate++;
          continue;
        }

        wordSet.add(normalized);
        categoryWords++;
      }

      pageCount++;
      state.categories[category].cmcontinue = data?.continue?.cmcontinue || null;
      state.categories[category].pages = pageCount;
      state.categories[category].words = categoryWords;

      // Save progress
      state.allWords = Array.from(wordSet);
      saveCheckpoint(state);

      process.stdout.write(`  Page ${pageCount}: ${members.length} entries, ${categoryWords} new words\r`);

      // Check if done
      if (!data?.continue?.cmcontinue) {
        state.categories[category].done = true;
        saveCheckpoint(state);
        break;
      }

      cmcontinue = data.continue.cmcontinue;

      // Max pages limit (for testing)
      if (MAX_PAGES > 0 && pageCount >= MAX_PAGES) {
        console.log(`\n  Stopped at --max-pages ${MAX_PAGES}`);
        break;
      }

      await sleep(DELAY_MS);
    }

    console.log(`\n  ${category}: ${categoryWords} new words from ${pageCount} pages`);
  }

  // Dedup against current dictionary
  console.log('\nDeduplication...');
  const dictPath = path.join(__dirname, '../src/data/vietnamese-wordlist.txt');
  let existingCount = 0;
  if (fs.existsSync(dictPath)) {
    const dictContent = fs.readFileSync(dictPath, 'utf8');
    const dictWords = new Set(dictContent.split('\n').filter(w => w.trim()));
    const newOnly = new Set();
    for (const w of wordSet) {
      if (dictWords.has(w)) {
        existingCount++;
      }
      newOnly.add(w); // Keep all in output file — mega-merge handles dedup
    }
    console.log(`  Already in dictionary: ${existingCount}`);
    console.log(`  Genuinely new: ${wordSet.size - existingCount}`);
  }

  // Write output
  const sorted = Array.from(wordSet).sort((a, b) => a.localeCompare(b, 'vi'));
  fs.writeFileSync(OUTPUT_PATH, sorted.join('\n') + '\n', 'utf8');

  // Summary
  console.log('\n============================');
  console.log('SUMMARY');
  console.log('============================');
  console.log(`  Total entries crawled: ${stats.total}`);
  console.log(`  Skipped (non-word): ${stats.skipped}`);
  console.log(`  Invalid (not Vietnamese): ${stats.invalid}`);
  console.log(`  Duplicates within crawl: ${stats.duplicate}`);
  console.log(`  Unique words collected: ${wordSet.size}`);
  console.log(`  Already in dictionary: ${existingCount}`);
  console.log(`  New words: ${wordSet.size - existingCount}`);
  console.log(`  Output: ${OUTPUT_PATH}`);
  console.log('============================');

  // Cleanup checkpoint on success
  if (Object.values(state.categories).every(c => c.done)) {
    console.log('\nAll categories completed! Checkpoint cleaned up.');
    if (fs.existsSync(CHECKPOINT_PATH)) fs.unlinkSync(CHECKPOINT_PATH);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
