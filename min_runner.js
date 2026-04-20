#!/usr/bin/env node
import trialMinimisation from './min_old.js';
import fs from 'fs';
(async() => {
  const [globalPath, numVignettes, debugFlag] = process.argv.slice(2);
  const globalData = JSON.parse(fs.readFileSync(globalPath, 'utf8'));
  const debug = debugFlag === '--debug';
  const result = await trialMinimisation(globalData, parseInt(numVignettes, 10));
  console.log(JSON.stringify(result));
})();