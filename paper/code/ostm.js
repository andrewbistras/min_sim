/**
 * Online Stochastic Trial Minimisation (OSTM) — reference implementation.
 *
 * Each arriving participant receives a deck: k stimuli that are pairwise compatible. The deck is drawn with
 * probability proportional to exp(-beta * [sum of its stimuli's exposure counts]), i.e. by rolling one weighted
 * die k times and keeping the roll only if the faces form an admissible deck. The die's weights are recomputed
 * from the ledger for every participant ("reweighing the dice"), and beta is solved so that the allocation gives
 * up exactly `budgetBits` bits of entropy relative to complete randomization over admissible decks (or fewer,
 * when ties leave nothing more to gain). The roll order is a uniformly random presentation order.
 *
 * budgetBits = 0 gives complete randomization; budgetBits = Infinity gives deterministic minimisation with
 * random tie-breaking.
 */

/** Conflict matrix for a 2^factors full factorial: stimuli conflict when they differ in fewer than minDistance factors. */
export function hypercubeConflicts(factors, minDistance = 2) {
  const m = 1 << factors, conflict = new Uint8Array(m * m);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let x = i ^ j, d = 0;
      while (x) { d += x & 1; x >>= 1; }
      if (d < minDistance) conflict[i * m + j] = 1;
    }
  }
  return { m, conflict };
}

/** Every admissible k-set (an independent set of the conflict graph), as a flat typed array of stimulus ids. */
export function enumerateDecks(m, k, conflict) {
  const neighbours = Array.from({ length: m }, (_, v) => {
    const out = [];
    for (let u = 0; u < m; u++) if (conflict[v * m + u]) out.push(u);
    return out;
  });
  const Arr = m <= 256 ? Uint8Array : Uint16Array;
  let cap = 1 << 16, buf = new Arr(cap * k), count = 0;
  const chosen = new Array(k), blocked = new Int32Array(m);
  const rec = (start, depth) => {
    if (depth === k) {
      if (count === cap) { cap *= 2; const grown = new Arr(cap * k); grown.set(buf); buf = grown; }
      for (let p = 0; p < k; p++) buf[count * k + p] = chosen[p];
      count++;
      return;
    }
    for (let v = start; v <= m - (k - depth); v++) {
      if (blocked[v]) continue;
      chosen[depth] = v;
      for (const u of neighbours[v]) blocked[u]++;
      rec(v + 1, depth + 1);
      for (const u of neighbours[v]) blocked[u]--;
    }
  };
  rec(0, 0);
  return { decks: buf.slice(0, count * k), count };
}

/** A design: m stimuli, deck size k, conflict matrix, and the list of admissible decks. */
export function createDesign({ m, k, conflict }) {
  const { decks, count } = enumerateDecks(m, k, conflict);
  return { m, k, conflict, decks, count, logCount: Math.log(count) };
}

export function admissible(design, deck) {
  const { m, k, conflict } = design;
  for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) if (conflict[deck[a] * m + deck[b]]) return false;
  return true;
}

/** Histogram of deck energies E(S) = Σ_{i∈S} d_i over all admissible decks, for integer offsets d (counts − min). */
export function energyHistogram(design, d) {
  const { decks, count, k } = design;
  let maxE = 0;
  const sorted = Array.from(d).sort((a, b) => b - a);
  for (let p = 0; p < k; p++) maxE += sorted[p];
  const hist = new Float64Array(maxE + 1);
  if (k === 5) {
    for (let s = 0, o = 0; s < count; s++, o += 5) hist[d[decks[o]] + d[decks[o + 1]] + d[decks[o + 2]] + d[decks[o + 3]] + d[decks[o + 4]]]++;
  } else {
    for (let s = 0, o = 0; s < count; s++, o += k) { let e = 0; for (let p = 0; p < k; p++) e += d[decks[o + p]]; hist[e]++; }
  }
  let e0 = 0;
  while (hist[e0] === 0) e0++;
  return { hist, e0 };
}

/** Information spent, KL(π_β ‖ uniform over admissible decks), in nats, from the energy histogram. */
export function klNats({ hist, e0 }, beta, logCount) {
  if (beta === 0) return 0;
  if (!Number.isFinite(beta)) return logCount - Math.log(hist[e0]);
  let Z = 0, M1 = 0;
  for (let e = e0; e < hist.length; e++) {
    if (hist[e] === 0) continue;
    const w = hist[e] * Math.exp(-beta * (e - e0));
    Z += w; M1 += w * (e - e0);
  }
  return logCount - (Math.log(Z) + beta * M1 / Z);
}

