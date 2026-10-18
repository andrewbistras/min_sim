// Study 3: differential attrition. Participants whose deck holds more vignettes with factor A at level 1 drop out more
// often (15% to 45%). The allocator sees either every assignment or only completed sessions. Usage: node sim_attrition.mjs <policy-key>
import fs from 'fs';
import { hypercubeConflicts, createDesign, createAllocator } from '../code/ostm.js';
import { mulberry32, newLedger, record, ledgerMetrics, mean } from './common.mjs';

const POLICIES = {
  'cr': { label: 'Complete randomization', budgetBits: 0, ledger: 'assignments' },
  'k1-assign': { label: '1 bit, counts assignments', budgetBits: 1, ledger: 'assignments' },
  'k1-complete': { label: '1 bit, counts completions', budgetBits: 1, ledger: 'completions' },
  'dm-complete': { label: 'Deterministic, counts completions', budgetBits: Infinity, ledger: 'completions' },
};
const ARRIVALS = 1400, SEEDS = 8, CHECKPOINTS = [100, 200, 300, 400, 600, 800, 1000, 1200, 1400];
const FACTOR_A = 5;                                 // the leading bit of the 6-bit vignette code
const dropProb = deck => 0.15 + 0.06 * deck.filter(i => (i >> FACTOR_A) & 1).length;

const key = process.argv[2], pol = POLICIES[key];
const design = createDesign({ ...hypercubeConflicts(6, 2), k: 5 });
const runs = [];
for (let s = 0; s < SEEDS; s++) {
  const rng = mulberry32(901 + s), alloc = createAllocator(design, { budgetBits: pol.budgetBits, rng });
  const assigned = newLedger(64, 5), completed = newLedger(64, 5), traj = [];
  for (let a = 1; a <= ARRIVALS; a++) {
    const { deck } = alloc.allocate(pol.ledger === 'assignments' ? assigned.C : completed.C);
    record(assigned, deck);
    if (rng() >= dropProb(deck)) record(completed, deck);
    if (CHECKPOINTS.includes(a)) {
      const m = ledgerMetrics(completed);
      let onA = 0;
      for (let i = 0; i < 64; i++) if ((i >> FACTOR_A) & 1) onA += completed.C[i];
      traj.push({ arrivals: a, completers: completed.n, sd: m.sd, shareA: onA / (5 * completed.n) });
    }
  }
  runs.push({ seed: 901 + s, traj });
  process.stderr.write(`${key} seed ${s}: completers ${completed.n}, shareA ${traj.at(-1).shareA.toFixed(4)}, sd ${traj.at(-1).sd.toFixed(3)}\n`);
}
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync(`results/attrition_${key}.json`, JSON.stringify({ policy: { key, ...pol }, ARRIVALS, SEEDS, runs }, null, 1));
