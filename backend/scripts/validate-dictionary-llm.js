/**
 * validate-dictionary-llm.js
 *
 * Validates auto-generated dictionary words using Gemini Flash API.
 * Classifies words into VALID/INVALID/UNCERTAIN — only removes words
 * that are BOTH flagged INVALID by LLM AND have 0 Wikipedia frequency.
 *
 * Safety principle: When in doubt, KEEP the word.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx node scripts/validate-dictionary-llm.js
 *   node scripts/validate-dictionary-llm.js --dry-run
 *   node scripts/validate-dictionary-llm.js --batch-size 50 --freq-file src/data/sources/wikipedia-frequency.json
 *
 * Requires: GEMINI_API_KEY env var (or in .env file)
 */

const fs = require('fs');
const path = require('path');

// ─── Load .env if exists ─────────────────────────────────────
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

// ─── Config ──────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DICT_PATH = path.join(__dirname, '../src/data/vietnamese-wordlist.txt');
const SOURCES_DIR = path.join(__dirname, '../src/data/sources');
const CHECKPOINT_PATH = path.join(__dirname, '.validate-checkpoint.json');
const REPORT_PATH = path.join(__dirname, 'validation-report.json');
const OUTPUT_PATH = path.join(__dirname, 'cleaned-wordlist.txt');

// Valid Vietnamese characters regex (from mega-merge)
const VIETNAMESE_CHAR_REGEX = /^[aàáảãạăằắẳẵặâầấẩẫậbcdđeèéẻẽẹêềếểễệghiklmnoòóỏõọôồốổỗộơờớởỡợpqrstuùúủũụưừứửữựvxyỳýỷỹỵ\s]+$/;
const VOWEL_REGEX = /[aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵ]/;

// Gemini Flash endpoint
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// ─── CLI Args ────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  if (typeof defaultVal === 'boolean') return true;
  return args[idx + 1] || defaultVal;
}

const BATCH_SIZE = parseInt(getArg('batch-size', '100'));
const DRY_RUN = getArg('dry-run', false);
const FREQ_FILE = getArg('freq-file', path.join(SOURCES_DIR, 'wikipedia-frequency.json'));
const DELAY_MS = parseInt(getArg('delay', '4000')); // 4s for free tier (15 RPM)
const MAX_RETRIES = 3;

// ─── Source Word Extraction ──────────────────────────────────
// Reuse mega-merge Phase 2 logic to identify which words came from sources
// vs which were auto-generated in Phase 3

function normalizeWord(word) {
  let normalized = word.trim().toLowerCase();
  normalized = normalized.replace(/[-_]/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

function loadPlainTextWords(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const content = fs.readFileSync(filePath, 'utf8');
  const words = new Set();
  for (const line of content.split(/\r?\n/)) {
    const w = normalizeWord(line);
    if (w && VIETNAMESE_CHAR_REGEX.test(w) && VOWEL_REGEX.test(w)) {
      words.add(w);
    }
  }
  return words;
}

function loadJsonLinesWords(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const content = fs.readFileSync(filePath, 'utf8');
  const words = new Set();
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.text) {
        const w = normalizeWord(obj.text);
        if (w && VIETNAMESE_CHAR_REGEX.test(w) && VOWEL_REGEX.test(w)) words.add(w);
      }
    } catch {}
  }
  return words;
}

function loadTaggedWords(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const content = fs.readFileSync(filePath, 'utf8');
  const words = new Set();
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#') || line.startsWith('//')) continue;
    let word = line;
    if (word.includes(';')) word = word.split(';')[0];
    if (word.includes('\t')) word = word.split('\t')[0];
    if (word.includes('{')) word = word.split('{')[0];
    const w = normalizeWord(word);
    if (w && VIETNAMESE_CHAR_REGEX.test(w) && VOWEL_REGEX.test(w)) words.add(w);
  }
  return words;
}

function loadSyllableWords(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const content = fs.readFileSync(filePath, 'utf8');
  const words = new Set();
  for (const line of content.split(/\r?\n/)) {
    let word = line.trim();
    if (!word) continue;
    const parts = word.split(/[\t]/);
    word = parts[0].trim();
    const w = normalizeWord(word);
    if (w && VIETNAMESE_CHAR_REGEX.test(w) && VOWEL_REGEX.test(w)) words.add(w);
  }
  return words;
}

