"""Two-arm balance-versus-randomness frontier (Section 5).

State D = n_A - n_B. The optimum is the average-cost KL-control (linearly solvable MDP) policy for
E[D^2] + tau * E[KL(policy || fair coin)]; sweeping tau traces the frontier. Classical designs are evaluated
by their stationary law. Writes results/twoarm.json.
"""
import json, os
import numpy as np

L = 150
S = np.arange(-L, L + 1); nS = len(S); c = L

def stationary(up):
    lp = np.full(nS, -np.inf); lp[c] = 0.0
    with np.errstate(divide='ignore'):
        for k in range(c, nS - 1):
            if up[k] <= 0 or up[k + 1] >= 1: break
            lp[k + 1] = lp[k] + np.log(up[k]) - np.log1p(-up[k + 1])
        for k in range(c, 0, -1):
            if up[k] >= 1 or up[k - 1] <= 0: break
            lp[k - 1] = lp[k] + np.log1p(-up[k]) - np.log(up[k - 1])
    pi = np.exp(lp - lp.max()); return pi / pi.sum()

def stats(up):
    pi = stationary(up); p = np.clip(up, 1e-300, 1 - 1e-16)
    h = np.where((up > 0) & (up < 1), -(p * np.log2(p) + (1 - p) * np.log2(1 - p)), 0.0)
    return dict(ED2=float(pi @ S**2), bits=float(1 - pi @ h), guess=float(pi @ np.maximum(up, 1 - up)))

def lmdp(tau):
    P0 = np.zeros((nS, nS))
    for k in range(nS):
        if k + 1 < nS: P0[k, k + 1] = 0.5
        if k - 1 >= 0: P0[k, k - 1] = 0.5
    P0[0, 0] = P0[-1, -1] = 0.5
    lg = -(S.astype(float) ** 2) / tau
    sg = np.exp(0.5 * (lg - lg.max()))
    w, Y = np.linalg.eigh(sg[:, None] * P0 * sg[None, :])
    z = sg * np.abs(Y[:, -1])
    up = np.empty(nS)
    for k in range(nS):
        den = (z[k + 1] if k + 1 < nS else 0) + (z[k - 1] if k > 0 else 0)
        up[k] = (z[k + 1] / den) if (den > 0 and 0 < k < nS - 1) else (1.0 if S[k] < 0 else 0.0)
    return up

front = [stats(lmdp(t)) for t in np.geomspace(0.02, 5000, 600)]
front = sorted(front, key=lambda f: f['bits'])
fb = np.array([f['bits'] for f in front]); fD = np.array([f['ED2'] for f in front])
opt = lambda bits: float(np.exp(np.interp(np.log(bits), np.log(fb), np.log(fD))))

def design(family, label, setting, up):
    st = stats(up); st.update(family=family, label=label, setting=setting, excess=st['ED2'] / opt(st['bits']) - 1); return st

designs = []
for p in [0.6, 2 / 3, 0.75, 0.8, 0.9]:
    designs.append(design('efron', "Efron's biased coin", f'p = {p:.3g}' if p != 2 / 3 else 'p = 2/3', np.where(S == 0, 0.5, np.where(S > 0, 1 - p, p))))
for b in [2, 3, 4, 6]:
    designs.append(design('bigstick', 'Big stick', f'b = {b}', np.where(np.abs(S) < b, 0.5, np.where(S > 0, 0.0, 1.0))))
for b in [2, 3, 4, 6]:
    psi = np.where(np.abs(S) <= b, np.sin(np.pi * (S + b + 1) / (2 * b + 2)), 0.0); lam = 2 * np.cos(np.pi / (2 * b + 2))
    up = np.array([psi[k + 1] / (lam * psi[k]) if (0 < k < nS - 1 and psi[k] > 0) else (1.0 if S[k] < 0 else 0.0) for k in range(nS)])
    d = design('maximal', 'Maximal procedure (asymptotic)', f'b = {b}', up); d['entropyFormula'] = float(np.log2(lam)); designs.append(d)
for a in [0.5, 1, 2, 4]:
    designs.append(design('abcd', 'Adjustable biased coin', f'a = {a:g}', np.where(S == 0, 0.5, np.where(S > 0, 1 / (np.abs(S) ** a + 1), np.abs(S) ** a / (np.abs(S) ** a + 1)))))
for beta in [0.05, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2]:
    designs.append(design('gibbs', 'Fixed-temperature rule', f'beta = {beta:g}', 1 / (1 + np.exp(np.clip(beta * S, -700, 700)))))

# frontier thinned to ~40 points evenly spaced in log(bits) over the plotted range
keep = np.unique(np.searchsorted(fb, np.geomspace(0.012, 0.6, 40)).clip(0, len(fb) - 1))
os.makedirs('results', exist_ok=True)
json.dump({'frontier': [{'bits': float(fb[i]), 'ED2': float(fD[i])} for i in keep], 'designs': designs}, open('results/twoarm.json', 'w'), indent=1)
for d in designs:
    print(f"{d['label']:32s} {d['setting']:12s} bits {d['bits']:.4f}  E[D2] {d['ED2']:7.3f}  excess {100 * d['excess']:6.1f}%  guess {d['guess']:.3f}")
