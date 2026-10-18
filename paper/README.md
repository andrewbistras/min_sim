# Online Stochastic Trial Minimisation — manuscript and code

- `main.tex`, `refs.bib`: the manuscript. Build with `tectonic -X compile main.tex` (or `latexmk -pdf main.tex`) → `main.pdf`.
- `code/ostm.js`: dependency-free reference implementation (one weighted die, reweighed from the ledger, rolled until the deck is admissible; the temperature is solved so each allocation spends a fixed entropy budget in bits).
- `sim/`: every number and figure in the paper.
  - `sh run_all.sh` reruns Studies 1–4 and the supporting checks in parallel (about 20 minutes on an 8-core laptop); results land in `sim/results/`.
  - `python figures.py` redraws `figures/fig2–fig6` from those results; `python twoarm.py` recomputes the two-arm frontier.
  - `test_ostm.mjs` checks the sampler against its target distribution; `legacy/` analyzes the earlier candidate-pool implementation (Appendix D).

Minimal use:

```javascript
import { hypercubeConflicts, createDesign, createAllocator } from './code/ostm.js';
const design = createDesign({ ...hypercubeConflicts(6, 2), k: 5 }); // 64 vignettes, no minimal pairs
const allocator = createAllocator(design, { budgetBits: 1 });
const { deck, logProbSet } = allocator.allocate(counts);            // counts = exposures so far
```
