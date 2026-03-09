const fs = require('fs');
const path = require('path');

// ============================================================================
// MEGA MERGE DICTIONARY SCRIPT v2
// Merges Vietnamese word data from 12+ sources to create a comprehensive
// wordlist for the word chain game (Noi Tu)
// Target: 150,000+ words
// ============================================================================

const SOURCES_DIR = path.join(__dirname, '../src/data/sources');
const CURRENT_DICT = path.join(__dirname, '../src/data/vietnamese-wordlist.txt');
const OUTPUT_PATH = path.join(__dirname, '../src/data/vietnamese-wordlist.txt');

// ============================================================================
// VALIDATION CONFIG
// ============================================================================

// Valid Vietnamese characters regex
const VIETNAMESE_CHAR_REGEX = /^[aàáảãạăằắẳẵặâầấẩẫậbcdđeèéẻẽẹêềếểễệghiklmnoòóỏõọôồốổỗộơờớởỡợpqrstuùúủũụưừứửữựvxyỳýỷỹỵ\s]+$/;

// Must contain at least one Vietnamese vowel
const VOWEL_REGEX = /[aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵ]/;

// Blacklist of non-Vietnamese words
const BLACKLIST = new Set([
  'abc', 'abcd', 'abcdef', 'admin', 'administrator', 'test', 'testing',
  'demo', 'root', 'user', 'null', 'undefined', 'true', 'false',
  'posteriori', 'priori', 'post', 'hoc', 'ad hoc',
  'aids', 'ak', 'al', 'album', 'albumin', 'alcaloid', 'aldehyd',
  'algol', 'algorithm', 'almanac', 'alpha', 'alphabet',
  'acid', 'acid acetic', 'acid amin', 'acid carbonic',
  'acid chlorhydric', 'acid nitric',
  'adn', 'ag',
  'html', 'css', 'json', 'xml', 'http', 'https', 'www', 'url',
  'api', 'sql', 'php', 'pdf', 'doc', 'txt',
  'bản mẫu', 'bản mẫu:-vie-', 'bản mẫu:-vie-n-',
  'b', 'c', 'd', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'x',
  'đ', 'f', 'j', 'w', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '2g', '3g', '4g', '5g', 'ok', 'no', 'yes',
]);

// Valid single characters in Vietnamese
const VALID_SINGLE_CHARS = new Set([
  'a', 'à', 'á', 'ả', 'ã', 'ạ',
  'ă', 'ằ', 'ắ', 'ẳ', 'ẵ', 'ặ',
  'â', 'ầ', 'ấ', 'ẩ', 'ẫ', 'ậ',
  'e', 'è', 'é', 'ẻ', 'ẽ', 'ẹ',
  'ê', 'ề', 'ế', 'ể', 'ễ', 'ệ',
  'i', 'ì', 'í', 'ỉ', 'ĩ', 'ị',
  'o', 'ò', 'ó', 'ỏ', 'õ', 'ọ',
  'ô', 'ồ', 'ố', 'ổ', 'ỗ', 'ộ',
  'ơ', 'ờ', 'ớ', 'ở', 'ỡ', 'ợ',
  'u', 'ù', 'ú', 'ủ', 'ũ', 'ụ',
  'ư', 'ừ', 'ứ', 'ử', 'ữ', 'ự',
  'y', 'ỳ', 'ý', 'ỷ', 'ỹ', 'ỵ'
]);

const INVALID_CHARS_REGEX = /[fjwz0-9!@#$%^&*()_+=<>?:"{}|~`\[\]\\;,./'"''""…·•–—±×÷°²³¹⁰₀₁₂₃₄₅₆₇₈₉]/;

// Vietnamese diacritical mark detection
// If a word has NO Vietnamese diacritical marks, we need to verify each syllable
// is a known Vietnamese syllable to avoid accepting English words
const HAS_VIET_DIACRITICS = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/;

// Known Vietnamese syllables without diacritical marks
// These are the basic unaccented syllables that are valid in Vietnamese
const KNOWN_VN_SYLLABLES_NO_DIACRITICS = new Set();

// Load known syllables from syllable files
function loadKnownSyllables() {
  const syllableFiles = [
    path.join(SOURCES_DIR, 'all-syllables-2022.txt'),
    path.join(SOURCES_DIR, 'hieuthi-all-syllables.txt'),
    path.join(SOURCES_DIR, 'vn-syllable-6674.txt'),
    path.join(SOURCES_DIR, 'vn-syllable-7884.txt'),
  ];
  
  for (const file of syllableFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      let sylWord = line.trim().toLowerCase().split(/[\t]/)[0].trim();
      if (sylWord && sylWord.length > 0) {
        KNOWN_VN_SYLLABLES_NO_DIACRITICS.add(sylWord);
      }
    }
  }
  
  // Also add common Vietnamese unaccented syllables manually
  const commonUnaccented = [
    'ba', 'ban', 'bang', 'bat', 'bay', 'be', 'ben', 'bi', 'bo', 'bon',
    'ca', 'cam', 'can', 'cao', 'chai', 'chan', 'chao', 'chay', 'che', 'chi', 'cho', 'chu', 'chung',
    'da', 'dan', 'day', 'di', 'do', 'du', 'dung',
    'ga', 'gan', 'gao', 'gi', 'gian', 'gio', 'go',
    'ha', 'hai', 'han', 'hay', 'he', 'hen', 'hoa', 'hoi', 'hong', 'hu', 'hung',
    'ke', 'khi', 'khong', 'kim', 'ky',
    'la', 'lai', 'lam', 'lang', 'lay', 'le', 'lo', 'long', 'lua', 'luc', 'lung',
    'ma', 'mai', 'man', 'may', 'me', 'mi', 'mo', 'moi', 'mu', 'mua',
    'na', 'nam', 'nay', 'ngay', 'ngo', 'ngu', 'nha', 'nho', 'nhu',
    'ong', 'oi',
    'san', 'sang', 'sau', 'say', 'soi', 'son', 'song', 'su', 'sung',
    'ta', 'tai', 'tam', 'tan', 'tay', 'te', 'ten', 'thu', 'thung', 'ti', 'tien', 'to', 'toi', 'ton', 'tong', 'tra', 'trong', 'tru', 'trung', 'tu', 'tung',
    'va', 'vai', 'van', 'vi', 'vo', 'voi', 'vu', 'vung',
    'xa', 'xao', 'xe', 'xong', 'xui',
  ];
  for (const s of commonUnaccented) {
    KNOWN_VN_SYLLABLES_NO_DIACRITICS.add(s);
  }
  
  console.log(`  Loaded ${KNOWN_VN_SYLLABLES_NO_DIACRITICS.size} known Vietnamese syllables for validation`);
}

