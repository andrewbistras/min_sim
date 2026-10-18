# Archive: the original candidate-pool implementation

The first version of the allocator, kept for reference. Appendix D of the paper analyzes it, and `paper/sim/legacy/` reproduces that analysis.

| File | What it is |
| --- | --- |
| `min_old.js` | Allocator: draws 100 random admissible decks and picks one by softmax over a quadratic balance score (overall + 0.075 × position) |
| `min_new.js` | The same, plus a fixed bonus for "extreme" vignettes |
| `min_runner.js` | Command-line wrapper: `node min_runner.js global_counts.json 5` |
| `hmm.py` | Simulation driver: calls the runner once per participant, updates the counts, plots the result (`python hmm.py -n 320 --animate`) |
| `global_counts.json` | Exposure-count ledger used by `hmm.py` (reset to zeros at the start of each run) |
| `precompute.js` | Check of the minimal-pair (Hamming distance < 2) exclusion sets |
| `overall_counts_distribution.png`, `counts_animation.gif` | Outputs of a `hmm.py` run |

Run these from inside this folder; `hmm.py` rewrites `global_counts.json` and the image files.