/** Smallest temperature (largest beta) whose allocation spends at most kappa nats; Infinity when ties cap the spend. */
export function solveBeta(h, logCount, kappaNats) {
  if (!(kappaNats > 0)) return 0;
  if (kappaNats >= klNats(h, Infinity, logCount) - 1e-12) return Infinity;
  let lo = 0, hi = 1;
  while (klNats(h, hi, logCount) < kappaNats) { lo = hi; hi *= 2; }
  for (let it = 0; it < 60; it++) {
    const mid = 0.5 * (lo + hi);
    if (klNats(h, mid, logCount) < kappaNats) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Roll one die with face weights ∝ exp(−β d_i) k times; keep the roll when it is admissible. Null after maxRolls failures. */
export function rollDice(design, d, beta, rng, maxRolls = 2000) {
  const { m, k } = design;
  const cum = new Float64Array(m);
  let acc = 0;
  for (let i = 0; i < m; i++) { acc += Math.exp(-beta * d[i]); cum[i] = acc; }
  const deck = new Array(k);
  for (let r = 0; r < maxRolls; r++) {
    for (let p = 0; p < k; p++) {
      const u = rng() * acc;
      let lo = 0, hi = m - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] <= u) lo = mid + 1; else hi = mid; }
      deck[p] = lo;
    }
    if (admissible(design, deck)) return deck;
  }
  return null;
}

/** Exact draw from π_β using the deck list (used when β = ∞ or the dice keep failing): level first, then a deck within it. */
export function sampleFromList(design, d, { hist, e0 }, beta, rng) {
  const { decks, count, k } = design;
  let target;
  if (!Number.isFinite(beta)) target = e0;
  else {
    let Z = 0;
    for (let e = e0; e < hist.length; e++) Z += hist[e] * Math.exp(-beta * (e - e0));
    let u = rng() * Z;
    for (target = e0; target < hist.length - 1; target++) { u -= hist[target] * Math.exp(-beta * (target - e0)); if (u < 0) break; }
    while (hist[target] === 0) target--;
  }
  const r = Math.floor(rng() * hist[target]);
  for (let s = 0, o = 0, seen = 0; s < count; s++, o += k) {
    let e = 0;
    for (let p = 0; p < k; p++) e += d[decks[o + p]];
    if (e === target && seen++ === r) {
      const deck = Array.from(decks.subarray(o, o + k));
      for (let i = k - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      return deck;
    }
  }
  throw new Error('sampleFromList: level not found');
}

/**
 * The allocator. `counts[i]` = how often stimulus i has been allocated so far (the ledger).
 * prepare(counts) reweighs the die and solves the temperature once; draw() then samples decks from that state
 * (several draws model participants who arrive before the ledger is updated). allocate(counts) = one draw.
 * Each draw returns the deck in presentation order and log P(this set of stimuli) for the analysis log.
 * Pass `fixedBeta` instead of `budgetBits` to hold the temperature constant.
 */
export function createAllocator(design, { budgetBits = 1, fixedBeta = null, rng = Math.random, maxRolls = 2000 } = {}) {
  const kappa = budgetBits * Math.LN2;
  const prepare = counts => {
    let cmin = Infinity;
    for (const c of counts) if (c < cmin) cmin = c;
    const d = Int32Array.from(counts, c => c - cmin);
    const h = energyHistogram(design, d);
    const beta = fixedBeta !== null ? fixedBeta : solveBeta(h, design.logCount, kappa);
    let logZ = 0;
    if (Number.isFinite(beta)) {
      let Z = 0;
      for (let x = h.e0; x < h.hist.length; x++) Z += h.hist[x] * Math.exp(-beta * (x - h.e0));
      logZ = Math.log(Z);
    }
    return {
      beta,
      bitsSpent: klNats(h, beta, design.logCount) / Math.LN2,
      draw() {
        let deck = Number.isFinite(beta) ? rollDice(design, d, beta, rng, maxRolls) : null;
        if (!deck) deck = sampleFromList(design, d, h, beta, rng);
        let e = 0;
        for (const i of deck) e += d[i];
        const logProbSet = Number.isFinite(beta) ? -beta * (e - h.e0) - logZ : -Math.log(h.hist[h.e0]);
        return { deck, beta, bitsSpent: this.bitsSpent, logProbSet };
      },
    };
  };
  return { prepare, allocate: counts => prepare(counts).draw() };
}
