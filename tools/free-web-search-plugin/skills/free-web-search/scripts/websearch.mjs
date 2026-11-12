// Free web search + crawl built on the Jina reader (r.jina.ai) and DuckDuckGo's HTML results.
//   search(query)            -> [{ title, url, snippet }]
//   rank(query, results)     -> results with a relevance score (BM25 + domain prior + recency + squad intent + learned domain success)
//   reader(url)              -> markdown text of any page (cached on disk, throttled, retried)
//   research(query, opts)    -> search, rank, read the best pages (and follow the best links), return ranked passages
// Uses curl for transport so the sandbox proxy settings are honoured.
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import os from 'os';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CACHE = process.env.SEARCH_CACHE || path.join(os.tmpdir(), 'free-web-search-cache');
const STATS_FILE = path.join(CACHE, 'domain_stats.json');
const DELAY_MS = +process.env.SEARCH_DELAY_MS || 3500;      // spacing between reader requests
fs.mkdirSync(CACHE, { recursive: true });

const BLOCKED = /bots use DuckDuckGo too|complete the following challenge|captcha|unusual traffic|are you a robot/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function throttle() { const wait = last + DELAY_MS - Date.now(); if (wait > 0) await sleep(wait); last = Date.now(); }

function curl(url) {
  return new Promise((resolve) => {
    const args = ['-sS', '-L', '-m', '70', '-A', 'Mozilla/5.0 (compatible; SquadSearch/1.0)', '-w', '\n__HTTP__%{http_code}', url];
    if (process.env.JINA_API_KEY) args.splice(0, 0, '-H', `Authorization: Bearer ${process.env.JINA_API_KEY}`);
    execFile('curl', args, { maxBuffer: 20 * 1024 * 1024 }, (err, out) => {
      const m = /\n__HTTP__(\d+)$/.exec(out || '');
      resolve({ status: m ? +m[1] : 0, body: m ? out.slice(0, m.index) : '', err });
    });
  });
}

export async function reader(target, { retries = 3 } = {}) {
  const key = createHash('sha1').update(target).digest('hex');
  const file = path.join(CACHE, key + '.md');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  for (let i = 0; i <= retries; i++) {
    await throttle();
    const r = await curl('https://r.jina.ai/' + target);
    if (r.status === 200 && r.body.length > 200 && !BLOCKED.test(r.body.slice(0, 1500))) { fs.writeFileSync(file, r.body); return r.body; }
    if (r.status === 200 && BLOCKED.test(r.body.slice(0, 1500))) { await sleep(20000 * (i + 1)); continue; }   // bot challenge: wait, then retry
    if (r.status === 429 || r.status >= 500 || r.status === 0) await sleep(8000 * (i + 1));   // back off
    else break;
  }
  return '';
}

// ------------------------------------------------------------------ search
const clean = (s) => s.replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*+/g, '').replace(/\s+/g, ' ').trim().slice(0, 400);
const unwrap = (u) => { try { return decodeURIComponent(u); } catch { return u; } };

function parseDdgHtml(md) {            // html.duckduckgo.com/html/
  const re = /^## \[(.+?)\]\((https:\/\/duckduckgo\.com\/l\/\?uddg=([^&)]+)[^)]*)\)/gm, heads = []; let m;
  while ((m = re.exec(md))) heads.push({ title: m[1].replace(/\*+/g, ''), url: unwrap(m[3]), at: m.index + m[0].length });
  return heads.map((h, i) => ({ title: h.title, url: h.url, snippet: clean(md.slice(h.at, i + 1 < heads.length ? heads[i + 1].at : undefined)) }));
}
function parseDdgLite(md) {            // lite.duckduckgo.com/lite/  ->  "1.[Title](https://duckduckgo.com/l/?uddg=...)"
  const re = /^\d+\.\[(.+?)\]\((https:\/\/duckduckgo\.com\/l\/\?uddg=([^&)]+)[^)]*)\)/gm, heads = []; let m;
  while ((m = re.exec(md))) heads.push({ title: m[1].replace(/\*+/g, ''), url: unwrap(m[3]), at: m.index + m[0].length });
  return heads.map((h, i) => ({ title: h.title, url: h.url, snippet: clean(md.slice(h.at, i + 1 < heads.length ? heads[i + 1].at : undefined)) }));
}
function parseBing(md) {               // www.bing.com/search  ->  redirect links carry the target as u=a1<base64url>
  const re = /\[([^\]]{8,160})\]\((https:\/\/www\.bing\.com\/ck\/a\?[^)]*?[&?]u=a1([A-Za-z0-9_\-]+)[^)]*)\)/g, out = [], seen = new Set(); let m;
  while ((m = re.exec(md))) {
    let url = ''; try { url = Buffer.from(m[3].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch {}
    if (!/^https?:/.test(url) || /bing\.com|microsoft\.com/.test(url) || seen.has(url)) continue;
    seen.add(url); out.push({ title: m[1].replace(/\*+/g, ''), url, snippet: clean(md.slice(m.index + m[0].length, m.index + m[0].length + 500)) });
  }
  return out;
}
const ENGINES = [
  ['ddg-html', (q) => 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), parseDdgHtml],
  ['ddg-lite', (q) => 'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(q), parseDdgLite],
  ['bing', (q) => 'https://www.bing.com/search?q=' + encodeURIComponent(q), parseBing],
];
export async function search(query) {
  for (const [name, url, parse] of ENGINES) {
    const md = await reader(url(query), { retries: 1 });
    const res = md ? parse(md).filter((r) => /^https?:/.test(r.url)) : [];
    if (res.length) return res.map((r) => ({ ...r, engine: name }));
  }
  return [];
}

// ------------------------------------------------------------------ ranking
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tok = (s) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1);
const PRIOR = { 'starting11.com': 1.2, 'uefa.com': 1.0, 'transfermarkt.com': 0.9, 'transfermarkt.us': 0.9, 'premierleague.com': 0.9, 'laliga.com': 0.9, 'bundesliga.com': 0.9,
  'fotmob.com': 0.5, 'wikipedia.org': 0.6, 'espn.com': 0.4, 'sofascore.com': 0.3, 'soccerway.com': 0.4, 'footballsquads.co.uk': 0.5, 'worldfootball.net': 0.5, 'sofifa.com': 0.1, 'skysports.com': 0.4, 'bbc.com': 0.3 };
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const loadStats = () => { try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch { return {}; } };
const saveStats = (s) => fs.writeFileSync(STATS_FILE, JSON.stringify(s, null, 1));

