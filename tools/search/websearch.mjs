// Free web search + crawl built on the Jina reader (r.jina.ai) and DuckDuckGo's HTML results.
//   search(query)            -> [{ title, url, snippet }]
//   rank(query, results)     -> results with a relevance score (BM25 + domain prior + recency + squad intent + learned domain success)
//   fetchPage(url)           -> markdown text of the page (cached on disk, throttled, retried)
//   squadFor(name, opts)     -> { players: [{ name, pos, support }], sources: [...] }
// Uses curl for transport so the sandbox proxy settings are honoured.
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CACHE = process.env.SEARCH_CACHE || path.join(HERE, '.cache');
const STATS_FILE = path.join(HERE, 'domain_stats.json');
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

// ------------------------------------------------------------------ extraction
const STOP = new Set(('squad roster players player goalkeepers goalkeeper defenders defender midfielders midfielder forwards forward attackers strikers coach manager staff premier league liga serie bundesliga ' +
  'ligue champions europa conference cup fc cf sc ac as club team national united city town football soccer season fixtures results table news home away kit shirt number position age nationality ' +
  'apps starts minutes goals assists appearances loan transfers transfer contract value market stats statistics profile view all more read about contact login register menu search sign cookies privacy terms ' +
  'first youth under women men senior official website tickets shop store media video watch live stream photos gallery history stadium arena academy reserve staff').split(' '));
const POS = { goalkeeper: 'GK', keeper: 'GK', 'centre-back': 'CB', 'center-back': 'CB', defender: 'CB', 'left-back': 'LB', 'right-back': 'RB', 'defensive mid': 'CDM', 'central mid': 'CM', midfielder: 'CM', 'attacking mid': 'CAM',
  'left winger': 'LW', 'right winger': 'RW', winger: 'RW', forward: 'ST', striker: 'ST', 'centre-forward': 'ST', 'second striker': 'ST', gk: 'GK', cb: 'CB', lb: 'LB', rb: 'RB', cm: 'CM', cdm: 'CDM', cam: 'CAM', st: 'ST', lw: 'LW', rw: 'RW' };
const title = (s) => s.split('-').map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
const looksLikeName = (n) => {
  if (n.length < 3 || n.length > 40 || /\d|@|[<>_=#|]/.test(n)) return false;
  const parts = n.split(/\s+/); if (parts.length > 5) return false;
  if (!parts.every((p) => /^[\p{Lu}][\p{L}'.\-]*$|^(da|de|di|dos|das|del|van|von|der|den|el|al|bin|ben|le|la|ter|ten|mc|mac)$/iu.test(p))) return false;
  return !parts.some((p) => STOP.has(norm(p)));
};
function posOf(text) { const t = norm(text); for (const k of Object.keys(POS).sort((a, b) => b.length - a.length)) if (t.includes(k)) return POS[k]; return null; }

export function extractPlayers(md) {
  const found = new Map(), add = (name, pos, how) => { const k = norm(name); const e = found.get(k) || { name, pos: null, how: new Set() }; if (pos && !e.pos) e.pos = pos; e.how.add(how); found.set(k, e); };
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    // player profile links: [Surname](.../player/<slug>) or [Full Name](.../players/<id>-slug)
    for (const m of L.matchAll(/\[([^\]]{2,40})\]\((https?:\/\/[^)\s]*\/(?:player|players|spieler|jugador|giocatore|joueur|speler|jogador|profil|profile)s?\/[^)\s]+)\)/giu)) {
      let text = m[1].replace(/\*+/g, '').trim(); const slug = (m[2].split('/').filter(Boolean).pop() || '').replace(/^\d+[-_]?/, '').replace(/\.\w+$/, '');
      const sparts = slug.split('-').filter((p) => p && !/^\d+$/.test(p));
      let name = text;
      if (sparts.length >= 2 && sparts.length <= 4 && norm(sparts[sparts.length - 1]) === norm(text.split(' ').pop())) name = title(sparts.join('-'));
      else if (sparts.length >= 2 && sparts.length <= 4 && text.split(' ').length === 1 && sparts.some((p) => norm(p) === norm(text))) name = title(sparts.join('-'));
      if (looksLikeName(name)) add(name, posOf(L + ' ' + (lines[i + 1] || '')), 'link');
    }
    // markdown table rows: | 1 | GK | David Raya | ... |
    if (/^\s*\|/.test(L)) {
      const cells = L.split('|').map((c) => c.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*+/g, '').trim()).filter(Boolean);
      const cand = cells.filter((c) => looksLikeName(c) && c.split(' ').length >= 2);
      if (cand.length === 1) add(cand[0], posOf(cells.join(' ')), 'table');
    }
  }
  return [...found.values()].map((e) => ({ name: e.name, pos: e.pos, how: [...e.how] }));
}

