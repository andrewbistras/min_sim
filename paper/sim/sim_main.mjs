// Study 1: balance and randomness as a function of the entropy budget. Usage: node sim_main.mjs <policy-key>
import fs from 'fs';
import { hypercubeConflicts, createDesign, createAllocator, energyHistogram } from '../code/ostm.js';
import { mulberry32, newLedger, record, ledgerMetrics, mean, quantile } from './common.mjs';

export const POLICIES = [
  { key: 'cr', label: 'Complete randomization', budgetBits: 0 },
  { key: 'k0.25', label: '0.25 bits', budgetBits: 0.25 },
  { key: 'k0.5', label: '0.5 bits', budgetBits: 0.5 },
  { key: 'k1', label: '1 bit', budgetBits: 1 },
  { key: 'k2', label: '2 bits', budgetBits: 2 },
  { key: 'k4', label: '4 bits', budgetBits: 4 },
  { key: 'k8', label: '8 bits', budgetBits: 8 },
  { key: 'dm', label: 'Deterministic minimisation', budgetBits: Infinity },
];
const N = 1000, SEEDS = 10, T0 = 100, CHECKPOINTS = [10, 20, 50, 100, 200, 500, 1000];

/** P(stimulus i is in the deck) under the allocation law at this ledger. */
function inclusion(design, counts, beta) {
  const { decks, count, k, m } = design;
  const cmin = Math.min(...counts), d = Int32Array.from(counts, c => c - cmin), h = energyHistogram(design, d);
  const w = Array.from(h.hist, (_, e) => (Number.isFinite(beta) ? Math.exp(-beta * (e - h.e0)) : e === h.e0 ? 1 : 0));
  let Z = 0;
  h.hist.forEach((n, e) => { Z += n * w[e]; });
  const inc = new Float64Array(m);
  for (let s = 0, o = 0; s < count; s++, o += k) {
    let e = 0;
    for (let p = 0; p < k; p++) e += d[decks[o + p]];
    if (w[e]) for (let p = 0; p < k; p++) inc[decks[o + p]] += w[e];
  }
  return Array.from(inc, x => x / Z);
}

if (process.argv[2]) {
  const pol = POLICIES.find(p => p.key === process.argv[2]);
  const design = createDesign({ ...hypercubeConflicts(6, 2), k: 5 });
  const runs = [];
  for (let s = 0; s < SEEDS; s++) {
    const rng = mulberry32(101 + s), alloc = createAllocator(design, { budgetBits: pol.budgetBits, rng });
    const L = newLedger(64, 5), traj = {}, sds = [], bits = [], betas = [];
    let ties = 0, tilt = null;
    for (let t = 0; t < N; t++) {
      const prep = alloc.prepare(L.C);
      if (L.n === 500) {
        const inc = inclusion(design, L.C, prep.beta);
        tilt = { max: Math.max(...inc) / (5 / 64), min: Math.min(...inc) / (5 / 64) };
      }
      if (t >= T0) { bits.push(prep.bitsSpent); if (Number.isFinite(prep.beta)) betas.push(prep.beta); else ties++; }
      record(L, prep.draw().deck);
      if (CHECKPOINTS.includes(L.n)) traj[L.n] = ledgerMetrics(L);
      if (L.n >= T0 && L.n % 10 === 0) sds.push(ledgerMetrics(L).sd);
    }
    runs.push({ seed: 101 + s, traj, meanSd: mean(sds), meanBits: mean(bits), tieShare: ties / (N - T0),
      beta10: betas.length ? quantile(betas, 0.1) : null, beta90: betas.length ? quantile(betas, 0.9) : null, tilt });
    process.stderr.write(`${pol.key} seed ${s} done: sd ${mean(sds).toFixed(3)}, bits ${mean(bits).toFixed(3)}\n`);
  }
  fs.mkdirSync('results', { recursive: true });
  fs.writeFileSync(`results/main_${pol.key}.json`, JSON.stringify({ policy: pol, N, SEEDS, runs }, null, 1));
}
