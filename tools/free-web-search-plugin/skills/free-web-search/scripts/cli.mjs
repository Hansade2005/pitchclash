#!/usr/bin/env node
// Free web search (Jina reader + DuckDuckGo / Bing). No API key. General purpose.
//   node cli.mjs search   "query" [--top 8]                      ranked results: title, url, snippet, score
//   node cli.mjs fetch    <url>   [--query "q"] [--chars 6000]   the page as markdown, or only its passages that match --query
//   node cli.mjs research "query" [--pages 3] [--depth 1] [--follow 2] [--passages 3] [--also "variant"]
//                                  search, read the best pages, follow the best links, return ranked passages
import { search, rank, reader, passages, research } from './websearch.mjs';

const [cmd, first, ...rest] = process.argv.slice(2);
const argv = [first, ...rest];
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const all = (n) => argv.reduce((a, x, i) => (x === '--' + n && argv[i + 1] ? [...a, argv[i + 1]] : a), []);
const out = (o) => console.log(JSON.stringify(o, null, 1));

if (cmd === 'search') {
  out(rank(first, await search(first)).slice(0, +flag('top', 8)).map((r) => ({ title: r.title, url: r.url, score: +r.score.toFixed(2), engine: r.engine, snippet: r.snippet.slice(0, 260) })));
} else if (cmd === 'fetch') {
  const md = await reader(first), q = flag('query', '');
  console.log(q ? passages(md, q, +flag('passages', 6), 900).map((p, i) => `[${i + 1}] ${p.text}`).join('\n\n') : md.slice(0, +flag('chars', 6000)));
} else if (cmd === 'research' || cmd === 'crawl') {
  out(await research(first, { pages: +flag('pages', 3), depth: +flag('depth', 0), follow: +flag('follow', 2), passages: +flag('passages', 3), chars: +flag('chars', 700), queries: all('also') }));
} else {
  console.error('usage: cli.mjs search|fetch|research "query-or-url" [flags]  (see header of this file)'); process.exit(2);
}
