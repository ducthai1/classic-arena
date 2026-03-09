# LLM Batch Validation — Cost & Strategy Analysis

## Provider Comparison

| Provider | Model | Input $/1M tok | Output $/1M tok | Batch Discount |
|----------|-------|----------------|-----------------|----------------|
| Google | Gemini 2.0 Flash | $0.10 | $0.40 | N/A (already cheap) |
| Anthropic | Claude Haiku 4.5 | $0.80 | $4.00 | 50% via Batch API |
| OpenAI | GPT-4o-mini | $0.15 | $0.60 | 50% via Batch API |

## Cost Estimation for 120K Words

**Batch size:** 100 words/request = 1,200 requests
**Token estimate per request:** ~300 input + ~200 output = ~500 tokens

| Provider | Total Input Tokens | Total Output Tokens | Estimated Cost |
|----------|-------------------|---------------------|----------------|
| Gemini Flash | 360K | 240K | **~$0.13** |
| Claude Haiku (batch) | 360K | 240K | **~$0.62** |
| GPT-4o-mini (batch) | 360K | 240K | **~$0.10** |

**Winner: Gemini Flash or GPT-4o-mini** — both under $0.15 for full run.

## Recommended Prompt Strategy

```
System: You are a Vietnamese language expert. For each word, determine if it is a real Vietnamese word/phrase that native speakers would recognize and use.

Classify each word as:
- VALID: Real Vietnamese word with clear meaning
- INVALID: Not a real word, meaningless combination
- UNCERTAIN: Might be valid but you're not sure (regional, archaic, technical)

Input: [list of 100 words, one per line]
Output: JSON array of {word, status, reason}
```

## Key Considerations
- **Gemini Flash:** Free tier available (15 RPM, 1M TPM) — can process 120K words for FREE
- **Rate limiting:** Add 1s delay between requests, retry on 429
- **Resumability:** Save progress per batch to JSON file
- **Safety:** Treat UNCERTAIN as VALID (keep in dictionary)

## Recommendation
Use **Gemini Flash** (free tier or paid): cheapest, sufficient quality for word validation, generous rate limits. Fall back to GPT-4o-mini if Gemini unavailable.