// ------------------------------------------------------------------ squad search
const COUNTRIES = (() => { try { return new Set(Object.values(JSON.parse(fs.readFileSync(path.join(HERE, '../commentary/teams.json'), 'utf8'))).map(norm)); } catch { return new Set(); } })();
['england', 'scotland', 'wales', 'northern ireland', 'republic of ireland', 'usa', 'united states'].forEach((c) => COUNTRIES.add(c));

// merge surname-only / first-name-only forms into the unique fuller name that contains them
function canonicalise(lists) {
  const all = new Map();                                    // norm -> display
  for (const l of lists) for (const p of l) { const k = norm(p.name); if (!all.has(k) || p.name.split(' ').length > all.get(k).split(' ').length) all.set(k, p.name); }
  const keys = [...all.keys()];
  const canon = (k) => {
    const toks = k.split(' ');
    const longer = keys.filter((o) => o !== k && o.split(' ').length > toks.length && toks.every((t) => o.split(' ').includes(t)));
    return longer.length === 1 ? canon(longer[0]) : k;      // ambiguous ("Gabriel") stays as is
  };
  return { canon, display: (k) => all.get(k) };
}

export async function squadFor(team, { kind = 'club', pages = 4, extra = '' } = {}) {
  const query = kind === 'nation' ? `${team} national football team squad 2026 players list ${extra}` : `${team} squad 2026/27 players ${extra}`;
  const results = rank(query, await search(query), team);
  const used = [], pageLists = [];
  for (const r of results.slice(0, pages)) {
    const md = await reader(r.url);
    const players = (md ? extractPlayers(md) : []).filter((p) => !COUNTRIES.has(norm(p.name)));
    const ok = players.length >= 8; recordOutcome(r.domain, ok);
    used.push({ url: r.url, domain: r.domain, score: +r.score.toFixed(2), found: players.length });
    if (ok) pageLists.push({ players, score: r.score, big: players.length > 70 });
  }
  const { canon, display } = canonicalise(pageLists.map((x) => x.players));
  const tally = new Map(), order = [];
  const best = pageLists.filter((x) => !x.big).sort((a, b) => b.score - a.score)[0] || pageLists[0];
  const bump = (p, page) => { const k = canon(norm(p.name)); const e = tally.get(k) || { name: display(k), pos: null, pages: new Set() }; e.pos = e.pos || p.pos; e.pages.add(page); tally.set(k, e); return k; };
  pageLists.forEach((pg, i) => pg.players.forEach((p) => { const k = bump(p, i); if (pg === best && !order.includes(k)) order.push(k); }));
  // squad = names from the best page (its order keeps keepers first) + anything confirmed by 2+ pages
  const confirmed = [...tally.keys()].filter((k) => tally.get(k).pages.size >= 2 && !order.includes(k));
  const players = [...order, ...confirmed].map((k) => ({ name: tally.get(k).name, pos: tally.get(k).pos, pages: tally.get(k).pages.size }));
  return { team, query, sources: used, players };
}
