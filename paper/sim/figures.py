"""Figures 2-6 of the paper, drawn from the JSON files in results/. Usage: python figures.py (from paper/sim)."""
import json
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ACCENT, DARK, LIGHT = "#2a78d6", "#52514e", "#a8a69e"
INK, QUIET, GRID, AXIS, REF = "#0b0b0b", "#52514e", "#e1e0d9", "#c3c2b7", "#898781"
plt.rcParams.update({
    "font.family": "sans-serif", "font.sans-serif": ["Helvetica", "Arial", "DejaVu Sans"], "font.size": 8.5,
    "axes.edgecolor": AXIS, "axes.labelcolor": QUIET, "xtick.color": QUIET, "ytick.color": QUIET,
    "axes.spines.top": False, "axes.spines.right": False, "axes.linewidth": 0.8,
    "xtick.major.size": 0, "ytick.major.size": 0, "pdf.fonttype": 42,
})
OUT = os.path.join("..", "figures")
os.makedirs(OUT, exist_ok=True)
load = lambda name: json.load(open(os.path.join("results", name)))


def finish(ax, fig, name):
    ax.grid(axis="y", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, name))
    plt.close(fig)


def label_end(ax, x, y, text, bold=False, dy=0):
    ax.annotate(text, (x, y), xytext=(6, dy), textcoords="offset points", va="center", color=INK,
                fontweight="bold" if bold else "normal")


def log_ticks(ax, axis, values):
    getattr(ax, f"set_{axis}ticks")(values)
    getattr(ax, f"set_{axis}ticklabels")([f"{v:g}" if v < 1000 else f"{v:,.0f}" for v in values])
    getattr(ax, f"{axis}axis").set_minor_locator(matplotlib.ticker.NullLocator())


# Figure 2: two-arm designs, excess squared imbalance over the optimum at equal entropy rate
two = load("twoarm.json")["designs"]
pick = [("bigstick", "b = 3", "Big stick, b = 3"), ("efron", "p = 2/3", "Efron's coin, p = 2/3"),
        ("abcd", "a = 2", "Adjustable biased coin, a = 2"), ("maximal", "b = 3", "Maximal procedure, b = 3")]
rows = [(lab, next(d for d in two if d["family"] == f and d["setting"] == s)) for f, s, lab in pick]
gib = max(d["excess"] for d in two if d["family"] == "gibbs")
fig, ax = plt.subplots(figsize=(6.2, 2.7))
names = [f"{lab}\n{d['bits']:.2f} bits per allocation" for lab, d in rows] + ["Fixed-temperature rule\nany temperature"]
vals = [100 * d["excess"] for _, d in rows] + [100 * gib]
y = np.arange(len(vals))[::-1]
ax.barh(y, vals, height=0.42, color=[LIGHT] * len(rows) + [ACCENT])
for yi, v in zip(y, vals):
    ax.annotate(f"+{v:.0f}%" if v >= 1 else f"at most {v:.1f}%", (v, yi), xytext=(5, 0), textcoords="offset points",
                va="center", color=INK, fontweight="bold" if v < 1 else "normal")
ax.set_yticks(y)
ax.set_yticklabels(names)
ax.set_xlim(0, 180)
ax.set_xticks([0, 50, 100, 150])
ax.set_xticklabels(["0%", "50%", "100%", "150%"])
ax.set_xlabel("Extra mean squared imbalance over the exact optimum, at the same bits per allocation")
ax.grid(axis="x", color=GRID, linewidth=0.6)
ax.set_axisbelow(True)
ax.spines["left"].set_visible(False)
fig.tight_layout()
fig.savefig(os.path.join(OUT, "fig2_twoarm.pdf"))
plt.close(fig)

# Figure 3: exposure SD over participants
names = {"cr": "Complete randomization", "k0.5": "0.5 bits", "k1": "1 bit", "k2": "2 bits", "dm": "Deterministic minimisation"}
colors = {"cr": DARK, "k1": ACCENT}
fig, ax = plt.subplots(figsize=(6.2, 3.3))
for k, nm in names.items():
    runs = load(f"main_{k}.json")["runs"]
    ns = [10, 20, 50, 100, 200, 500, 1000]
    sd = [np.mean([r["traj"][str(n)]["sd"] for r in runs]) for n in ns]
    c = colors.get(k, LIGHT)
    ax.plot(ns, sd, color=c, lw=2.0 if k == "k1" else 1.5, marker="o", ms=3.5, zorder=3 if k == "k1" else 2)
    label_end(ax, ns[-1], sd[-1], nm, bold=k == "k1")
ax.set_xscale("log"); ax.set_yscale("log")
log_ticks(ax, "x", [10, 30, 100, 300, 1000]); log_ticks(ax, "y", [0.25, 0.5, 1, 2, 4, 8])
ax.set_xlim(9, 1000); ax.set_ylim(0.2, 10)
ax.set_xlabel("Participants enrolled"); ax.set_ylabel("Exposure SD (showings)")
fig.subplots_adjust(right=0.74)
finish(ax, fig, "fig3_trajectories.pdf")

# Figure 4: exposure SD against bits spent
keys = ["k0.25", "k0.5", "k1", "k2", "k4", "k8"]
pts = []
for k in keys + ["cr", "dm"]:
    runs = load(f"main_{k}.json")["runs"]
    pts.append((k, np.mean([r["meanBits"] for r in runs]), np.mean([r["meanSd"] for r in runs])))