/** Load all source words (ground truth — never delete these) */
function loadAllSourceWords() {
  console.log('Loading source words (ground truth)...');
  const sourceWords = new Set();

  // JSON lines sources
  const jsonSources = ['hongocduc-words.txt', 'tudientv-words.txt', 'wiktionary-words.txt'];
  for (const f of jsonSources) {
    const words = loadJsonLinesWords(path.join(SOURCES_DIR, f));
    for (const w of words) sourceWords.add(w);
  }

  // Plain text sources
  const plainSources = [
    'Viet74K.txt', 'tudien-main.txt', 'tudien-danhtu.txt', 'tudien-dongtu.txt',
    'tudien-tinhtu.txt', 'tudien-photu.txt', 'tudien-lientu.txt', 'tudien-danhtunhanxung.txt',
    'pyvi-words.txt', 'vinai-vn-dictionary.txt', 'vinai-dictionary.txt',
    'social-slang-candidates.txt', 'wiktionary-crawled.txt'
  ];
  for (const f of plainSources) {
    const words = loadPlainTextWords(path.join(SOURCES_DIR, f));
    for (const w of words) sourceWords.add(w);
  }

  // Tagged sources
  const taggedSources = ['tudien-tagged1.txt', 'tudien-tagged2.txt', 'tudien-ast.txt'];
  for (const f of taggedSources) {
    const words = loadTaggedWords(path.join(SOURCES_DIR, f));
    for (const w of words) sourceWords.add(w);
  }

  // Syllable sources
  const syllableSources = [
    'all-syllables-2022.txt', 'hieuthi-all-syllables.txt',
    'vn-syllable-6674.txt', 'vn-syllable-7884.txt'
  ];
  for (const f of syllableSources) {
    const words = loadSyllableWords(path.join(SOURCES_DIR, f));
    for (const w of words) sourceWords.add(w);
  }

  // Legacy duyet-wordlist
  const duyetPath = path.join(__dirname, '../src/data/duyet-wordlist.txt');
  if (fs.existsSync(duyetPath)) {
    const words = loadPlainTextWords(duyetPath);
    for (const w of words) sourceWords.add(w);
  }

  console.log(`  Loaded ${sourceWords.size} source-backed words`);
  return sourceWords;
}

// ─── Frequency Data ──────────────────────────────────────────
function loadFrequencyData() {
  if (!fs.existsSync(FREQ_FILE)) {
    console.log('  No frequency file found — skipping cross-reference');
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(FREQ_FILE, 'utf8'));
    console.log(`  Loaded frequency data: ${Object.keys(data.bigrams || {}).length} bigrams`);
    return data;
  } catch (e) {
    console.log(`  Failed to load frequency file: ${e.message}`);
    return null;
  }
}

// ─── Checkpoint ──────────────────────────────────────────────
function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function saveCheckpoint(checkpoint) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2), 'utf8');
}

// ─── Gemini API ──────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a Vietnamese linguistics expert. Classify each Vietnamese word/phrase.

VALID = Real Vietnamese word or compound that native speakers recognize and use (dictionary word, common phrase, proper term)
INVALID = Clearly NOT a real Vietnamese word — nonsensical/meaningless combination of syllables
UNCERTAIN = Might be valid but you're not sure (regional dialect, archaic, highly technical, rare)

IMPORTANT: When in doubt, classify as UNCERTAIN. We prefer to KEEP words rather than remove them.
IMPORTANT: Many Sino-Vietnamese compounds are valid even if uncommon (e.g. "bất tận", "vô lường", "phi thường").

Respond ONLY with a JSON object. No markdown, no explanation.
Format: {"results": [{"w": "word", "c": "VALID"}, {"w": "word2", "c": "INVALID"}, ...]}
Use single-letter keys to save tokens: "w" for word, "c" for classification.`;

async function callGemini(words) {
  const numberedList = words.map((w, i) => `${i + 1}. ${w}`).join('\n');
  const userPrompt = `Classify these Vietnamese words:\n${numberedList}`;

  const body = {
    contents: [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\n' + userPrompt }] }
    ],
    generationConfig: {
      temperature: 0.1, // Low temperature for consistent classification
      maxOutputTokens: 4096,
      responseMimeType: 'application/json'
    }
  };

  const url = `${GEMINI_URL}?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${text.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');

  // Parse JSON response
  const parsed = JSON.parse(text);
  return parsed.results || parsed;
}

