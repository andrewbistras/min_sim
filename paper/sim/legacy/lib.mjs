// Shared machinery for analyzing the vignette minimisation algorithm.
// Vignettes are integers 0..63 (6-bit strings); a deck is an ordered array of K=5 vignettes.
export const NV = 64, K = 5;
export const V_ORDERED = 321891840;                 // |V|, from enumerate.mjs
export const LOG_V = Math.log(V_ORDERED);           // 19.5897 nats
export const A1 = V_ORDERED / NV ** K;              // P(5 iid uniform dice form a valid deck) = 0.2998

export const popcount = x => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
export const conflict = new Uint8Array(NV * NV);    // 1 if Hamming distance < 2 (incl. self)
for (let v = 0; v < NV; v++) {
  conflict[v * NV + v] = 1;
  for (let b = 0; b < 6; b++) conflict[v * NV + (v ^ (1 << b))] = 1;
}
export const isExt = Array.from({ length: NV }, (_, v) => { const c = popcount(v); return (c <= 1 || c >= 5) ? 1 : 0; });

export function valid(d) {
  for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) if (conflict[d[i] * NV + d[j]]) return false;
  return true;
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function newState() { return { n: 0, C: new Float64Array(NV), P: new Float64Array(NV * K) }; }
export function apply(state, deck) {
  for (let p = 0; p < K; p++) { state.C[deck[p]] += 1; state.P[deck[p] * K + p] += 1; }
  state.n += 1;
}

// Uniform over valid decks (same law as the repo's generateCandidate()).
export function uniformDeck(rand) {
  const d = new Array(K);
  do { for (let p = 0; p < K; p++) d[p] = (rand() * NV) | 0; } while (!valid(d));
  return d;
}

// The repo's score, minus deck-independent constants: Σ_p [-2 C_i - 2λ P_ip + φ·ext_i].
export function repoScore(state, d, lambda, phi) {
  let s = 0;
  for (let p = 0; p < K; p++) { const i = d[p]; s += -2 * state.C[i] - 2 * lambda * state.P[i * K + p] + phi * isExt[i]; }
  return s;
}

// Faithful replica of min_old.js (phi=0) / min_new.js (phi=3): pool of M uniform valid decks, softmax(gamma*score).
export function poolPolicy(state, rand, { M = 100, gamma = 0.2, lambda = 0.075, phi = 0 } = {}) {
  const decks = new Array(M), sc = new Float64Array(M);
  let mx = -Infinity;
  for (let m = 0; m < M; m++) { decks[m] = uniformDeck(rand); sc[m] = gamma * repoScore(state, decks[m], lambda, phi); if (sc[m] > mx) mx = sc[m]; }
  let Z = 0; const w = new Float64Array(M);
  for (let m = 0; m < M; m++) { w[m] = Math.exp(sc[m] - mx); Z += w[m]; }
  let u = rand() * Z, idx = M - 1;
  for (let m = 0; m < M; m++) { u -= w[m]; if (u < 0) { idx = m; break; } }
  let H = 0;
  for (let m = 0; m < M; m++) { const q = w[m] / Z; if (q > 0) H -= q * Math.log(q); }
  return { deck: decks[idx], hpool: H };
}

// True KL(q || uniform_V) of the pool mechanism's allocation law q at this state (Monte Carlo).
// q(s)/u(s) = M * E[ w(s) / (w(s) + S_{M-1}) ], S_{M-1} = total weight of M-1 fresh uniform candidates.
export function poolKL(state, rand, { M = 100, gamma = 0.2, lambda = 0.075, phi = 0 } = {}, R = 200, Rp = 300) {
  // reference scale: shift log-weights by the mean score of uniform decks to avoid overflow
  let ref = 0; for (let r = 0; r < 200; r++) ref += gamma * repoScore(state, uniformDeck(rand), lambda, phi); ref /= 200;
  const S = new Float64Array(Rp);
  for (let r = 0; r < Rp; r++) { let s = 0; for (let m = 0; m < M - 1; m++) s += Math.exp(gamma * repoScore(state, uniformDeck(rand), lambda, phi) - ref); S[r] = s; }
  let acc = 0;
  for (let r = 0; r < R; r++) {
    const { deck } = poolPolicy(state, rand, { M, gamma, lambda, phi });
    const ws = Math.exp(gamma * repoScore(state, deck, lambda, phi) - ref);
    let e = 0; for (let k = 0; k < Rp; k++) e += ws / (ws + S[k]);
    acc += Math.log(M * e / Rp);
  }
  return acc / R;
}