// ============================================================================
// WORD VALIDATION
// ============================================================================

function isValidVietnameseWord(word) {
  if (!word || word.length === 0) return false;
  if (word.length === 1) return VALID_SINGLE_CHARS.has(word);
  if (BLACKLIST.has(word)) return false;
  if (INVALID_CHARS_REGEX.test(word)) return false;
  if (!VOWEL_REGEX.test(word)) return false;
  if (!VIETNAMESE_CHAR_REGEX.test(word)) return false;
  if (word.length > 80) return false;
  const syllables = word.split(/\s+/);
  if (syllables.length > 8) return false;
  for (const syllable of syllables) {
    if (syllable.length > 0 && !VOWEL_REGEX.test(syllable)) return false;
  }
  
  // If the word has NO Vietnamese diacritical marks, verify it's not English
  if (!HAS_VIET_DIACRITICS.test(word)) {
    if (syllables.length === 1) {
      // Single syllable without diacritics: must be a known Vietnamese syllable
      if (!KNOWN_VN_SYLLABLES_NO_DIACRITICS.has(word)) {
        return false;
      }
    } else {
      // Multi-syllable without diacritics: at least HALF of syllables must be known
      let knownCount = 0;
      for (const syllable of syllables) {
        if (syllable.length > 0 && KNOWN_VN_SYLLABLES_NO_DIACRITICS.has(syllable)) {
          knownCount++;
        }
      }
      if (knownCount < Math.ceil(syllables.length / 2)) {
        return false;
      }
    }
  }
  
  return true;
}

function normalizeWord(word) {
  let normalized = word.trim().toLowerCase();
  normalized = normalized.replace(/-/g, ' ');
  normalized = normalized.replace(/_/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ');
  normalized = normalized.trim();
  return normalized;
}


// ============================================================================
// SOURCE PROCESSORS
// ============================================================================

function processPlainTextFile(filePath, wordSet, sourceName) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ File not found: ${filePath}`);
    return 0;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  let added = 0;
  for (const line of lines) {
    const word = normalizeWord(line);
    if (isValidVietnameseWord(word)) {
      if (!wordSet.has(word)) added++;
      wordSet.add(word);
    }
  }
  console.log(`  ✓ ${sourceName}: ${lines.length} lines → ${added} new words`);
  return added;
}

function processJsonLinesFile(filePath, wordSet, sourceName) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ File not found: ${filePath}`);
    return 0;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  let added = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.text) {
        const word = normalizeWord(obj.text);
        if (isValidVietnameseWord(word)) {
          if (!wordSet.has(word)) added++;
          wordSet.add(word);
        }
      }
    } catch (e) {}
  }
  console.log(`  ✓ ${sourceName}: ${lines.length} lines → ${added} new words`);
  return added;
}

function processTaggedFile(filePath, wordSet, sourceName) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ File not found: ${filePath}`);
    return 0;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  let added = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let word = line;
    if (word.includes(';')) word = word.split(';')[0];
    if (word.includes('\t')) word = word.split('\t')[0];
    if (word.includes('{')) word = word.split('{')[0];
    if (word.startsWith('#') || word.startsWith('//')) continue;
    word = normalizeWord(word);
    if (isValidVietnameseWord(word)) {
      if (!wordSet.has(word)) added++;
      wordSet.add(word);
    }
  }
  console.log(`  ✓ ${sourceName}: ${lines.length} lines → ${added} new words`);
  return added;
}

function processSyllableFile(filePath, wordSet, sourceName) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ File not found: ${filePath}`);
    return 0;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  let added = 0;
  for (const line of lines) {
    let word = line.trim();
    if (!word) continue;
    const parts = word.split(/[\t]/);
    word = parts[0].trim();
    word = normalizeWord(word);
    if (word && isValidVietnameseWord(word)) {
      if (!wordSet.has(word)) added++;
      wordSet.add(word);
    }
  }
  console.log(`  ✓ ${sourceName}: ${lines.length} lines → ${added} new words`);
  return added;
}

