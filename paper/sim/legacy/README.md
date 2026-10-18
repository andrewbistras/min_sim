# Candidate-pool analyses (Appendix D)

These scripts analyze the candidate-pool implementation (`archive/min_old.js`, `archive/min_new.js` at the repository root):
`checks.mjs` (replica fidelity, the Jensen–Shannon check, the extreme-vignette bonus, what the pool's entropy measures),
`frontier.mjs` (pool size and temperature collapse onto one curve) and `nolambda.mjs` (the position term versus shuffling).
Run each with `node <script>` from this folder.
