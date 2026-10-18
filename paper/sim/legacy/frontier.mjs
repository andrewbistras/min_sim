// Balance-vs-entropy frontier: is (gamma, M) really one knob? Where does the exact Gibbs-dice family sit?
import * as L from './lib.mjs';
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const se = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length); };
const N_PART = 500, SEEDS = 6, T0 = 100, DF_POS = (L.NV - 1) * (L.K - 1);

function track(st, acc) {
  if (st.n >= T0 && st.n % 10 === 0) { const m = L.metrics(st); acc.sdO.push(m.sdOverall); acc.gpos.push(2 * L.K * st.n * m.jsdPos / DF_POS); }
}
function runUniform(seed) {
  const rand = L.mulberry32(seed), st = L.newState(), acc = { sdO: [], gpos: [] };
  for (let t = 0; t < N_PART; t++) { L.apply(st, L.uniformDeck(rand)); track(st, acc); }
  return { kl: 0, sdO: mean(acc.sdO), gpos: mean(acc.gpos) };
}
function runPool(seed, opts) {
  const rand = L.mulberry32(seed), st = L.newState(), acc = { sdO: [], gpos: [] }, kl = [], proxy = [];
  for (let t = 0; t < N_PART; t++) {
    const { deck, hpool } = L.poolPolicy(st, rand, opts);
    if (t >= T0) proxy.push(Math.log(opts.M) - hpool);
    if (t >= T0 && t % 25 === 0) kl.push(L.poolKL(st, rand, opts, 150, 200));
    L.apply(st, deck); track(st, acc);
  }
  return { kl: mean(kl), proxy: mean(proxy), sdO: mean(acc.sdO), gpos: mean(acc.gpos) };
}
function runDice(seed, opts) {
  const rand = L.mulberry32(seed), st = L.newState(), acc = { sdO: [], gpos: [] }, kl = [];
  for (let t = 0; t < N_PART; t++) {
    const dice = L.makeDice(st, opts);
    const deck = L.diceSample(dice, rand);
    if (t >= T0 && t % 5 === 0) kl.push(L.diceKL(dice, rand));
    L.apply(st, deck); track(st, acc);
  }
  return { kl: mean(kl), sdO: mean(acc.sdO), gpos: mean(acc.gpos) };
}
function summarize(label, runs) {
  const f = k => `${mean(runs.map(r => r[k])).toFixed(3)}±${se(runs.map(r => r[k])).toFixed(3)}`;
  const kl = mean(runs.map(r => r.kl));
  const proxy = runs[0].proxy !== undefined ? `  [ln M − H_pool = ${mean(runs.map(r => r.proxy)).toFixed(3)}]` : '';
  console.log(`${label.padEnd(34)} KL ${f('kl')} nats (${(kl / Math.LN2).toFixed(2)} bits)   sd_overall ${f('sdO')}   G_pos/df ${f('gpos')}${proxy}`);
}
const seeds = Array.from({ length: SEEDS }, (_, i) => 101 + i);
console.log(`n=${N_PART} participants, time-averaged over n∈[${T0},${N_PART}], ${SEEDS} seeds. G_pos/df≈1 means order balance no better than random.\n`);
summarize('uniform (complete randomization)', seeds.map(runUniform));
console.log('-- repo pool sampler, lambda=0.075: sweep gamma at M=100 --');
for (const gamma of [0.05, 0.1, 0.2, 0.4, 1.0]) summarize(`pool M=100 gamma=${gamma}`, seeds.map(s => runPool(s, { M: 100, gamma, lambda: 0.075, phi: 0 })));
console.log('-- repo pool sampler, lambda=0.075: sweep M at gamma=0.2 --');
for (const M of [10, 30, 300, 1000]) summarize(`pool M=${M} gamma=0.2`, seeds.map(s => runPool(s, { M, gamma: 0.2, lambda: 0.075, phi: 0 })));
console.log('-- exact Gibbs dice, same cost as repo (overall + 0.075 position): sweep beta --');
for (const beta of [0.1, 0.2, 0.4, 0.8, 1.6, 3.2]) summarize(`dice beta=${beta}`, seeds.map(s => runDice(s, { beta, lambda: 0.075, wo: 1 })));
console.log('-- exact Gibbs dice, lambda-free joint cost (balance the 320 vignette×position cells only) --');
for (const beta of [0.2, 0.4, 0.8, 1.6, 3.2, 6.4]) summarize(`dice-joint beta=${beta}`, seeds.map(s => runDice(s, { beta, lambda: 1, wo: 0 })));
