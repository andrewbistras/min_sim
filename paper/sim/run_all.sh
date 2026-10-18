#!/bin/sh
# Reproduce every number and figure in the paper: sh run_all.sh  (from paper/sim)
mkdir -p results/logs
{
  for p in cr k0.25 k0.5 k1 k2 k4 k8 dm; do echo "sim_main.mjs $p"; done
  for p in cr k0.5 k1 k2 k4 dm; do echo "sim_concurrency.mjs $p"; done
  for p in cr k1-assign k1-complete dm-complete; do echo "sim_attrition.mjs $p"; done
  echo "sim_mode.mjs"
  echo "sim_misc.mjs"
} | xargs -P "$(sysctl -n hw.ncpu 2>/dev/null || nproc)" -L 1 sh -c 'node $0 $1 > "results/logs/$(echo $0 $1 | tr " /" "__").log" 2>&1'
echo "all simulations finished"
