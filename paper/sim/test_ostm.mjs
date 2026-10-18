// Correctness and speed checks for paper/code/ostm.js.
import { hypercubeConflicts, createDesign, createAllocator, energyHistogram, klNats, solveBeta, rollDice, sampleFromList } from '../code/ostm.js';
import { mulberry32 } from './common.mjs';

let t = performance.now();
const design = createDesign({ ...hypercubeConflicts(6, 2), k: 5 });
console.log(`admissible 5-sets: ${design.count} (expect 2682432), built in ${(performance.now() - t).toFixed(0)} ms`);

// a mid-study ledger: run the allocator for 300 participants at 1 bit
const rng = mulberry32(1), alloc = createAllocator(design, { budgetBits: 1, rng });
const counts = new Array(64).fill(0);
for (let n = 0; n < 300; n++) for (const i of alloc.allocate(counts).deck) counts[i]++;
console.log('counts after 300 participants: min', Math.min(...counts), 'max', Math.max(...counts));

// speed
t = performance.now(); for (let r = 0; r < 50; r++) alloc.allocate(counts); console.log(`allocate(): ${((performance.now() - t) / 50).toFixed(1)} ms per participant`);

// exactness: dice vs list vs theory, energy-level frequencies at the solved beta
const cmin = Math.min(...counts), d = Int32Array.from(counts, c => c - cmin), h = energyHistogram(design, d);
const beta = solveBeta(h, design.logCount, Math.LN2);
console.log(`beta at 1 bit = ${beta.toFixed(4)}, KL check = ${(klNats(h, beta, design.logCount) / Math.LN2).toFixed(6)} bits`);
let Z = 0; for (let e = h.e0; e < h.hist.length; e++) Z += h.hist[e] * Math.exp(-beta * (e - h.e0));
const theory = Array.from(h.hist, (n, e) => (e < h.e0 ? 0 : n * Math.exp(-beta * (e - h.e0)) / Z));
const R = 20000, fDice = new Float64Array(h.hist.length), fList = new Float64Array(h.hist.length);
let rolls = 0;
for (let r = 0; r < R; r++) {
  const a = rollDice(design, d, beta, rng); let e = 0; for (const i of a) e += d[i]; fDice[e]++;
}
for (let r = 0; r < 2000; r++) { const b = sampleFromList(design, d, h, beta, rng); let e = 0; for (const i of b) e += d[i]; fList[e]++; }
console.log(' E   theory   dice(20k)  list(2k)');
for (let e = h.e0; e < h.hist.length; e++) if (theory[e] > 0.002) console.log(`${String(e).padStart(2)}   ${theory[e].toFixed(4)}   ${(fDice[e] / R).toFixed(4)}     ${(fList[e] / 2000).toFixed(4)}`);
// chi-square of dice frequencies against theory
let chi = 0, df = -1; for (let e = h.e0; e < h.hist.length; e++) if (theory[e] * R >= 5) { chi += (fDice[e] - theory[e] * R) ** 2 / (theory[e] * R); df++; }
console.log(`dice vs theory: chi2 = ${chi.toFixed(1)} on ${df} df`);
// order uniformity: position of the lowest-count member should be uniform over 5 positions
const posHits = new Array(5).fill(0);
for (let r = 0; r < 20000; r++) { const a = rollDice(design, d, beta, rng); let best = 0; for (let p = 1; p < 5; p++) if (a[p] < a[best]) best = p; posHits[best]++; }
console.log('position of the smallest id in the deck (should be uniform):', posHits.map(x => (x / 20000).toFixed(3)).join(' '));
