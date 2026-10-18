// Supporting numbers: runtime, the Jensen–Shannon identity, and the spectrum behind the stability constant.
import fs from 'fs';
import { hypercubeConflicts, createDesign, createAllocator } from '../code/ostm.js';
import { mulberry32, newLedger, record } from './common.mjs';

const design = createDesign({ ...hypercubeConflicts(6, 2), k: 5 });
const { m, k, decks, count } = design;
const out = { admissibleSets: count, orderedDecks: count * 120, bitsMax: Math.log2(count * 120) };

// runtime of one allocation at different points in a study
{
  const rng = mulberry32(3), alloc = createAllocator(design, { budgetBits: 1, rng }), L = newLedger(m, k);
  out.runtimeMs = {};
  for (const stop of [0, 100, 1000]) {
    while (L.n < stop) record(L, alloc.allocate(L.C).deck);
    const t = performance.now();
    for (let r = 0; r < 40; r++) alloc.allocate(L.C);
    out.runtimeMs[stop] = (performance.now() - t) / 40;
  }
}

// Jensen–Shannon identity at a mid-study ledger: quadratic score vs exact weighted JSD(ledger, deck)
{
  const rng = mulberry32(4), alloc = createAllocator(design, { budgetBits: 1, rng }), L = newLedger(m, k);
  while (L.n < 200) record(L, alloc.allocate(L.C).deck);
  const N = k * L.n, w = N / (N + k), H = q => q.reduce((h, x) => (x > 0 ? h - x * Math.log(x) : h), 0);
  const Hold = H(Array.from(L.C, c => c / N)), pts = [];
  for (let r = 0; r < 3000; r++) {
    const s = Math.floor(rng() * count), deck = Array.from(decks.subarray(s * k, s * k + k));
    const score = -2 * deck.reduce((a, i) => a + L.C[i], 0);
    const after = Array.from(L.C); deck.forEach(i => { after[i] += 1; });
    const jsd = H(after.map(c => c / (N + k))) - w * Hold - (1 - w) * Math.log(k);
    pts.push([score, jsd]);
  }
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  out.jsd = { participants: L.n, pearson: sxy / Math.sqrt(sxx * syy), slopeScorePerJsd: sxy / syy, predictedSlope: 2 * (N + k) ** 2 / m,
    points: pts.slice(0, 600) };
}

// Co-occurrence of two stimuli in a uniformly random admissible deck, by Hamming distance, and the eigenvalues of the
// covariance of the inclusion vector (Krawtchouk transform); the smallest nonzero one enters the stability bound.
{
  const pairs = new Float64Array(7);
  for (let s = 0, o = 0; s < count; s++, o += k) {
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
      let x = decks[o + a] ^ decks[o + b], d = 0;
      while (x) { d += x & 1; x >>= 1; }
      pairs[d]++;
    }
  }
  const choose = (n, r) => { if (r < 0 || r > n) return 0; let v = 1; for (let i = 0; i < r; i++) v = (v * (n - i)) / (i + 1); return v; };
  const pTogether = d => (d === 0 ? k / m : pairs[d] / count / ((m * choose(6, d)) / 2));
  const cov = d => pTogether(d) - (k / m) ** 2;
  // eigenvalue of the distance-d adjacency matrix of the 6-cube on the weight-w eigenspace = Krawtchouk K_d(w)
  const kraw = (d, w) => { let s = 0; for (let j = 0; j <= d; j++) s += (-1) ** j * choose(w, j) * choose(6 - w, d - j); return s; };
  out.coOccurrence = Array.from({ length: 7 }, (_, d) => ({ distance: d, pTogether: pTogether(d) }));
  out.eigenvalues = Array.from({ length: 7 }, (_, w) => ({ weight: w, value: Array.from({ length: 7 }, (_, d) => cov(d) * kraw(d, w)).reduce((a, b) => a + b, 0) }));
}
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/misc.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, jsd: { ...out.jsd, points: `${out.jsd.points.length} points` } }, null, 1));