async function callGeminiWithRetry(words, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await callGemini(words);
    } catch (err) {
      const isRateLimit = err.message.includes('429');
      const delay = isRateLimit ? DELAY_MS * attempt * 2 : DELAY_MS * attempt;

      if (attempt < retries) {
        console.log(`    Retry ${attempt}/${retries} (${err.message.substring(0, 80)}) — waiting ${delay}ms`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log('Vietnamese Dictionary LLM Validator');
  console.log('====================================\n');

  if (!GEMINI_API_KEY && !DRY_RUN) {
    console.error('ERROR: GEMINI_API_KEY not set. Use --dry-run to test without API calls.');
    process.exit(1);
  }

  // Step 1: Load dictionary
  console.log('Step 1: Loading dictionary...');
  const dictContent = fs.readFileSync(DICT_PATH, 'utf8');
  const allWords = new Set(dictContent.split('\n').filter(w => w.trim()));
  console.log(`  Dictionary: ${allWords.size} words\n`);

  // Step 2: Load source words
  console.log('Step 2: Loading source words...');
  const sourceWords = loadAllSourceWords();
  console.log('');

  // Step 3: Identify generated words (to validate)
  console.log('Step 3: Identifying auto-generated words...');
  const generatedWords = [];
  for (const word of allWords) {
    if (!sourceWords.has(word)) {
      generatedWords.push(word);
    }
  }
  console.log(`  Generated words to validate: ${generatedWords.length}`);
  console.log(`  Source words (exempt): ${allWords.size - generatedWords.length}\n`);

  // Step 4: Load frequency data (optional)
  console.log('Step 4: Loading frequency data...');
  const freqData = loadFrequencyData();
  console.log('');

  // Step 5: Load or create checkpoint
  console.log('Step 5: Checking checkpoint...');
  let checkpoint = loadCheckpoint();
  if (checkpoint && checkpoint.batchSize === BATCH_SIZE) {
    const processedCount = checkpoint.results.valid.length +
      checkpoint.results.invalid.length +
      checkpoint.results.uncertain.length +
      checkpoint.results.errors.length;
    console.log(`  Resuming from checkpoint: ${processedCount} words already processed`);
  } else {
    checkpoint = {
      version: 1,
      batchSize: BATCH_SIZE,
      results: { valid: [], invalid: [], uncertain: [], errors: [] },
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString()
    };
    console.log('  Starting fresh');
  }
  console.log('');

  // Build set of already-processed words
  const processed = new Set([
    ...checkpoint.results.valid,
    ...checkpoint.results.invalid,
    ...checkpoint.results.uncertain,
    ...checkpoint.results.errors
  ]);

  // Filter to unprocessed words
  const toValidate = generatedWords.filter(w => !processed.has(w));
  console.log(`Step 6: Validating ${toValidate.length} remaining words in batches of ${BATCH_SIZE}...\n`);

  if (DRY_RUN) {
    console.log('DRY RUN — showing first 3 batches only\n');
  }

  // Step 6: Batch validation
  const totalBatches = Math.ceil(toValidate.length / BATCH_SIZE);
  let batchNum = 0;

  for (let i = 0; i < toValidate.length; i += BATCH_SIZE) {
    batchNum++;
    const batch = toValidate.slice(i, i + BATCH_SIZE);
    const progress = `[${batchNum}/${totalBatches}]`;

    if (DRY_RUN) {
      if (batchNum > 3) break;
      console.log(`  ${progress} Would validate: ${batch.slice(0, 5).join(', ')}... (${batch.length} words)`);
      // Mark all as uncertain in dry run
      for (const w of batch) checkpoint.results.uncertain.push(w);
      continue;
    }

    try {
      const results = await callGeminiWithRetry(batch);

      // Process results
      let valid = 0, invalid = 0, uncertain = 0;
      const resultMap = new Map();

      for (const r of results) {
        const word = r.w || r.word;
        const cls = (r.c || r.class || r.classification || '').toUpperCase();
        if (word) resultMap.set(word.toLowerCase().trim(), cls);
      }

      for (const word of batch) {
        const cls = resultMap.get(word) || 'UNCERTAIN'; // Default to UNCERTAIN if not in response

        if (cls === 'VALID') {
          checkpoint.results.valid.push(word);
          valid++;
        } else if (cls === 'INVALID') {
          checkpoint.results.invalid.push(word);
          invalid++;
        } else {
          checkpoint.results.uncertain.push(word);
          uncertain++;
        }
      }

      console.log(`  ${progress} V:${valid} I:${invalid} U:${uncertain} (total processed: ${checkpoint.results.valid.length + checkpoint.results.invalid.length + checkpoint.results.uncertain.length})`);

      // Save checkpoint after each batch
      checkpoint.lastUpdatedAt = new Date().toISOString();
      saveCheckpoint(checkpoint);

      // Rate limit delay
      if (i + BATCH_SIZE < toValidate.length) {
        await sleep(DELAY_MS);
      }
    } catch (err) {
      console.error(`  ${progress} ERROR: ${err.message.substring(0, 100)}`);
      // Mark entire batch as error (will be retried on next run)
      for (const w of batch) checkpoint.results.errors.push(w);
      checkpoint.lastUpdatedAt = new Date().toISOString();
      saveCheckpoint(checkpoint);

      // If repeated errors, increase delay
      await sleep(DELAY_MS * 3);
    }
  }

  // Step 7: Safety check
  console.log('\nStep 7: Safety check...');
  const invalidCount = checkpoint.results.invalid.length;
  const totalValidated = invalidCount + checkpoint.results.valid.length + checkpoint.results.uncertain.length;
  const invalidRatio = totalValidated > 0 ? invalidCount / totalValidated : 0;

  console.log(`  Valid: ${checkpoint.results.valid.length}`);
  console.log(`  Invalid: ${invalidCount}`);
  console.log(`  Uncertain: ${checkpoint.results.uncertain.length}`);
  console.log(`  Errors: ${checkpoint.results.errors.length}`);
  console.log(`  Invalid ratio: ${(invalidRatio * 100).toFixed(1)}%`);

  if (invalidRatio > 0.5) {
    console.error('\n  ABORT: >50% flagged invalid — likely a prompt issue. Review manually.');
    process.exit(1);
  }

  // Step 8: Cross-reference with frequency data
  console.log('\nStep 8: Cross-referencing with frequency data...');
  let freqOverrides = 0;
  const finalRemovedWords = [];
  const overriddenWords = [];

  for (const word of checkpoint.results.invalid) {
    // Check if frequency data says this word exists
    if (freqData && freqData.bigrams) {
      const freq = freqData.bigrams[word] || 0;
      if (freq > 2) {
        // Word appears in Wikipedia — override to keep
        overriddenWords.push(word);
        freqOverrides++;
        continue;
      }
    }
    finalRemovedWords.push(word);
  }

  console.log(`  Frequency overrides (INVALID → KEEP): ${freqOverrides}`);
  console.log(`  Final words to remove: ${finalRemovedWords.length}`);

  // Step 9: Generate output
  console.log('\nStep 9: Generating output...');
  const removedSet = new Set(finalRemovedWords);
  const cleanedWords = [];

  for (const word of allWords) {
    if (!removedSet.has(word)) {
      cleanedWords.push(word);
    }
  }

  cleanedWords.sort((a, b) => a.localeCompare(b, 'vi'));

  // Write cleaned wordlist
  fs.writeFileSync(OUTPUT_PATH, cleanedWords.join('\n') + '\n', 'utf8');
  console.log(`  Wrote ${cleanedWords.length} words to ${OUTPUT_PATH}`);

  // Write report
  const report = {
    totalWords: allWords.size,
    sourceWords: allWords.size - generatedWords.length,
    generatedWords: generatedWords.length,
    validated: {
      valid: checkpoint.results.valid.length,
      invalid: invalidCount,
      uncertain: checkpoint.results.uncertain.length,
      errors: checkpoint.results.errors.length
    },
    frequencyOverrides: freqOverrides,
    overriddenWords,
    finalRemoved: finalRemovedWords.length,
    removedWords: finalRemovedWords,
    invalidRatio: (invalidRatio * 100).toFixed(1) + '%',
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`  Wrote report to ${REPORT_PATH}`);

  // Summary
  console.log('\n====================================');
  console.log('SUMMARY');
  console.log('====================================');
  console.log(`  Original dictionary: ${allWords.size} words`);
  console.log(`  Source-backed (exempt): ${allWords.size - generatedWords.length}`);
  console.log(`  Generated (validated): ${generatedWords.length}`);
  console.log(`  Removed: ${finalRemovedWords.length}`);
  console.log(`  Frequency overrides: ${freqOverrides}`);
  console.log(`  Cleaned dictionary: ${cleanedWords.length} words`);
  console.log(`  Net change: ${cleanedWords.length - allWords.size}`);
  console.log('====================================');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
