# Online Stochastic Trial Minimisation

**Andrew Bistras** · University of California, Los Angeles · Astrid Cybernetics · [andrew.bistras@gmail.com](mailto:andrew.bistras@gmail.com)

**Paper:** [paper/main.pdf](paper/main.pdf) (LaTeX source: [paper/main.tex](paper/main.tex))

Human subjects research often gives each participant a set of conditions from a larger pool: vignettes, choice sets, intervention components or treatment sequences. This paper generalizes minimisation, the balancing method of clinical trials, to sets of conditions under within-participant constraints. It treats allocation as a feedback controller with one parameter: the bits of randomness each allocation may give up. The algorithm rolls one weighted die whose faces are the conditions, reweighs the faces after every participant, and keeps a roll only when it forms an admissible set.

## Repository layout

| Path | Contents |
| --- | --- |
| [`paper/`](paper/) | Manuscript, figures and bibliography |
| [`paper/code/ostm.js`](paper/code/ostm.js) | Dependency-free reference implementation (Node.js or browser) |
| [`paper/sim/`](paper/sim/) | Simulation scripts and results behind every number and figure |
| `min_old.js`, `min_new.js`, `min_runner.js`, `hmm.py`, `precompute.js` | The earlier candidate-pool implementation, analyzed in Appendix D of the paper |

## Quick start

```javascript
import { hypercubeConflicts, createDesign, createAllocator } from './paper/code/ostm.js';

const design = createDesign({ ...hypercubeConflicts(6, 2), k: 5 }); // 64 vignettes, no minimal pairs
const allocator = createAllocator(design, { budgetBits: 1 });
const { deck, logProbSet } = allocator.allocate(counts);            // counts = exposures so far
```

## Reproducing the paper

```sh
cd paper/sim
sh run_all.sh            # Studies 1-4 and supporting checks; results land in paper/sim/results/
python figures.py        # redraws paper/figures/ from those results (needs numpy and matplotlib)
cd .. && tectonic -X compile main.tex
```

## Citation

```bibtex
@unpublished{bistras2026minimisation,
  author = {Bistras, Andrew},
  title  = {Online Stochastic Trial Minimisation},
  note   = {Working paper, University of California, Los Angeles and Astrid Cybernetics},
  year   = {2026},
  url    = {https://github.com/andrewbistras/min_sim}
}
```
