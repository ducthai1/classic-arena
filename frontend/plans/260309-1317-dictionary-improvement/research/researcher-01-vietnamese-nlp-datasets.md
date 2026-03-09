# Vietnamese NLP Datasets & Word Sources

## 1. Vietnamese Wikipedia Dump
- **URL:** `dumps.wikimedia.org/viwiki/latest/viwiki-latest-pages-articles.xml.bz2`
- **Size:** ~1.5GB compressed, ~800K articles
- **Word extraction:** Parse XML → tokenize → count n-gram frequency
- **Tools:** `wikiextractor` (Python) to clean markup → word frequency counter
- **Estimated unique 2-gram words:** 200K-400K
- **Pros:** Free, comprehensive, real-world usage frequency
- **Cons:** Contains proper nouns, foreign words; needs filtering

## 2. Vietnamese Wiktionary
- **API:** `vi.wiktionary.org/w/api.php?action=query&list=categorymembers&cmtitle=Thể_loại:Mục_từ_tiếng_Việt`
- **Rate limit:** 200 req/min for registered bots, 50/min anonymous
- **Format:** JSON, paginated (cmcontinue token)
- **Estimated words:** ~60K entries with definitions
- **Pros:** Every entry has definition = guaranteed real word
- **Cons:** Incomplete coverage of compound words; rate-limited crawling

## 3. VnCoreNLP / PhoBERT Vocabulary
- **Already included** as `vinai-dictionary.txt` and `vinai-vn-dictionary.txt` (91K + 28K lines)
- No additional action needed

## 4. Pyvi NLP Dictionary
- **Already included** as `pyvi-words.txt` (31K lines)

## 5. Ho Ngoc Duc Project
- **Already included** as `hongocduc-words.txt` (73K lines)

## 6. Vietnamese Word Frequency Lists (New Sources)
- **VNTC corpus** (Vietnamese News Text Classification): 30K+ articles, can extract word freq
- **VLSP shared tasks:** Vietnamese NLP datasets from annual competitions
- **VnExpress crawl:** News corpus for frequency analysis

## 7. Tratu.coviet.vn / Soha Dictionary API
- Online Vietnamese dictionaries with definition lookup
- Can verify if a word exists by checking HTTP response

## Recommendation Priority
1. **Wiktionary crawl** — highest confidence (has definition), ~60K new words potential
2. **Wikipedia frequency** — secondary signal for filtering, not direct source
3. **Online dictionary API** — verification layer for uncertain words
