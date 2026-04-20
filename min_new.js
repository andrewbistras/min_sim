/**
 * Adaptive minimisation for selecting vignette indices.
 * @param {string} globalData - JSON dataset with overall_counts & position_counts
 * @param {number} numVignettes - Number of vignette IDs to select
 * @returns {string[]} Array of selected 6-bit vignette ID strings
 */
export default async function trialMinimisation(globalData, numVignettes) {
  const LAMBDA = 0.075;
  const GAMMA = 0.2;
  const PHI = 3.0;

  let count_tries = 0

  // Load global counts
  const overallCounts = globalData.overall_counts;
  const positionCounts = globalData.position_counts;
  
  const vignetteIds = Object.keys(overallCounts);
  const nV = vignetteIds.length;

  // Total assignments so far
  const totalAssigned = Object.values(overallCounts).reduce((sum, count) => sum + count, 0);
  const targetOverall = (totalAssigned + numVignettes) / nV;
  const targetPosition = targetOverall / numVignettes;


  // initialize marginal cost lookup tables
  const deltaOverall  = {};
  const deltaPosition = {};
  function computeDeltaOverall(i) {
    const C = overallCounts[i];
    const oldO = (C - targetOverall) ** 2;
    const newO = (C + 1 - targetOverall) ** 2;
    deltaOverall[i] = oldO - newO;
  }
  function computeDeltaPosition(i) {
    deltaPosition[i] = [];
    for (let p = 0; p < numVignettes; p++) {
      const P    = positionCounts[i][p];
      const oldP = (P - targetPosition) ** 2;
      const newP = (P + 1 - targetPosition) ** 2;
      deltaPosition[i][p] = oldP - newP;
    }
  }

  /**
   * Pre-computes all invalid (dist < 2) pairs.
   * @param {string[]} vignetteIds - All possible vignette IDs.
   * @returns {Map<string, Set<string>>} A map where key is a vignette ID and
   * value is a Set of all other IDs invalid to be paired with it.
   */
  function precomputeInvalidPairs(vignetteIds) {
    const invalidPairMap = new Map();

    for (const givenID of vignetteIds) {
      const neighbors = new Set();
          neighbors.add(givenID)  // a given id is 0 hamming distances from itself
          for (let i = 0; i < givenID.length; i++) {
              const bit = givenID[i];
              const flippedBit = (bit === '0' ? '1' : '0');
              const neighborID = givenID.slice(0, i) + flippedBit + givenID.slice(i + 1);
              neighbors.add(neighborID)
          }
          invalidPairMap.set(givenID, neighbors);
      }

    return invalidPairMap;
  }


  // build both tables
  for (const i of vignetteIds) {
    computeDeltaOverall(i);
    computeDeltaPosition(i);
  }
  const invalidPairs = precomputeInvalidPairs(vignetteIds);


  // ensure each pair in the sequence differs by >= 2 bits
  function isValidCandidate(order) {
    for (let i = 0; i < numVignettes; i++) {
      const neighbors = invalidPairs.get(order[i]);
      for (let j = i + 1; j < numVignettes; j++) {
        // fast O(1) Set lookup instead of O(L) hamming calculation
        if (neighbors.has(order[j])) return false;
      }
    }
    return true;
  }
  // Generate one valid candidate sequence
  function generateCandidate() {
    let seq;
    do {
      const pool = [...vignetteIds];
      seq = [];
      for (let i = 0; i < numVignettes; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        seq.push(pool.splice(idx, 1)[0]);
      }
    } while (!isValidCandidate(seq));
    return seq;
  }

  // Compute the cost of a candidate sequence
function computeMarginalCost(seq) {
  let sum = 0;
  for (let p = 0; p < numVignettes; p++) {
    const i = seq[p];

    const numOnes = i.split('1').length - 1;

    const isExtreme = (numOnes <= 1 || numOnes >= 5);

    //    If extreme, we add PHI to the 'benefit' score.
    const bonus = isExtreme ? PHI : 0;

    sum += deltaOverall[i] + LAMBDA * deltaPosition[i][p] + bonus;
  }
  return sum;
}
  function stableSoftmax(deltas) {
    const exps = deltas.map(d => Math.exp(GAMMA * d));
    const sum_exps = exps.reduce((a, b) => a + b, 0) || 1;
    const probs = exps.map(e => e / sum_exps);
    return probs;
  }

  // Build candidate pool, compute costs, and sample via a computationally safe version of softmax
  const POOL_SIZE = 100;
  const candidates = Array.from({ length: POOL_SIZE }, () => generateCandidate());
  const deltas = candidates.map(computeMarginalCost);
  const probabilities = stableSoftmax(deltas);

  const pick = Math.random();

  let cumulative = 0;
  let chosenIndex = probabilities.length - 1;
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i];
    if (pick < cumulative) {
      chosenIndex = i;
      break;
    }
  }

  const eps = 1e-12;  // small constant to avoid log(0)
  const entropy = -probabilities.reduce((sum, p) => sum + p * Math.log(p + eps), 0);

  // Return only the array of selected vignette IDs
  candidates[chosenIndex].push(entropy, deltaOverall, deltaPosition);
  // candidates[chosenIndex].push(entropy);
  return candidates[chosenIndex];
}
