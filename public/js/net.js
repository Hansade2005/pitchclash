// Thin WebSocket client for online / LAN rooms. The server only relays; the room host runs the race.
export class Net {
  constructor() { this.h = {}; this.ws = null; this.id = null; this.room = null; this.hostId = null; this.players = []; }
  get isHost() { return this.id != null && this.id === this.hostId; }
  on(t, f) { (this.h[t] || (this.h[t] = [])).push(f); }
  off(t, f) { if (this.h[t]) this.h[t] = this.h[t].filter(x => x !== f); }
  emit(t, m) { for (const f of this.h[t] || []) f(m); }
  connect() {
    return new Promise((res, rej) => {
      if (this.ws && this.ws.readyState === 1) return res();
      const ws = this.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
      ws.onopen = () => res(); ws.onerror = () => rej(new Error('Cannot reach the game server'));
      ws.onclose = () => { const was = this.room; this.room = null; this.ws = null; if (was) this.emit('closed', {}); };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m.t === 'joined') { this.id = m.id; this.room = m.room; this.hostId = m.host; this.players = m.players; }
        else if (m.t === 'players') { this.players = m.players; this.hostId = m.host; }
        this.emit(m.t, m);
      };
    });
  }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  leave() { if (this.ws) { this.room = null; try { this.ws.close(); } catch (e) {} this.ws = null; } }
}