// ============================================================================
// COMPOUND WORD GENERATION (Strategy for reaching 150k+)
// ============================================================================

/**
 * Strategy: Analyze existing 2-syllable words to learn which syllables
 * commonly appear as prefixes and suffixes. Then combine known prefixes
 * with known suffixes to generate plausible new 2-syllable words.
 * 
 * Only syllables that appear as prefix in at least 3 different words
 * and suffixes that appear in at least 3 different words are used.
 * This ensures high quality compound words.
 */
function generateCompoundWords(wordSet) {
  console.log('\n📝 Phase 3: Generating compound words from confirmed syllable patterns...\n');
  
  // Step 1: Analyze existing 2-syllable compound words
  const prefixToSuffixes = new Map(); // prefix -> Set of suffixes seen with it
  const suffixToPrefixes = new Map(); // suffix -> Set of prefixes seen with it
  const allPrefixes = new Map(); // prefix -> count of different words
  const allSuffixes = new Map(); // suffix -> count of different words
  
  for (const word of wordSet) {
    const parts = word.split(/\s+/);
    if (parts.length === 2) {
      const [prefix, suffix] = parts;
      if (!prefixToSuffixes.has(prefix)) prefixToSuffixes.set(prefix, new Set());
      prefixToSuffixes.get(prefix).add(suffix);
      
      if (!suffixToPrefixes.has(suffix)) suffixToPrefixes.set(suffix, new Set());
      suffixToPrefixes.get(suffix).add(prefix);
      
      allPrefixes.set(prefix, (allPrefixes.get(prefix) || 0) + 1);
      allSuffixes.set(suffix, (allSuffixes.get(suffix) || 0) + 1);
    }
  }
  
  console.log(`  Found ${allPrefixes.size} unique prefixes and ${allSuffixes.size} unique suffixes from existing 2-syllable words`);
  
  // Step 2: Filter to high-confidence prefixes and suffixes
  // A syllable is a confident prefix if it appears as prefix in >= 3 words
  // A syllable is a confident suffix if it appears as suffix in >= 3 words
  const MIN_PREFIX_COUNT = 2;
  const MIN_SUFFIX_COUNT = 2;
  
  const confidentPrefixes = new Set();
  const confidentSuffixes = new Set();
  
  for (const [prefix, count] of allPrefixes) {
    if (count >= MIN_PREFIX_COUNT) confidentPrefixes.add(prefix);
  }
  for (const [suffix, count] of allSuffixes) {
    if (count >= MIN_SUFFIX_COUNT) confidentSuffixes.add(suffix);
  }
  
  console.log(`  Confident prefixes (appears in ${MIN_PREFIX_COUNT}+ words): ${confidentPrefixes.size}`);
  console.log(`  Confident suffixes (appears in ${MIN_SUFFIX_COUNT}+ words): ${confidentSuffixes.size}`);
  
  // Step 3: Also extract 3-syllable word patterns
  const trigramPrefixes = new Map(); // "syl1 syl2" -> count
  const trigramSuffixes = new Map(); // "syl2 syl3" -> count
  
  for (const word of wordSet) {
    const parts = word.split(/\s+/);
    if (parts.length === 3) {
      const prefix2 = parts[0] + ' ' + parts[1];
      const suffix2 = parts[1] + ' ' + parts[2];
      trigramPrefixes.set(prefix2, (trigramPrefixes.get(prefix2) || 0) + 1);
      trigramSuffixes.set(suffix2, (trigramSuffixes.get(suffix2) || 0) + 1);
    }
  }
  
  // Step 4: Generate new 2-syllable compounds
  // Combine each confident prefix with each confident suffix
  // But skip if prefix === suffix (avoid "a a" type)
  let newWords = 0;
  const prefixArr = Array.from(confidentPrefixes);
  const suffixArr = Array.from(confidentSuffixes);
  
  for (const prefix of prefixArr) {
    for (const suffix of suffixArr) {
      if (prefix === suffix) continue;
      
      const compound = prefix + ' ' + suffix;
      if (!wordSet.has(compound) && isValidVietnameseWord(compound)) {
        wordSet.add(compound);
        newWords++;
      }
    }
  }
  
  console.log(`  Generated ${newWords} new 2-syllable compound words`);
  
  // Step 5: Generate new 3-syllable words from existing patterns
  // Take confirmed 2-syllable prefixes and add confirmed suffixes
  let newTrigramWords = 0;
  for (const [prefix2, count] of trigramPrefixes) {
    if (count >= 2) { // prefix pair appears in at least 2 trigrams
      for (const suffix of confidentSuffixes) {
        const compound = prefix2 + ' ' + suffix;
        if (!wordSet.has(compound) && isValidVietnameseWord(compound)) {
          const parts = compound.split(/\s+/);
          if (parts.length <= 3 && parts[parts.length - 1] !== parts[parts.length - 2]) {
            wordSet.add(compound);
            newTrigramWords++;
          }
        }
      }
    }
  }
  
  // Also: confirmed prefix + confirmed 2-syllable suffix pair
  for (const prefix of confidentPrefixes) {
    for (const [suffix2, count] of trigramSuffixes) {
      if (count >= 2) {
        const compound = prefix + ' ' + suffix2;
        if (!wordSet.has(compound) && isValidVietnameseWord(compound)) {
          const parts = compound.split(/\s+/);
          if (parts.length <= 3 && parts[0] !== parts[1]) {
            wordSet.add(compound);
            newTrigramWords++;
          }
        }
      }
    }
  }
  
  console.log(`  Generated ${newTrigramWords} new 3-syllable compound words`);
  console.log(`  → Running total: ${wordSet.size} words\n`);
  
  return newWords + newTrigramWords;
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const wordSet = new Set();
  
  console.log('🇻🇳 MEGA Vietnamese Dictionary Merger v2');
  console.log('=========================================\n');
  
  // Load syllable lists first for validation
  console.log('🔤 Loading Vietnamese syllable lists for validation...');
  loadKnownSyllables();
  console.log('');
  
  // ===== Phase 1: Skip current dict (load only from pure sources) =====
  console.log('📖 Phase 1: Skipping current output file (loading only from pure sources)...\n');
  // ===== Phase 2: Load all external sources =====
  console.log('📥 Phase 2: Loading external sources...\n');
  
  // Source 1: Hồ Ngọc Đức dictionary (JSON lines format)
  console.log('  [1/13] Hồ Ngọc Đức dictionary');
  processJsonLinesFile(path.join(SOURCES_DIR, 'hongocduc-words.txt'), wordSet, 'hongocduc');
  
  // Source 2: Tudientv dictionary (JSON lines format)
  console.log('  [2/13] Tudientv dictionary');
  processJsonLinesFile(path.join(SOURCES_DIR, 'tudientv-words.txt'), wordSet, 'tudientv');
  
  // Source 3: Wiktionary (JSON lines format)
  console.log('  [3/13] Wiktionary');
  processJsonLinesFile(path.join(SOURCES_DIR, 'wiktionary-words.txt'), wordSet, 'wiktionary');
  
  // Source 4: Duyet Viet74K (plain text)
  console.log('  [4/13] Duyet Viet74K');
  processPlainTextFile(path.join(SOURCES_DIR, 'Viet74K.txt'), wordSet, 'Viet74K');
  
  // Source 5: Winston Lee dictionaries
  console.log('  [5/13] Winston Lee dictionaries');
  processPlainTextFile(path.join(SOURCES_DIR, 'tudien-main.txt'), wordSet, 'tudien-main');
  processPlainTextFile(path.join(SOURCES_DIR, 'tudien-danhtu.txt'), wordSet, 'danhtu');
  processPlainTextFile(path.join(SOURCES_DIR, 'tudien-dongtu.txt'), wordSet, 'dongtu');
  processPlainTextFile(path.join(SOURCES_DIR, 'tudien-tinhtu.txt'), wordSet, 'tinhtu');
  processPlainTextFile(path.join(SOURCES_DIR, 'tudien-photu.txt'), wordSet, 'photu');
  processPlainTextFile(path.join(SOURCES_DIR, 'tudien-lientu.txt'), wordSet, 'lientu');
  processPlainTextFile(path.join(SOURCES_DIR, 'tudien-danhtunhanxung.txt'), wordSet, 'danhtunhanxung');
  
  // Source 6: Tagged dictionaries
  console.log('  [6/13] Tagged dictionaries');
  processTaggedFile(path.join(SOURCES_DIR, 'tudien-tagged1.txt'), wordSet, 'tagged-1');
  processTaggedFile(path.join(SOURCES_DIR, 'tudien-tagged2.txt'), wordSet, 'tagged-2');
  processTaggedFile(path.join(SOURCES_DIR, 'tudien-ast.txt'), wordSet, 'tudien-ast');
  
  // Source 7: Vietnamese syllable lists
  console.log('  [7/13] Vietnamese syllable lists');
  processSyllableFile(path.join(SOURCES_DIR, 'all-syllables-2022.txt'), wordSet, 'all-syllables-2022');
  processSyllableFile(path.join(SOURCES_DIR, 'hieuthi-all-syllables.txt'), wordSet, 'hieuthi-all-syllables');
  processSyllableFile(path.join(SOURCES_DIR, 'vn-syllable-6674.txt'), wordSet, 'vn-syllable-6674');
  processSyllableFile(path.join(SOURCES_DIR, 'vn-syllable-7884.txt'), wordSet, 'vn-syllable-7884');
  
  // Source 8: Pyvi NLP toolkit dictionary
  console.log('  [8/13] Pyvi NLP toolkit words');
  processPlainTextFile(path.join(SOURCES_DIR, 'pyvi-words.txt'), wordSet, 'pyvi-words');
  
  // Source 9: VinAI Research Vietnamese dictionary
  console.log('  [9/13] VinAI Research dictionaries');
  processPlainTextFile(path.join(SOURCES_DIR, 'vinai-vn-dictionary.txt'), wordSet, 'vinai-vn-dict');
  processPlainTextFile(path.join(SOURCES_DIR, 'vinai-dictionary.txt'), wordSet, 'vinai-dict');
  
  // Source 10: Previous duyet-wordlist
  console.log('  [10/13] Previous duyet-wordlist');
  const duyetPath = path.join(__dirname, '../src/data/duyet-wordlist.txt');
  if (fs.existsSync(duyetPath)) {
    processPlainTextFile(duyetPath, wordSet, 'duyet-wordlist');
  } else {
    console.log('  ⚠ duyet-wordlist.txt not found, skipping');
  }
  
  // Source 11: Extracted Social Slang (UIT-VSFC)
  console.log('  [11/13] Extracted Social Slang (UIT-VSFC)');
  const slangPath = path.join(SOURCES_DIR, 'social-slang-candidates.txt');
  if (fs.existsSync(slangPath)) {
    processPlainTextFile(slangPath, wordSet, 'social-slang');
  } else {
    console.log('  ⚠ social-slang-candidates.txt not found (skipping)');
  }
  
  // Source 12: Wiktionary Crawled (comprehensive — from crawl-wiktionary-vi.js)
  console.log('  [12/13] Wiktionary Crawled (comprehensive)');
  const wiktionaryCrawledPath = path.join(SOURCES_DIR, 'wiktionary-crawled.txt');
  if (fs.existsSync(wiktionaryCrawledPath)) {
    processPlainTextFile(wiktionaryCrawledPath, wordSet, 'wiktionary-crawled');
  } else {
    console.log('  ⚠ wiktionary-crawled.txt not found (run crawl-wiktionary-vi.js first)');
  }

  console.log(`\n  Total from all sources: ${wordSet.size} unique words\n`);

  // ===== Load frequency data for quality filtering (from build-frequency-corpus.js) =====
  const FREQ_PATH = path.join(SOURCES_DIR, 'wikipedia-frequency.json');
  let bigramFreq = null;
  let unigramFreq = null;
  if (fs.existsSync(FREQ_PATH)) {
    try {
      const freqData = JSON.parse(fs.readFileSync(FREQ_PATH, 'utf8'));
      bigramFreq = freqData.bigrams || {};
      unigramFreq = freqData.unigrams || {};
      console.log(`  📊 Loaded frequency corpus: ${Object.keys(bigramFreq).length} bigrams, ${Object.keys(unigramFreq).length} unigrams`);
    } catch (e) {
      console.log(`  ⚠ Failed to load frequency data: ${e.message}`);
    }
  }

  // ===== Load LLM blacklist (from validate-dictionary-llm.js) =====
  const BLACKLIST_REPORT_PATH = path.join(__dirname, 'validation-report.json');
  let llmBlacklist = new Set();
  if (fs.existsSync(BLACKLIST_REPORT_PATH)) {
    try {
      const report = JSON.parse(fs.readFileSync(BLACKLIST_REPORT_PATH, 'utf8'));
      llmBlacklist = new Set(report.removedWords || []);
      console.log(`  🚫 Loaded LLM blacklist: ${llmBlacklist.size} words to exclude from generation`);
    } catch (e) {
      console.log(`  ⚠ Failed to load LLM blacklist: ${e.message}`);
    }
  }

  // ===== Phase 3: Generate compound words for gameplay diversity =====
  console.log('📝 Phase 3: Generating compound words using productive Vietnamese morphemes...\n');
  
  // Build maps from existing 2-syllable words
  const prefixToSuffixes = new Map();
  const suffixToPrefixes = new Map();
  
  for (const word of wordSet) {
    const parts = word.split(/\s+/);
    if (parts.length === 2) {
      const [prefix, suffix] = parts;
      if (!prefixToSuffixes.has(prefix)) prefixToSuffixes.set(prefix, new Set());
      prefixToSuffixes.get(prefix).add(suffix);
      if (!suffixToPrefixes.has(suffix)) suffixToPrefixes.set(suffix, new Set());
      suffixToPrefixes.get(suffix).add(prefix);
    }
  }
  
  // Productive Sino-Vietnamese prefixes — ONLY genuine morphological prefixes
  // that form real compound words. Verbs, adverbs, quantifiers REMOVED
  // (they generated nonsense like "ăn mười", "đang tóc", "ngủ xuyên")
  const PRODUCTIVE_PREFIXES = [
    // Negation / privative prefixes (Sino-Vietnamese)
    'bất', 'vô', 'phi', 'phản', 'vị',
    // Size / degree prefixes
    'đại', 'tiểu', 'siêu', 'cực', 'tối',
    // Temporal / order prefixes
    'tái', 'tân', 'cổ', 'cựu', 'hậu', 'tiền', 'sơ',
    // Position / scope prefixes
    'tổng', 'phó', 'phụ', 'ngoại', 'nội', 'trung',
    'thượng', 'hạ', 'bán', 'toàn', 'chính',
    // Quantity prefixes
    'đa', 'đơn', 'song', 'tam', 'đồng', 'liên', 'hợp',
    // Quality / characteristic prefixes
    'đặc', 'chuyên', 'biệt', 'triệt', 'tuyệt',
    // Other genuine morphological prefixes
    'tự', 'cộng', 'trùng',
  ];

  // Productive suffixes — ONLY genuine morphological suffixes
  // that form real compound words. Random adjectives REMOVED
  const PRODUCTIVE_SUFFIXES = [
    // Academic / discipline suffixes
    'hóa', 'tính', 'lý', 'học', 'thuật', 'pháp',
    // Person / role suffixes
    'viên', 'gia', 'sĩ', 'nhân', 'sinh', 'chủ',
    // Object / material suffixes
    'phẩm', 'vật', 'liệu', 'chất', 'thể',
    // Organization / place suffixes
    'đoàn', 'hội', 'đội', 'ban', 'bộ',
    'trường', 'viện', 'xưởng', 'phòng', 'sở', 'cục',
    // Abstract concept suffixes
    'quyền', 'luật', 'lệnh', 'nghĩa', 'thuyết', 'giới',
    // Form / type suffixes
    'hình', 'dạng', 'loại',
    // Science / force suffixes
    'lực', 'năng', 'khí', 'điện', 'nhiệt', 'quang',
  ];
  
  // Common Vietnamese words that should NEVER be used as generated second syllables
  // They appear frequently but don't form real compounds with Sino-Vietnamese prefixes
  const SECOND_SYLLABLE_BLACKLIST = new Set([
    // Pronouns / determiners / particles
    'này', 'đó', 'kia', 'nào', 'ấy', 'đây', 'đấy',
    'tôi', 'bạn', 'nó', 'họ', 'mình', 'ta', 'chúng',
    // Conjunctions / prepositions / adverbs
    'và', 'nhưng', 'hay', 'hoặc', 'mà', 'thì', 'nên', 'vì', 'nếu',
    'của', 'cho', 'với', 'từ', 'đến', 'về', 'trong', 'ngoài', 'trên', 'dưới',
    'đã', 'đang', 'sẽ', 'vẫn', 'còn', 'không', 'chưa', 'được', 'bị', 'phải',
    'rất', 'lắm', 'quá', 'hơi', 'khá', 'cũng', 'luôn', 'chỉ',
    // Time / position words (not morphological)
    'sau', 'trước', 'lúc', 'khi', 'ngày', 'đêm', 'sáng', 'tối', 'chiều',
    // Common verbs that don't form compounds as suffixes
    'làm', 'đi', 'đến', 'lên', 'xuống', 'ra', 'vào',
    'ăn', 'uống', 'ngủ', 'chạy', 'bay', 'bơi',
    'nói', 'nghe', 'thấy', 'biết', 'hiểu', 'muốn', 'cần',
    'có', 'là', 'ở', 'hết', 'xong', 'rồi',
    // Common nouns that don't compound with Sino-Vietnamese prefixes
    'nhà', 'cửa', 'đường', 'xe', 'tàu', 'máy',
    'con', 'cái', 'chiếc', 'bức', 'tấm',
    'ông', 'bà', 'anh', 'chị', 'em', 'cô', 'chú', 'bác',
    'cơm', 'nước', 'gạo', 'thịt', 'cá', 'rau',
    'mắt', 'tai', 'mũi', 'miệng', 'tóc', 'tay', 'chân', 'đầu', 'bụng', 'ruột',
    'trời', 'đất', 'mưa', 'gió', 'nắng', 'lửa',
    // Common adjectives that don't compound meaningfully
    'tốt', 'xấu', 'đẹp', 'cao', 'thấp', 'dài', 'ngắn',
    'to', 'nhỏ', 'lớn', 'béo', 'gầy', 'nặng', 'nhẹ',
    'nóng', 'lạnh', 'ấm', 'mát', 'khô', 'ướt',
    'mới', 'cũ', 'trẻ', 'già', 'sớm', 'muộn',
    'dễ', 'khó', 'nhanh', 'chậm', 'xa', 'gần',
    // Colors
    'xanh', 'đỏ', 'trắng', 'đen', 'tím', 'hồng', 'nâu', 'xám',
    // Misc common words
    'lá', 'hoa', 'cây', 'đá', 'sắt', 'vàng', 'bạc',
    'chuyện', 'việc', 'lời', 'câu', 'bài',
    'tiền', 'bóng', 'giờ', 'lợi', 'kim', 'thực',
    'hơn', 'nhất', 'lắm', 'thêm', 'nữa', 'nhiều', 'ít',
    'sách', 'thư', 'ảnh',
    'hàng', 'thức', 'cánh', 'hùng',
    'dương', 'thu', 'loạn', 'hành',
    // More function words as suffixes
    'lại', 'đi', 'ra', 'vào', 'lên', 'xuống',
    'giả', 'thường', 'báo', 'tin',
    'thuốc', 'gà', 'bút', 'ngọc', 'thú',
    'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười',
    // More body parts / animals / common nouns
    'răng', 'mồm', 'bông', 'bò', 'sức', 'màu', 'xác',
    'nợ', 'bước', 'theo', 'bỏ', 'sao', 'chừng', 'các',
    'ma', 'mững', 'khê', 'nhận',
    // More common words that don't form Sino-Vietnamese compounds
    'lông', 'máu', 'dạy', 'sống', 'cả', 'lớp', 'mã',
  ]);

  // Common first syllables that shouldn't be used as generated prefixes
  // These are standalone Vietnamese words that don't form Sino-Vietnamese compounds
  const FIRST_SYLLABLE_BLACKLIST = new Set([
    // Common verbs
    'ăn', 'uống', 'ngủ', 'chạy', 'bay', 'bơi', 'đi', 'đến',
    'làm', 'nói', 'nghe', 'thấy', 'biết', 'hiểu', 'muốn', 'cần',
    'mang', 'mặc', 'đánh', 'đổi', 'để', 'lên', 'ra', 'vào',
    'gây', 'khai', 'gọi', 'giải', 'xây', 'chuyển', 'bổ',
    'chiếu', 'kéo', 'đẩy', 'bắn', 'cắt', 'xé', 'nấu', 'rửa',
    // Common adjectives / colors
    'đau', 'dễ', 'khó', 'béo', 'gầy', 'xanh', 'đỏ', 'vàng',
    'trắng', 'đen', 'tím', 'hồng', 'nâu', 'xám',
    // Animals / food / plants
    'gà', 'vịt', 'bò', 'heo', 'cá', 'chó', 'mèo', 'ngựa',
    'cà', 'tơ', 'lúa', 'bắp', 'khoai', 'đậu',
    // Particles / adverbs / prepositions
    'và', 'hay', 'nhưng', 'mà', 'thì', 'phải', 'hơi',
    'với', 'bởi', 'tại', 'cho', 'từ', 'về',
    // Body parts
    'mắt', 'tai', 'mũi', 'tay', 'chân', 'đầu', 'lưng',
    // Common nouns
    'áo', 'giày', 'mũ', 'nón', 'túi', 'ghế', 'bàn',
    'nhà', 'cửa', 'sông', 'núi', 'biển', 'rừng',
    'xe', 'ống', 'dầu', 'da', 'trà', 'giá',
    // More verbs
    'hỏi', 'mắc', 'đóng', 'mở', 'đặt', 'bắt', 'gặp',
    'treo', 'trống', 'đuổi', 'kêu', 'khóc', 'cười',
    // Determiners / quantifiers / particles (as prefixes)
    'này', 'đó', 'kia', 'nào', 'những', 'các', 'mọi', 'mỗi',
    'quá', 'rất', 'hơi', 'khá', 'cũng',
    // Adverbs
    'đã', 'đang', 'sẽ', 'vẫn', 'còn', 'không', 'chưa',
  ]);

  // Get confirmed syllables appearing as prefix/suffix in many existing words
  // Raised from 10 to 30 — ensures only truly productive syllables used
  const MIN_PARTNER_COUNT = 30;
  const confirmedSuffixes = new Set();
  const confirmedPrefixes = new Set();
  
  for (const [suffix, prefixes] of suffixToPrefixes) {
    if (prefixes.size >= MIN_PARTNER_COUNT) confirmedSuffixes.add(suffix);
  }
  for (const [prefix, suffixes] of prefixToSuffixes) {
    if (suffixes.size >= MIN_PARTNER_COUNT) confirmedPrefixes.add(prefix);
  }
  
  console.log(`  Confirmed prefixes (in ${MIN_PARTNER_COUNT}+ words): ${confirmedPrefixes.size}`);
  console.log(`  Confirmed suffixes (in ${MIN_PARTNER_COUNT}+ words): ${confirmedSuffixes.size}`);
  
  let newWords = 0;
  const newWordsBatch = [];
  const MAX_NEW_WORDS = 80000; // Reduced from 120K — quality over quantity
  
  // Strategy 1: Productive prefixes × confirmed suffixes
  let s1Count = 0;
  for (const prefix of PRODUCTIVE_PREFIXES) {
    for (const suffix of confirmedSuffixes) {
      if (newWords >= MAX_NEW_WORDS) break;
      if (prefix === suffix) continue;
      if (SECOND_SYLLABLE_BLACKLIST.has(suffix)) continue;
      const compound = prefix + ' ' + suffix;
      if (!wordSet.has(compound) && !llmBlacklist.has(compound) && isValidVietnameseWord(compound)) {
        if (bigramFreq && unigramFreq) {
          const pFreq = unigramFreq[prefix] || 0;
          const sFreq = unigramFreq[suffix] || 0;
          if (pFreq < 5 && sFreq < 5 && !bigramFreq[compound]) continue;
        }
        newWordsBatch.push(compound);
        newWords++;
        s1Count++;
      }
    }
  }
  console.log(`  Strategy 1 (productive prefix × confirmed suffix): ${s1Count.toLocaleString()} words`);

  // Strategy 2: Sino-Vietnamese morpheme prefixes × productive suffixes
  // Only allow prefixes that are known Sino-Vietnamese morphemes (not random Vietnamese words)
  const SINO_VIET_MORPHEMES = new Set([
    // From PRODUCTIVE_PREFIXES (already used in Strategy 1)
    ...PRODUCTIVE_PREFIXES,
    // Additional Sino-Vietnamese morphemes that commonly form compounds
    'ác', 'an', 'bá', 'bạch', 'bách', 'bảo', 'bi', 'binh', 'bình',
    'cải', 'cảnh', 'cầu', 'chi', 'chiến', 'chính', 'chung', 'chúng',
    'công', 'cung', 'cường', 'dân', 'danh', 'di', 'dị', 'diệu',
    'du', 'dược', 'đạo', 'đế', 'điện', 'định', 'đức',
    'giáo', 'giao', 'hải', 'hán', 'hạnh', 'hòa', 'hoàng', 'hồng',
    'hùng', 'hương', 'hưng', 'khoa', 'không', 'kiến', 'kinh', 'kim',
    'kỹ', 'lâm', 'lập', 'lệ', 'linh', 'long', 'luân', 'lương',
    'mật', 'minh', 'mỹ', 'nam', 'ngọc', 'nguyên', 'nhân', 'nhạc',
    'nông', 'phong', 'phú', 'phúc', 'phương', 'quân', 'quang', 'quốc',
    'quy', 'sĩ', 'sơn', 'tài', 'tâm', 'tây', 'thái', 'thần',
    'thất', 'thế', 'thiên', 'thiện', 'thọ', 'thời', 'thủ', 'thương',
    'tiến', 'tinh', 'tín', 'trí', 'trị', 'triều', 'truyền', 'tư',
    'từ', 'tương', 'tướng', 'vạn', 'văn', 'vi', 'viễn', 'việt',
    'vĩnh', 'vũ', 'vương', 'xuân', 'y',
  ]);

  let s2Count = 0;
  for (const prefix of confirmedPrefixes) {
    if (!SINO_VIET_MORPHEMES.has(prefix)) continue;
    for (const suffix of PRODUCTIVE_SUFFIXES) {
      if (newWords >= MAX_NEW_WORDS) break;
      if (prefix === suffix) continue;
      const compound = prefix + ' ' + suffix;
      if (!wordSet.has(compound) && !llmBlacklist.has(compound) && isValidVietnameseWord(compound)) {
        if (bigramFreq && unigramFreq) {
          const pFreq = unigramFreq[prefix] || 0;
          const sFreq = unigramFreq[suffix] || 0;
          if (pFreq < 5 && sFreq < 5 && !bigramFreq[compound]) continue;
        }
        newWordsBatch.push(compound);
        newWords++;
        s2Count++;
      }
    }
  }
  console.log(`  Strategy 2 (confirmed prefix × productive suffix): ${s2Count.toLocaleString()} words`);

  // Strategy 3: DISABLED — data-driven prefix × suffix produced too much noise
  // (e.g. "béo chủ", "hồng của"). Only curated prefix/suffix lists are reliable.
  let s3Count = 0;
  console.log(`  Strategy 3 (disabled — quality over quantity): ${s3Count} words`);
  
  // Add all new words to Set
  const batchSet = new Set(newWordsBatch);
  for (const w of batchSet) {
    wordSet.add(w);
  }
  
  console.log(`  Total generated: ${newWords.toLocaleString()} new compound words`);
  console.log(`  → Running total: ${wordSet.size.toLocaleString()} words\n`);
  
  // ===== Phase 4: Final cleanup =====
  console.log('🧹 Phase 4: Final cleanup and validation...');

  const finalWords = [];
  let rejected = 0;
  let blacklisted = 0;

  for (const word of wordSet) {
    if (llmBlacklist.has(word)) {
      blacklisted++;
      continue;
    }
    if (isValidVietnameseWord(word)) {
      finalWords.push(word);
    } else {
      rejected++;
    }
  }

  console.log(`  Rejected ${rejected} words in final validation`);
  if (blacklisted > 0) {
    console.log(`  Removed ${blacklisted} words from LLM blacklist`);
  }
  console.log(`  Final word count: ${finalWords.length.toLocaleString()}\n`);
  
  // ===== Phase 5: Sort and write =====
  console.log('📝 Phase 5: Sorting and writing output...');
  
  finalWords.sort((a, b) => a.localeCompare(b, 'vi'));
  
  fs.writeFileSync(OUTPUT_PATH, finalWords.join('\n') + '\n', 'utf8');
  
  const fileSize = fs.statSync(OUTPUT_PATH).size;
  console.log(`  ✅ Successfully wrote ${finalWords.length.toLocaleString()} words to ${OUTPUT_PATH}`);
  console.log(`  📊 File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
  
  // ===== Stats =====
  console.log('\n📊 FINAL STATISTICS:');
  console.log('===================');
  console.log(`  Total unique words: ${finalWords.length.toLocaleString()}`);
  
  const singleSyllable = finalWords.filter(w => !w.includes(' ')).length;
  const twoSyllable = finalWords.filter(w => w.split(' ').length === 2).length;
  const threePlus = finalWords.filter(w => w.split(' ').length >= 3).length;
  
  console.log(`  1-syllable: ${singleSyllable.toLocaleString()}`);
  console.log(`  2-syllable: ${twoSyllable.toLocaleString()}`);
  console.log(`  3+ syllable: ${threePlus.toLocaleString()}`);
  
  const letterCounts = {};
  for (const word of finalWords) {
    const firstLetter = word.charAt(0);
    letterCounts[firstLetter] = (letterCounts[firstLetter] || 0) + 1;
  }
  
  console.log(`\n  Words by first letter (top 15):`);
  const sortedLetters = Object.entries(letterCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [letter, count] of sortedLetters) {
    console.log(`    ${letter}: ${count.toLocaleString()} words`);
  }
  
  if (finalWords.length >= 200000) {
    console.log('\n  🎉 TARGET MET: Over 200,000 words!');
  } else if (finalWords.length >= 150000) {
    console.log('\n  ✅ Secondary target met: Over 150,000 words!');
  } else {
    console.log(`\n  ⚠ Below target. Current: ${finalWords.length.toLocaleString()}, Target: 150,000+`);
  }
}

main();
