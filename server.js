// GOAL NATION 2026 server: serves the game and relays online-match messages between the two players in a room.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { WebSocketServer } = require('ws');
let PORT = +process.env.PORT || 3100; const ROOT = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (p === '/info') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ addresses: lanAddresses(), port: PORT })); }
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase(), big = ext === '.glb' || ext === '.mp3';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': big ? 'public, max-age=86400' : 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

const rooms = new Map(); let nextId = 1;
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });
const roster = r => ({ t: 'players', host: r.host, players: [...r.members.values()].map(c => ({ id: c.id, name: c.name, veh: c.veh, color: c.color })) });
const cast = (r, msg, except) => { const s = JSON.stringify(msg); for (const c of r.members.values()) if (c !== except && c.ws.readyState === 1) c.ws.send(s); };
function leave(c) {
  const r = c.room; if (!r) return; c.room = null; r.members.delete(c.id);
  if (!r.members.size) return rooms.delete(r.code);
  const hostLeft = r.host === c.id; if (hostLeft) r.host = r.members.keys().next().value;
  cast(r, { t: 'left', id: c.id, hostLeft }); cast(r, roster(r));
}
wss.on('connection', ws => {
  const c = { id: nextId++, ws, room: null, name: 'Racer', veh: null, color: 0 };
  ws.on('message', data => {
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'create' || m.t === 'join') {
      if (c.room) leave(c);
      c.name = String(m.name || 'Racer').slice(0, 14); c.veh = m.veh; c.color = m.color | 0;
      let r;
      if (m.t === 'create') { let code; do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (rooms.has(code)); r = { code, host: c.id, members: new Map(), racing: false }; rooms.set(code, r); }
      else { r = rooms.get(String(m.room)); if (!r) return ws.send(JSON.stringify({ t: 'error', msg: 'Room not found. Check the code.' })); if (r.members.size >= 2) return ws.send(JSON.stringify({ t: 'error', msg: 'Room is full (one opponent per match).' })); }
      r.members.set(c.id, c); c.room = r;
      ws.send(JSON.stringify({ t: 'joined', id: c.id, room: r.code, host: r.host, players: roster(r).players })); cast(r, roster(r));
      return;
    }
    const r = c.room; if (!r) return;
    if (m.t === 'me') { if (m.veh) c.veh = m.veh; if (m.color != null) c.color = m.color | 0; if (m.name) c.name = String(m.name).slice(0, 14); return cast(r, roster(r)); }
    if (m.t === 'leave') return leave(c);
    m.from = c.id; cast(r, m, c); // everything else is relayed to the rest of the room
  });
  ws.on('close', () => leave(c)); ws.on('error', () => {});
});
function lanAddresses() { const out = []; for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address); return out; }
// Starts listening; if the port is busy the next ones are tried. Resolves with the port in use.
function start(port = PORT, tries = 20) {
  return new Promise((resolve, reject) => {
    const attempt = n => {
      server.once('error', e => (e.code === 'EADDRINUSE' && n < tries) ? attempt(n + 1) : reject(e));
      server.listen(port + n, '0.0.0.0', () => { server.removeAllListeners('error'); PORT = port + n; resolve(PORT); });
    };
    attempt(0);
  });
}
module.exports = { start };
if (require.main === module) start().then(port => {
  console.log('\n  GOAL NATION 2026 is running!\n');
  console.log('  Play on this PC:        http://localhost:' + port);
  for (const a of lanAddresses()) console.log('  Friends on your Wi-Fi:  http://' + a + ':' + port);
  console.log('\n  Keep this window open while you play. Close it to stop the game.\n');
});
