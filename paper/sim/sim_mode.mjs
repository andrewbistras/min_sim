// Study 4: a per-participant entropy budget versus a fixed temperature that spends the same bits on average.
import fs from 'fs';
import { hypercubeConflicts, createDesign, createAllocator } from '../code/ostm.js';
import { mulberry32, newLedger, record, ledgerMetrics, mean, quantile } from './common.mjs';

const N = 600, SEEDS = 6, T0 = 100;
const design = createDesign({ ...hypercubeConflicts(6, 2), k: 5 });
function run(opts, seed) {
  const rng = mulberry32(seed), alloc = createAllocator(design, { ...opts, rng });
  const L = newLedger(64, 5), sds = [], bits = [], betas = [];
  for (let t = 0; t < N; t++) {
    const prep = alloc.prepare(L.C);
    if (t >= T0) { bits.push(prep.bitsSpent); if (Number.isFinite(prep.beta)) betas.push(prep.beta); }
    record(L, prep.draw().deck);
    if (L.n >= T0 && L.n % 10 === 0) sds.push(ledgerMetrics(L).sd);
  }
  return { sd: mean(sds), bits: mean(bits), bitsP10: quantile(bits, 0.1), bitsP90: quantile(bits, 0.9), betaP10: quantile(betas, 0.1), betaP90: quantile(betas, 0.9) };
}
const rows = [];
for (const beta of [0.3, 0.6, 1.2]) {
  const fixed = Array.from({ length: SEEDS }, (_, s) => run({ fixedBeta: beta }, 701 + s));
  const kappa = mean(fixed.map(r => r.bits));
  const budget = Array.from({ length: SEEDS }, (_, s) => run({ budgetBits: kappa }, 801 + s));
  const row = { beta, kappa, fixed: { sd: mean(fixed.map(r => r.sd)), bitsP10: mean(fixed.map(r => r.bitsP10)), bitsP90: mean(fixed.map(r => r.bitsP90)) },
    budget: { sd: mean(budget.map(r => r.sd)), betaP10: mean(budget.map(r => r.betaP10)), betaP90: mean(budget.map(r => r.betaP90)) },
    fixedSds: fixed.map(r => r.sd), budgetSds: budget.map(r => r.sd) };
  rows.push(row);
  process.stderr.write(`beta ${beta}: ${kappa.toFixed(3)} bits; fixed sd ${row.fixed.sd.toFixed(3)} vs budget sd ${row.budget.sd.toFixed(3)}\n`);
}
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/mode.json', JSON.stringify({ N, SEEDS, rows }, null, 1));