export function rank(query, results, team = '') {
  const q = tok(query), docs = results.map((r) => tok(r.title + ' ' + r.snippet + ' ' + r.url));
  const N = docs.length || 1, avg = docs.reduce((s, d) => s + d.length, 0) / N || 1, df = {};
  for (const d of docs) for (const w of new Set(d)) df[w] = (df[w] || 0) + 1;
  const stats = loadStats(), teamTok = tok(team);
  const scored = results.map((r, i) => {
    const d = docs[i], tf = {}; for (const w of d) tf[w] = (tf[w] || 0) + 1;
    let bm = 0; for (const w of q) { if (!tf[w]) continue; const idf = Math.log(1 + (N - (df[w] || 0) + 0.5) / ((df[w] || 0) + 0.5)); bm += idf * (tf[w] * 2.2) / (tf[w] + 1.2 * (0.25 + 0.75 * d.length / avg)); }
    const dom = domainOf(r.url), text = norm(r.title + ' ' + r.url + ' ' + r.snippet);
    let prior = PRIOR[dom] ?? 0; for (const k of Object.keys(PRIOR)) if (dom.endsWith(k)) prior = PRIOR[k];
    if (teamTok.length && teamTok.some((w) => w.length > 3 && dom.includes(w))) prior = Math.max(prior, 0.8);   // official club / federation site
    const recent = /2026[\/-]?(27)?|2027/.test(text) ? 0.6 : /202[0-5]/.test(text) ? -0.5 : 0;
    const intent = /squad|roster|kader|plantilla|rosa|elenco|plantel|kadro|players|selecci|liste/.test(text) ? 0.6 : 0;
    const st = stats[dom] || { ok: 0, n: 0 }, learned = 1.5 * ((st.ok + 1) / (st.n + 2) - 0.5);   // adapts from past crawls
    const junk = /(ticket|shop|betting|odds|fantasy tips|tiktok|youtube|facebook|instagram|reddit)/.test(dom + ' ' + text.slice(0, 80)) ? -1.5 : 0;
    return { ...r, domain: dom, score: 1.6 * (bm / (q.length || 1)) + prior + recent + intent + learned + junk };
  });
  return scored.sort((a, b) => b.score - a.score);
}
export function recordOutcome(domain, ok) { const s = loadStats(); const e = (s[domain] ||= { ok: 0, n: 0 }); e.n++; if (ok) e.ok++; saveStats(s); }

// ------------------------------------------------------------------ page cleaning and passage retrieval
const linkDensity = (s) => { const links = (s.match(/\[[^\]]*\]\([^)]*\)/g) || []).join('').length; return s.length ? links / s.length : 0; };
const stripMd = (s) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>#]+/g, ' ').replace(/\s+/g, ' ').trim();

