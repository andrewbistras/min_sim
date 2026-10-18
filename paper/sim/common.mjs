// Shared helpers for the simulation study.
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ledger: exposure counts per stimulus and per (stimulus, position). */
export function newLedger(m, k) { return { n: 0, m, k, C: new Float64Array(m), P: new Float64Array(m * k) }; }
export function record(L, deck) { deck.forEach((i, p) => { L.C[i] += 1; L.P[i * L.k + p] += 1; }); L.n += 1; }

/** Exposure SD around the uniform target, range, factor-level imbalance and order balance (G/df, 1 ≈ random). */
export function ledgerMetrics(L) {
  const { m, k, n, C, P } = L, T = (k * n) / m;
  let ss = 0, mn = Infinity, mx = -Infinity;
  for (let i = 0; i < m; i++) { ss += (C[i] - T) ** 2; mn = Math.min(mn, C[i]); mx = Math.max(mx, C[i]); }
  const N = k * n;
  let HV = 0;
  for (let i = 0; i < m; i++) if (C[i] > 0) { const q = C[i] / N; HV -= q * Math.log(q); }
  let HVgPos = 0;
  for (let p = 0; p < k; p++) { let h = 0; for (let i = 0; i < m; i++) { const q = P[i * k + p] / n; if (q > 0) h -= q * Math.log(q); } HVgPos += h / k; }
  const factors = Math.log2(m);
  let worstFactor = 0;
  for (let b = 0; b < factors; b++) { let diff = 0; for (let i = 0; i < m; i++) diff += ((i >> b) & 1 ? 1 : -1) * C[i]; worstFactor = Math.max(worstFactor, Math.abs(diff)); }
  return { sd: Math.sqrt(ss / m), range: mx - mn, worstFactor, orderG: (2 * N * (HV - HVgPos)) / ((m - 1) * (k - 1)) };
}

export const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
export const se = a => { const mu = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / (a.length - 1) / a.length); };
export const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
