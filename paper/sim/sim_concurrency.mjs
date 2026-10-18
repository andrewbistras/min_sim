// Study 2: participants who arrive together see the same ledger (a feedback delay). Usage: node sim_concurrency.mjs <policy-key>
import fs from 'fs';
import { hypercubeConflicts, createDesign, createAllocator } from '../code/ostm.js';
import { mulberry32, newLedger, record, ledgerMetrics, mean } from './common.mjs';

const POLICIES = {
  cr: { label: 'Complete randomization', budgetBits: 0 },
  'k0.5': { label: '0.5 bits', budgetBits: 0.5 },
  k1: { label: '1 bit', budgetBits: 1 },
  k2: { label: '2 bits', budgetBits: 2 },
  k4: { label: '4 bits', budgetBits: 4 },
  dm: { label: 'Deterministic minimisation', budgetBits: Infinity },
};
const BATCHES = [1, 4, 16, 64], N = 960, SEEDS = 6, T0 = 100;

const key = process.argv[2], pol = POLICIES[key];
const design = createDesign({ ...hypercubeConflicts(6, 2), k: 5 });
const out = [];
for (const b of BATCHES) {
  const sds = [];
  for (let s = 0; s < SEEDS; s++) {
    const rng = mulberry32(501 + s), alloc = createAllocator(design, { budgetBits: pol.budgetBits, rng });
    const L = newLedger(64, 5), trace = [];
    while (L.n < N) {
      const prep = alloc.prepare(L.C), decks = [];
      for (let j = 0; j < b; j++) decks.push(prep.draw().deck);
      for (const d of decks) { record(L, d); if (L.n >= T0 && L.n % 10 === 0) trace.push(ledgerMetrics(L).sd); }
    }
    sds.push(mean(trace));
  }
  out.push({ batch: b, meanSd: mean(sds), sds });
  process.stderr.write(`${key} batch ${b}: sd ${mean(sds).toFixed(3)}\n`);
}
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync(`results/concurrency_${key}.json`, JSON.stringify({ policy: { key, ...pol }, N, SEEDS, out }, null, 1));
