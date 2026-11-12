// Shared parsing for Wikipedia squad templates.
const clean = (s) => s.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/\{\{[^}]*\}\}/g, '').replace(/<[^>]*>/g, '').replace(/'{2,}/g, '').trim();
export function parseRoster(text) {
  const out = [], seen = new Set();
  for (const line of text.split('\n')) {
    if (!/\{\{\s*(?:Fs player|football squad player|nat fs g player|nat fs player)/i.test(line)) continue;
    const pos = (line.match(/\|\s*pos\s*=\s*([A-Za-z]+)/) || [])[1]?.toUpperCase();
    // name may contain a piped wikilink: [[Real Title (footballer)|Shown Name]]
    const nm = (line.match(/\|\s*name\s*=\s*((?:\[\[[^\]]*\]\]|\{\{[^}]*\}\}|[^|}\[])+)/) || [])[1];
    if (!pos || !nm || !['GK', 'DF', 'MF', 'FW'].includes(pos)) continue;
    const name = clean(nm.replace(/\{\{\s*sortname\s*\|([^|}]*)\|([^|}]*)[^}]*\}\}/gi, '$1 $2')); if (!name || /^\W|\d/.test(name) || seen.has(name)) continue;
    seen.add(name); out.push([name, pos]);
  }
  return out;
}
export const sane = (r) => { const c = (p) => r.filter((x) => x[1] === p).length;
  return r.length >= 16 && c('GK') >= 2 && c('GK') <= 12 && c('DF') >= 4 && c('MF') >= 4 && c('FW') >= 2; };
