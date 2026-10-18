import * as L from './lib.mjs';
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const se = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length); };
function run(seed, opts) {
  const rand = L.mulberry32(seed), st = L.newState(), sdO = [], gp = [], kl = [];
  for (let t = 0; t < 500; t++) {
    const dice = L.makeDice(st, opts); if (t >= 100 && t % 5 === 0) kl.push(L.diceKL(dice, rand));
    L.apply(st, L.diceSample(dice, rand));
    if (st.n >= 100 && st.n % 10 === 0) { const m = L.metrics(st); sdO.push(m.sdOverall); gp.push(2 * L.K * st.n * m.jsdPos / 252); }
  }
  return { kl: mean(kl), sdO: mean(sdO), gp: mean(gp) };
}
const seeds = [11, 12, 13, 14, 15, 16, 17, 18];
for (const beta of [0.2, 0.4, 0.8]) for (const lambda of [0.075, 0]) {
  const r = seeds.map(s => run(s, { beta, lambda, wo: 1 }));
  const f = k => `${mean(r.map(x => x[k])).toFixed(3)}±${se(r.map(x => x[k])).toFixed(3)}`;
  console.log(`beta=${beta} lambda=${String(lambda).padEnd(5)}  KL ${f('kl')} nats   sd_overall ${f('sdO')}   G_pos/df ${f('gp')}`);
}
