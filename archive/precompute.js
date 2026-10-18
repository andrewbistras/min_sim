import fs from 'fs';
const numVignettes = 5


const globalData = JSON.parse(fs.readFileSync("global_counts.json", 'utf8'));

const overallCounts = globalData.overall_counts;
const positionCounts = globalData.position_counts;

const vignetteIds = Object.keys(overallCounts);
const nV = vignetteIds.length;

// Total assignments so far
const totalAssigned = Object.values(overallCounts).reduce((sum, count) => sum + count, 0);
const targetOverall = (totalAssigned + numVignettes) / nV;
const targetPosition = targetOverall / numVignettes;


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

const invalidPairs = precomputeInvalidPairs(vignetteIds);

console.table(invalidPairs)

console.log(invalidPairs.get('111001'))
console.log(invalidPairs.get('000000'))
console.log(invalidPairs.get('111111'))