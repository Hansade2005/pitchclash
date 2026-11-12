---
name: free-web-search
description: Free, general-purpose web search and page crawling with no API key and no search-tool budget. Use it whenever you need to look something up on the web (facts, docs, news, prices, people, how-tos) and the built-in WebSearch tool is unavailable, rate-limited, over budget, or too shallow. Searches DuckDuckGo/Bing through the Jina reader, ranks candidate links, reads the best pages, follows the most relevant links one level deeper, and returns the passages that answer the question.
---

# Free web search

A self-contained search-and-crawl tool built on public services (`r.jina.ai` reader + DuckDuckGo, with DuckDuckGo Lite and Bing as fallbacks). It works for any topic. Needs `node` (18+) and `curl`; no API key.

All commands run from this skill's folder: `node scripts/cli.mjs <command> ...` (use the absolute path to `scripts/cli.mjs` if the working directory is elsewhere).

## Commands

| Command | What it does |
|---|---|
| `search "query" [--top 8]` | Ranked results: title, url, snippet, score. Use to see what exists before reading. |
| `fetch <url> [--query "q"] [--chars 6000]` | The page as markdown. With `--query`, returns only the paragraphs that best match it (menus and boilerplate removed). |
| `research "query" [--pages 3] [--depth 1] [--follow 2] [--passages 3] [--also "variant"]` | The full pipeline: search, rank, read the top pages, follow the best on-page links, return ranked passages with their sources. |

Examples:

```bash
node scripts/cli.mjs search "rust async runtimes comparison 2026" --top 6
node scripts/cli.mjs research "how do I rotate an S3 access key" --pages 3 --depth 1
node scripts/cli.mjs research "React 19 use hook" --also "React use() hook server components" --passages 4
node scripts/cli.mjs fetch https://example.com/docs/page --query "rate limits"
```

## How it works

1. **Search** the query on DuckDuckGo (HTML), falling back to DuckDuckGo Lite, then Bing, if one is blocked or empty.
2. **Rank** candidates: BM25 text match on title, snippet and URL, plus a prior for reference/official domains, a recency boost for current years, a boost for pages that look like the thing asked for, a penalty for shops/social/video, and a per-domain success rate learned from past crawls.
3. **Read** the top pages through the reader, split them into paragraphs, drop menus and link lists, and rank the paragraphs against the query (BM25 plus an exact-phrase bonus).
4. **Follow links** (`--depth 1`): candidate links on those pages are scored by anchor text and URL against the query, and the best ones are read too.
5. Results come back sorted by score, each with its URL and the passages that matched.

## Using it well

- Start with `research`; use `search` first only when you want to choose sources yourself.
- Add `--also "<rephrasing>"` for ambiguous topics; results from all variants are merged and de-duplicated.
- Use `--depth 1` for questions whose answer sits one click away (documentation indexes, listing pages, news roundups).
- Always cite the URLs you used, and say when sources disagree or look dated. Passages are extracts, not verified facts.
- For lists (rosters, tables, prices), `fetch <url> --chars 20000` on the best source and read the structure directly.

## Limits and etiquette

- Requests are throttled (default 3.5 s apart) and retried with backoff. Set `SEARCH_DELAY_MS` to change the spacing; avoid running many copies in parallel, because the shared reader address gets rate-limited and search engines may show a bot challenge.
- If every engine is blocked, results come back empty: wait a few minutes and retry. Setting `JINA_API_KEY` raises the reader's rate limit.
- Pages are cached in the OS temp folder (override with `SEARCH_CACHE`), so repeat reads are free.
- Pages that need a login, heavy JavaScript, or that block the reader return little or nothing.
- Queries and URLs are sent to third-party services (Jina, DuckDuckGo, Bing). Never put private, personal or confidential information in a query.