// Split a page into readable paragraphs, dropping menus, link lists, cookie banners and other boilerplate.
export function paragraphs(md) {
  const body = md.replace(/^Title:.*\n+URL Source:.*\n+(?:Final URL:.*\n+)?(?:Published Time:.*\n+)?Markdown Content:\n/, '');
  const out = [], seen = new Set();
  for (const block of body.split(/\n\s*\n/)) {
    const text = stripMd(block);
    if (text.length < 40 || linkDensity(block) > 0.5) continue;
    const words = text.split(' '), caps = words.filter((w) => /^[\p{Lu}]/u.test(w)).length;
    if (words.length > 8 && caps / words.length > 0.55 && !/[.!?]/.test(text)) continue;   // menu / tag-cloud text, not prose
    if (/cookie|privacy policy|subscribe to|sign up for|all rights reserved|accept all|javascript is disabled/i.test(text) && text.length < 220) continue;
    const key = text.slice(0, 80).toLowerCase(); if (seen.has(key)) continue; seen.add(key);
    out.push(text);
  }
  return out;
}

// BM25 over the paragraphs of one page: returns the k most relevant passages (in score order).
export function passages(md, query, k = 4, maxChars = 700) {
  const paras = paragraphs(md), q = tok(query); if (!paras.length) return [];
  const docs = paras.map((p) => tok(p)), N = docs.length, avg = docs.reduce((s, d) => s + d.length, 0) / N || 1, df = {};
  for (const d of docs) for (const w of new Set(d)) df[w] = (df[w] || 0) + 1;
  const scored = paras.map((p, i) => {
    const tf = {}; for (const w of docs[i]) tf[w] = (tf[w] || 0) + 1; let s = 0;
    for (const w of q) { if (!tf[w]) continue; const idf = Math.log(1 + (N - (df[w] || 0) + 0.5) / ((df[w] || 0) + 0.5)); s += idf * (tf[w] * 2.2) / (tf[w] + 1.2 * (0.25 + 0.75 * docs[i].length / avg)); }
    const phrase = norm(p).includes(norm(query)) ? 1.5 : 0;                 // exact phrase bonus
    return { text: p.length > maxChars ? p.slice(0, maxChars) + '…' : p, score: s + phrase, i };
  }).filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}

// Candidate links on a page, scored by how well their anchor text and URL match the query.
export function links(md, baseUrl, query, k = 6) {
  const q = new Set(tok(query)), seen = new Set(), out = [];
  for (const m of md.matchAll(/\[([^\]]{3,120})\]\((https?:\/\/[^)\s]+)\)/g)) {
    const url = m[2].replace(/#.*$/, ''); if (seen.has(url) || url === baseUrl || /\.(png|jpe?g|gif|svg|webp|css|js|pdf|zip)(\?|$)/i.test(url)) continue; seen.add(url);
    const anchor = tok(m[1] + ' ' + url.replace(/https?:\/\/[^/]+/, '')), hit = anchor.filter((w) => q.has(w)).length;
    if (!hit) continue;
    out.push({ url, anchor: m[1].replace(/\*+/g, '').trim(), score: hit / Math.sqrt(anchor.length + 1) + (domainOf(url) === domainOf(baseUrl) ? 0.15 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k);
}

const titleOf = (md) => (/^Title:\s*(.+)$/m.exec(md) || [])[1] || '';

// General-purpose research: search -> rank -> read top pages -> (optionally) follow the best links -> rank passages.
//   opts: pages (default 3), depth (0 = only search hits, 1 = also follow best on-page links), follow (links per page, default 2),
//         passages (per page, default 3), chars (per passage), queries (extra query variants to merge)
export async function research(query, opts = {}) {
  const { pages = 3, depth = 0, follow = 2, passages: k = 3, chars = 700, queries = [] } = opts;
  let hits = rank(query, await search(query));
  for (const extra of queries) hits = hits.concat(rank(extra, await search(extra)));
  const seenUrl = new Set(), top = hits.filter((h) => !seenUrl.has(h.url) && seenUrl.add(h.url)).sort((a, b) => b.score - a.score).slice(0, pages);
  const results = [], visited = new Set(top.map((h) => h.url));
  const visit = async (url, meta) => {
    const md = await reader(url); const ok = md.length > 300; recordOutcome(domainOf(url), ok);
    if (!ok) return null;
    const ps = passages(md, query, k, chars); if (!ps.length) return null;
    const r = { url, title: meta.title || titleOf(md), domain: domainOf(url), via: meta.via, score: +(meta.score + ps[0].score * 0.2).toFixed(2), passages: ps.map((p) => p.text) };
    results.push(r); return md;
  };
  const mds = [];
  for (const h of top) { const md = await visit(h.url, { title: h.title, score: h.score, via: 'search' }); if (md) mds.push({ md, url: h.url, score: h.score }); }
  if (depth >= 1) {
    const cand = mds.flatMap((p) => links(p.md, p.url, query, follow + 2).map((l) => ({ ...l, parent: p.url, score: l.score + p.score * 0.1 })))
      .filter((l) => !visited.has(l.url)).sort((a, b) => b.score - a.score).slice(0, pages * follow);
    for (const l of cand) { visited.add(l.url); await visit(l.url, { title: l.anchor, score: l.score, via: 'link from ' + domainOf(l.parent) }); }
  }
  return { query, results: results.sort((a, b) => b.score - a.score) };
}
