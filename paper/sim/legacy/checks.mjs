// (a) replica vs the repo's own modules, (b) JSD identities, (c) what PHI actually does, (d) KL accounting.
import * as L from './lib.mjs';
import minOld from '../../../min_old.js';
import minNew from '../../../min_new.js';

const ids = Array.from({ length: L.NV }, (_, v) => v.toString(2).padStart(6, '0'));
const idx = Object.fromEntries(ids.map((s, v) => [s, v]));
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const fmt = (a, d = 3) => `${mean(a).toFixed(d)} ± ${(sd(a) / Math.sqrt(a.length)).toFixed(d)}`;

// ---------- (a) replica fidelity ----------
async function runRepo(fn, n) {
  const st = L.newState();
  const gd = { overall_counts: Object.fromEntries(ids.map(s => [s, 0])), position_counts: Object.fromEntries(ids.map(s => [s, [0, 0, 0, 0, 0]])) };
  for (let t = 0; t < n; t++) {
    const out = await fn(gd, L.K);
    const deck = out.slice(0, L.K).map(s => idx[s]);
    deck.forEach((v, p) => { gd.overall_counts[ids[v]]++; gd.position_counts[ids[v]][p]++; });
    L.apply(st, deck);
  }
  return L.metrics(st);
}
function runReplica(n, seed, opts) {
  const rand = L.mulberry32(seed), st = L.newState();
  for (let t = 0; t < n; t++) L.apply(st, L.poolPolicy(st, rand, opts).deck);
  return L.metrics(st);
}
console.log('=== (a) replica vs repo modules, n=320 participants, 12 reps each ===');
for (const [name, fn, phi] of [['min_old.js', minOld, 0], ['min_new.js', minNew, 3]]) {
  const R = [], Q = [];
  for (let r = 0; r < 12; r++) { R.push(await runRepo(fn, 320)); Q.push(runReplica(320, 1000 + r, { phi })); }
  for (const key of ['sdOverall', 'range', 'sdPos', 'extOffset']) {
    console.log(`${name.padEnd(11)} ${key.padEnd(10)} repo ${fmt(R.map(m => m[key]))}   replica ${fmt(Q.map(m => m[key]))}`);
  }
}
{ const U = []; for (let r = 0; r < 12; r++) { const rand = L.mulberry32(77 + r), st = L.newState(); for (let t = 0; t < 320; t++) L.apply(st, L.uniformDeck(rand)); U.push(L.metrics(st)); }
  console.log(`pure random  sdOverall  ${fmt(U.map(m => m.sdOverall))}   range ${fmt(U.map(m => m.range))}   sdPos ${fmt(U.map(m => m.sdPos))}`); }

// ---------- (b) JSD identities ----------
console.log('\n=== (b) Jensen–Shannon identities at a mid-run ledger (n=200, repo replica) ===');
const rand = L.mulberry32(42), st = L.newState();
for (let t = 0; t < 200; t++) L.apply(st, L.poolPolicy(st, rand, {}).deck);
const N = L.K * st.n, w = N / (N + L.K);
const H = q => { let h = 0; for (const x of q) if (x > 0) h -= x * Math.log(x); return h; };
const Pold = Array.from(st.C, c => c / N), Hold = H(Pold);
const scores = [], jsds = [];
for (let r = 0; r < 20000; r++) {
  const d = L.uniformDeck(rand);
  scores.push(L.repoScore(st, d, 0, 0));                 // overall-only repo score
  const Pn = Array.from(st.C, c => c); d.forEach(v => Pn[v] += 1);
  const Hn = H(Pn.map(c => c / (N + L.K)));
  jsds.push(Hn - w * Hold - (1 - w) * Math.log(L.K));     // weighted JSD(ledger, deck)
}
const rank = a => { const o = a.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); let i = 0;
  while (i < o.length) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; const avg = (i + j) / 2; for (let k = i; k <= j; k++) r[o[k][1]] = avg; i = j + 1; } return r; };
const corr = (x, y) => { const mx = mean(x), my = mean(y); let a = 0, b = 0, c = 0; for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; } return a / Math.sqrt(b * c); };
console.log(`repo overall score vs exact JSD(ledger, deck): Pearson ${corr(scores, jsds).toFixed(5)}, Spearman ${corr(rank(scores), rank(jsds)).toFixed(5)}`);
// slope: score ≈ ((N+5)^2/32) * JSD + const ?
{ const mx = mean(jsds), my = mean(scores); let a = 0, b = 0; for (let i = 0; i < jsds.length; i++) { a += (jsds[i] - mx) * (scores[i] - my); b += (jsds[i] - mx) ** 2; }
  console.log(`fitted slope d(score)/d(JSD) = ${(a / b).toFixed(1)}   predicted (N+5)^2/32 = ${((N + L.K) ** 2 / 32).toFixed(1)}   [N = ${N}]`); }
// chain rule: KL(joint || uniform_320) = KL(overall || uniform_64) + JSD(5 position ledgers)
{ const m = L.metrics(st); const joint = Array.from(st.P, x => x / N);
  console.log(`KL(joint)=${(Math.log(320) - H(joint)).toFixed(6)}  KL(overall)+JSD(positions)=${(m.klOverall + m.jsdPos).toFixed(6)}  [KL(overall)=${m.klOverall.toFixed(6)}, JSD(pos)=I(V;Pos)=${m.jsdPos.toFixed(6)}]`); }

// ---------- (c) what PHI does ----------
console.log('\n=== (c) min_new PHI=3 bonus: excess count of the 14 "extreme" vignettes ===');
for (const n of [320, 1000, 3000]) {
  const off = []; for (let r = 0; r < 6; r++) off.push(runReplica(n, 500 + r, { phi: 3 }).extOffset);
  const T = L.K * n / L.NV;
  console.log(`n=${String(n).padStart(4)}  target/vignette ${T.toFixed(1).padStart(6)}  extremes excess ${fmt(off, 2)} counts  = ${(100 * mean(off) / T).toFixed(2)}% oversampling`);
}

// ---------- (d) KL accounting at the default settings ----------
console.log('\n=== (d) what the repo\'s "entropy" measures (M=100, gamma=0.2, lambda=0.075), sampled every 25 participants, n=500 ===');
{ const rand = L.mulberry32(9), st = L.newState(); const hp = [], kq = [], kg = [];
  for (let t = 0; t < 500; t++) {
    const { deck, hpool } = L.poolPolicy(st, rand, {});
    if (t >= 50 && t % 25 === 0) {
      hp.push(hpool);
      kq.push(L.poolKL(st, rand, {}, 300, 300));
      kg.push(L.diceKL(L.makeDice(st, { beta: 0.4, lambda: 0.075 }), rand, 20000));
    }
    L.apply(st, deck);
  }
  console.log(`mean repo entropy H_pool           = ${fmt(hp)} nats   (max ln 100 = ${Math.log(100).toFixed(3)})`);
  console.log(`ln M - H_pool                      = ${fmt(hp.map(h => Math.log(100) - h))} nats`);
  console.log(`true KL(allocation || uniform)     = ${fmt(kq)} nats   (pool mechanism, Monte Carlo)`);
  console.log(`KL of exact Gibbs dice at beta=2γ  = ${fmt(kg)} nats`);
  console.log(`allocation entropy retained        = ${(100 * (1 - mean(kq) / L.LOG_V)).toFixed(2)}% of log|V| = ${L.LOG_V.toFixed(3)} nats (${(L.LOG_V / Math.LN2).toFixed(2)} bits)`);
}
