// Wallets for the virtual sportsbook + bridge to the Master League budget. PLAY COINS ONLY.
import { makeMatchday, newSlip, slipSummary, settleBet, resolveGame, MIN_STAKE, MAX_STAKE, MAX_BETTORS, START_COINS } from './betting.js';

const KEY = 'pc_bank_v1';
export const COINS_PER_MILLION = 100;           // 100 coins fund 1M of club budget in Master League
let data = null;
const mkBettor = (name, i) => ({ id: 'b' + Date.now().toString(36) + i, name, coins: START_COINS, slip: newSlip(), stats: { placed: 0, won: 0, lost: 0, staked: 0, returned: 0, best: 0 }, topups: 0 });
function fresh() { return { v: 1, bettors: [mkBettor('Player 1', 0)], matchdayNo: 1, matchday: null, bets: [], history: [] }; }

export const Bank = {
  load() { try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); data = d && d.bettors && d.bettors.length ? d : fresh(); } catch (e) { data = fresh(); } return data; },
  save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} },
  get d() { return data || this.load(); },
  get bettors() { return this.d.bettors; },
  bettor(id) { return this.d.bettors.find(b => b.id === id); },
  add(name) { if (this.d.bettors.length >= MAX_BETTORS) return null; const b = mkBettor(name || 'Player ' + (this.d.bettors.length + 1), this.d.bettors.length); this.d.bettors.push(b); this.save(); return b; },
  remove(id) { if (this.d.bettors.length <= 1) return false; this.d.bettors = this.d.bettors.filter(b => b.id !== id); this.d.bets = this.d.bets.filter(b => b.bettor !== id || b.status === 'open'); this.save(); return true; },
  rename(id, name) { const b = this.bettor(id); if (b) { b.name = (name || b.name).slice(0, 14); this.save(); } },
  reset() { data = fresh(); this.save(); },
  matchday() { const d = this.d; if (!d.matchday) { d.matchday = makeMatchday(d.matchdayNo, Math.floor(Math.random() * 2 ** 31)); this.save(); } return d.matchday; },
  openBets(id) { return this.d.bets.filter(b => b.status === 'open' && (!id || b.bettor === id)); },
  canPlace(id) {
    const b = this.bettor(id), s = slipSummary(b.slip);
    if (!b.slip.sels.length) return 'Pick at least one selection';
    if (b.slip.stake < MIN_STAKE) return `Minimum stake is ${MIN_STAKE} coins`;
    if (b.slip.stake > MAX_STAKE) return `Maximum stake is ${MAX_STAKE} coins`;
    if (s.staked > b.coins) return 'Not enough coins for that stake';
    if (b.slip.mode === 'acca' && b.slip.sels.length > 1 && b.slip.sels.length < 2) return 'Accumulator needs 2+ selections';
    return null;
  },
  place(id) {
    const err = this.canPlace(id); if (err) return { ok: false, error: err };
    const b = this.bettor(id), sl = b.slip, md = this.matchday();
    const single = sl.mode === 'singles' || sl.sels.length === 1;
    const mk = (sels, stake) => ({ id: 'bet' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), bettor: id, matchday: md.number, mode: single ? 'single' : 'acca', sels: sels.map(s => ({ ...s })), stake, status: 'open', ret: 0 });
    const placed = single ? sl.sels.map(s => mk([s], sl.stake)) : [mk(sl.sels, sl.stake)];
    for (const p of placed) { b.coins -= p.stake; b.stats.placed++; b.stats.staked += p.stake; this.d.bets.push(p); }
    b.slip = { ...newSlip(), mode: sl.mode, stake: sl.stake };
    this.save(); return { ok: true, placed };
  },
  // free top-up for a broke punter (never stuck): only when nearly out of coins and nothing is riding
  canTopUp(id) { const b = this.bettor(id); return b.coins < 50 && !this.openBets(id).length; },
  topUp(id) { if (!this.canTopUp(id)) return false; const b = this.bettor(id); b.coins += 300; b.topups++; this.save(); return true; },
  // run every game of the matchday, settle every open bet, pay out, move on to the next matchday
  settle(results) {
    const d = this.d, summary = [];
    for (const b of d.bettors) {
      const mine = d.bets.filter(x => x.bettor === b.id && x.status === 'open'); if (!mine.length) continue;
      let net = 0;
      for (const bet of mine) {
        const r = settleBet(bet, results); bet.status = r.status; bet.ret = r.ret;
        if (r.status === 'won') { b.coins += r.ret; b.stats.won++; b.stats.returned += r.ret; b.stats.best = Math.max(b.stats.best, r.ret); net += r.ret - bet.stake; }
        else { b.stats.lost++; net -= bet.stake; }
      }
      summary.push({ bettor: b, bets: mine, net });
    }
    d.history.unshift({ number: d.matchdayNo, results, at: Date.now() }); d.history = d.history.slice(0, 20);
    d.bets = d.bets.filter(x => x.status === 'open').concat(d.bets.filter(x => x.status !== 'open').slice(-60));
    d.matchdayNo++; d.matchday = null; this.save();
    return summary;
  },
  fundClub(id, coins) {
    const b = this.bettor(id), c = Math.floor(coins / COINS_PER_MILLION) * COINS_PER_MILLION;
    if (!b || c < COINS_PER_MILLION || c > b.coins) return 0;
    b.coins -= c; this.save(); return c / COINS_PER_MILLION;
  },
  resolveAll() { const md = this.matchday(), res = {}; for (const g of md.games) res[g.id] = resolveGame(g); return res; },
};