pts = {k: (b, s) for k, b, s in pts}
fig, ax = plt.subplots(figsize=(6.2, 3.3))
bx = [pts[k][0] for k in keys]; sy = [pts[k][1] for k in keys]
grid_b = np.geomspace(0.2, 8, 50)
ax.plot(grid_b, pts["k1"][1] / np.sqrt(grid_b), color=LIGHT, lw=0.8)
ax.plot(bx, sy, color=ACCENT, lw=2.0, marker="o", ms=4.5, zorder=3)
for k, lab in [("k0.25", "0.25-bit budget"), ("k0.5", "0.5-bit budget"), ("k1", "1-bit budget"), ("k2", "2-bit budget"), ("k4", "4-bit budget")]:
    ax.annotate(lab, pts[k], xytext=(6, 7), textcoords="offset points", color=INK, fontweight="bold" if k == "k1" else "normal")
for k, lab in [("cr", "Complete randomization: {sd:.2f} at 0 bits"), ("dm", "Deterministic minimisation: {sd:.2f} at {b:.1f} bits")]:
    b, s = pts[k]
    ax.axhline(s, color=REF, lw=0.9)
    ax.annotate(lab.format(sd=s, b=b), (0.21, s), xytext=(0, 4), textcoords="offset points", color=QUIET, fontsize=7.5)
ax.annotate(f"Thin gray line: SD = {pts['k1'][1]:.2f} / √κ", (0.21, pts["cr"][1]), xytext=(0, -11),
            textcoords="offset points", color=QUIET, fontsize=7.5)
ax.set_xscale("log"); ax.set_yscale("log")
log_ticks(ax, "x", [0.25, 0.5, 1, 2, 4, 8]); log_ticks(ax, "y", [0.5, 1, 2, 4])
ax.set_xlim(0.2, 8); ax.set_ylim(0.3, 8)
ax.set_xlabel("Bits given up per participant"); ax.set_ylabel("Exposure SD (showings)")
finish(ax, fig, "fig4_budget.pdf")

# Figure 5: participants sharing one stale ledger
names = {"cr": "Complete randomization", "k0.5": "0.5 bits", "k1": "1 bit", "k2": "2 bits", "k4": "4 bits", "dm": "Deterministic minimisation"}
colors = {"dm": DARK, "k1": ACCENT}
fig, ax = plt.subplots(figsize=(6.2, 3.3))
for k, nm in names.items():
    out = load(f"concurrency_{k}.json")["out"]
    b = [o["batch"] for o in out]; sd = [o["meanSd"] for o in out]
    ax.plot(b, sd, color=colors.get(k, LIGHT), lw=2.0 if k in colors else 1.4, marker="o", ms=3.5, zorder=3 if k in colors else 2)
    if k == "k0.5":
        ax.annotate(nm, (b[0], sd[0]), xytext=(4, 7), textcoords="offset points", color=INK)
    else:
        label_end(ax, b[-1], sd[-1], nm, bold=k in colors, dy=-4 if k == "k1" else 0)
ax.set_xscale("log", base=2); ax.set_yscale("log")
log_ticks(ax, "x", [1, 4, 16, 64]); log_ticks(ax, "y", [0.5, 1, 2, 5, 10, 20])
ax.set_xlim(0.9, 64); ax.set_ylim(0.3, 22)
ax.set_xlabel("Participants allocated from one ledger update (b)"); ax.set_ylabel("Exposure SD (showings)")
fig.subplots_adjust(right=0.74)
finish(ax, fig, "fig5_delay.pdf")

# Figure 6: factor A's share of completed showings under differential attrition
names = {"cr": "Complete randomization", "k1-assign": "1 bit, counting assignments", "k1-complete": "1 bit, counting completions"}
colors = {"cr": DARK, "k1-assign": LIGHT, "k1-complete": ACCENT}
nudge = {"cr": -6, "k1-assign": 5, "k1-complete": 0}
fig, ax = plt.subplots(figsize=(6.2, 3.3))
ax.axhline(50, color=REF, lw=0.9)
ax.annotate("Target: 50%", (0, 50), xytext=(2, 4), textcoords="offset points", color=QUIET, fontsize=7.5)
for k, nm in names.items():
    runs = load(f"attrition_{k}.json")["runs"]
    a = [t["arrivals"] for t in runs[0]["traj"]]
    share = [100 * np.mean([r["traj"][j]["shareA"] for r in runs]) for j in range(len(a))]
    ax.plot(a, share, color=colors[k], lw=2.0 if k == "k1-complete" else 1.5, marker="o", ms=3.5)
    label_end(ax, a[-1], share[-1], nm, bold=k == "k1-complete", dy=nudge[k])
ax.set_xlim(0, 1400); ax.set_ylim(47.4, 50.4)
ax.set_xticks(range(0, 1401, 200)); ax.set_xticklabels([f"{v:,}" for v in range(0, 1401, 200)])
ax.set_yticks([47.5, 48, 48.5, 49, 49.5, 50]); ax.set_yticklabels([f"{v:g}%" for v in [47.5, 48, 48.5, 49, 49.5, 50]])
ax.set_xlabel("Participants enrolled"); ax.set_ylabel("Factor A share of completed showings")
fig.subplots_adjust(right=0.72)
finish(ax, fig, "fig6_attrition.pdf")
print("wrote", sorted(os.listdir(OUT)))
