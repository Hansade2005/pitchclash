// Publishes a folder to here.now (anonymous): create -> upload -> finalize.
import fs from 'node:fs'; import path from 'node:path';
const root = process.argv[2], H = { 'X-HereNow-Client': 'claude-code/direct-api', 'content-type': 'application/json' };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.exe': 'application/octet-stream', '.svg': 'image/svg+xml', '.json': 'application/json' };
const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(root);
const list = files.map(f => ({ path: path.relative(root, f).split(path.sep).join('/'), size: fs.statSync(f).size, contentType: types[path.extname(f).toLowerCase()] || 'application/octet-stream' }));
let r = await fetch('https://here.now/api/v1/publish', { method: 'POST', headers: H, body: JSON.stringify({ files: list }) }); let j = await r.json();
if (!r.ok) { console.log('CREATE FAILED', r.status, JSON.stringify(j).slice(0, 1500)); process.exit(1); }
console.log('created', JSON.stringify({ ...j, upload: { ...j.upload, uploads: (j.upload?.uploads || []).length } }).slice(0, 900));
fs.writeFileSync(path.join(path.dirname(root), 'herenow.json'), JSON.stringify(j, null, 1));
for (const u of j.upload.uploads) {
  const body = fs.readFileSync(path.join(root, u.path));
  const pr = await fetch(u.url, { method: u.method || 'PUT', headers: u.headers || { 'Content-Type': list.find(l => l.path === u.path).contentType }, body });
  if (!pr.ok) { console.log('UPLOAD FAILED', u.path, pr.status, (await pr.text()).slice(0, 300)); process.exit(1); }
}
r = await fetch(j.upload.finalizeUrl || `https://here.now/api/v1/publish/${j.slug}/finalize`, { method: 'POST', headers: H, body: JSON.stringify({ versionId: j.upload.versionId }) });
console.log('finalize', r.status, JSON.stringify(await r.json()).slice(0, 1200));