// "Reweighted dice": exact Gibbs measure pi(s) ∝ 1[s valid] Π_p W[s_p][p],
// log W_ip = -beta (C_i + λ P_ip) + (beta/2) φ ext_i  — identical to the repo's softmax in the M→∞ limit when beta = 2γ.
// Sampled exactly by rolling one 64-sided die per position and rejecting invalid decks.
export function makeDice(state, { beta, lambda = 0.075, phi = 0, wo = 1, logTarget = null }) {
  const lw = new Float64Array(NV * K), cum = new Float64Array(NV * K);
  for (let p = 0; p < K; p++) {
    let mx = -Infinity;
    for (let i = 0; i < NV; i++) {
      let v = -beta * (wo * state.C[i] + lambda * state.P[i * K + p]) + 0.5 * beta * phi * isExt[i];
      if (logTarget) v += logTarget[i];
      lw[i * K + p] = v; if (v > mx) mx = v;
    }
    let Z = 0; for (let i = 0; i < NV; i++) Z += Math.exp(lw[i * K + p] - mx);
    let acc = 0;
    for (let i = 0; i < NV; i++) { const q = Math.exp(lw[i * K + p] - mx) / Z; lw[i * K + p] = Math.log(q); acc += q; cum[p * NV + i] = acc; }
  }
  return { lw, cum };
}
function rollDie(cum, p, rand) {
  const u = rand(); let lo = 0, hi = NV - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[p * NV + mid] < u) lo = mid + 1; else hi = mid; }
  return lo;
}
export function diceSample(dice, rand, maxRolls = 2e6) {
  const d = new Array(K);
  for (let r = 0; r < maxRolls; r++) {
    for (let p = 0; p < K; p++) d[p] = rollDie(dice.cum, p, rand);
    if (valid(d)) return d;
  }
  throw new Error('diceSample: acceptance collapsed (temperature too low for plain rejection)');
}
// KL(pi || uniform_V) = E_pi[Σ_p log(64 w̃_{s_p p})] - log(A(W)/A1), A(W) = P_dice(valid); Monte Carlo with R rolls.
export function diceKL(dice, rand, R = 4000, minAcc = 400, Rmax = 400000) {
  const d = new Array(K); let acc = 0, sum = 0, r = 0;
  for (; r < Rmax && (r < R || acc < minAcc); r++) {
    for (let p = 0; p < K; p++) d[p] = rollDie(dice.cum, p, rand);
    if (valid(d)) { acc++; let s = 0; for (let p = 0; p < K; p++) s += dice.lw[d[p] * K + p] + Math.log(NV); sum += s; }
  }
  return sum / acc - Math.log((acc / r) / A1);
}

// Ledger diagnostics. Information quantities in nats.
export function metrics(state) {
  const n = state.n, T = K * n / NV, Tp = n / NV, N = K * n;
  let ss = 0, mn = Infinity, mx = -Infinity;
  for (let i = 0; i < NV; i++) { const e = state.C[i] - T; ss += e * e; if (state.C[i] < mn) mn = state.C[i]; if (state.C[i] > mx) mx = state.C[i]; }
  let ssP = 0; for (let j = 0; j < NV * K; j++) { const f = state.P[j] - Tp; ssP += f * f; }
  let HV = 0; for (let i = 0; i < NV; i++) { const q = state.C[i] / N; if (q > 0) HV -= q * Math.log(q); }
  let HVgPos = 0;
  for (let p = 0; p < K; p++) { let h = 0; for (let i = 0; i < NV; i++) { const q = state.P[i * K + p] / n; if (q > 0) h -= q * Math.log(q); } HVgPos += h / K; }
  let ce = 0, ne = 0, co = 0, no = 0;
  for (let i = 0; i < NV; i++) { if (isExt[i]) { ce += state.C[i]; ne++; } else { co += state.C[i]; no++; } }
  let bit = 0;
  for (let b = 0; b < 6; b++) { let dd = 0; for (let i = 0; i < NV; i++) dd += (((i >> b) & 1) ? 1 : -1) * state.C[i]; bit += dd * dd; }
  return {
    sdOverall: Math.sqrt(ss / NV), range: mx - mn, sdPos: Math.sqrt(ssP / (NV * K)),
    klOverall: Math.log(NV) - HV,           // KL(vignette marginal || uniform)
    jsdPos: HV - HVgPos,                    // JSD among the 5 position ledgers = I(vignette; position)
    extOffset: ce / ne - co / no, bitRMS: Math.sqrt(bit / 6),
  };
}
