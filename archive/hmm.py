#!/usr/bin/env python3
import subprocess
import json
import argparse
import numpy as np
import pandas as pd
import math
import sys
import os
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

# Wrapper filename
WRAPPER_JS = 'min_runner.js'

# Ensure the Node wrapper exists
def ensure_wrapper():
    if not os.path.exists(WRAPPER_JS):
        code = '''#!/usr/bin/env node
import trialMinimisation from './min.js';
import fs from 'fs';
(async() => {
  const [globalPath, numVignettes] = process.argv.slice(2);
  const globalData = JSON.parse(fs.readFileSync(globalPath, 'utf8'));
  const result = await trialMinimisation(globalData, parseInt(numVignettes, 10));
  console.log(JSON.stringify(result));
})();'''
        with open(WRAPPER_JS, 'w') as f:
            f.write(code)
        os.chmod(WRAPPER_JS, 0o755)


def main():
    parser = argparse.ArgumentParser(description="Run minimisation N times and update counts, with optional animation")
    parser.add_argument('-n', '--iterations', type=int, required=True,
                        help='Number of participants')
    parser.add_argument('-k', '--num-vignettes', type=int, default=5,
                        help='Number of vignettes each individual particpant sees')
    parser.add_argument('-g', '--global-path', default='global_counts.json',
                        help='Path to global_counts.json')
    parser.add_argument('--animate', action='store_true',
                        help='Show and save animated distribution')
    args = parser.parse_args()

    ensure_wrapper()

    N = args.iterations
    K = args.num_vignettes
    global_path = args.global_path

    # Load initial counts
    with open(global_path, 'r') as f:
        global_data = json.load(f)
    overall_counts = global_data['overall_counts']
    position_counts = global_data['position_counts']

    # Zero-initialize counts on startup
    overall_counts = {vid: 0 for vid in overall_counts}
    position_counts = {vid: [0] * K for vid in overall_counts}
    with open(global_path, 'w') as f:
        json.dump({'overall_counts': overall_counts,
                   'position_counts': position_counts},
                  f, indent=2)

    # IDs list for consistent ordering
    ids = list(overall_counts.keys())

    entropies = []
    history = []  # track overall_counts over time
    count_tries = []
    # track least‐frequent inclusion metrics
    lf_condition_count = 0
    lf_included_count  = 0

    for i in range(N):
        # Call the Node wrapper
        cmd = ['node', WRAPPER_JS, global_path, str(K)]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Iteration {i+1} failed:\n{result.stderr}", file=sys.stderr)
            sys.exit(1)


        seq = json.loads(result.stdout)
        #print(len(seq))
        # Expect [id1, ..., idK, entropy, deltaOverall, deltaPosition]
        if isinstance(seq, list) and len(seq) == K + 1:
            entropy = seq[-1]
            ids_seq = seq[:-1]
        else:
            ids_seq = seq[:5]
            entropy = seq[5]
            delta_overall = seq[6]
            delta_position = seq[7]

        # count_tries.append(count_try)
        entropies.append(entropy)

        # --- log unique least‐frequent inclusion ---
        current_counts = [overall_counts[vid] for vid in ids]
        min_count      = min(current_counts)
        least_ids      = [vid for vid, c in zip(ids, current_counts) if c == min_count]
        if len(least_ids) == 1:
            lf_condition_count += 1
            if least_ids[0] in ids_seq:
                lf_included_count += 1

        # Update counts
        for pos, vid in enumerate(ids_seq):
            overall_counts[vid] = overall_counts.get(vid, 0) + 1
            position_counts[vid][pos] = position_counts[vid][pos] + 1

        # Record snapshot
        history.append([overall_counts[vid] for vid in ids])

        # Write back to JSON
        with open(global_path, 'w') as f:
            json.dump({'overall_counts': overall_counts,
                       'position_counts': position_counts},
                      f, indent=2)
            
        if i == N - 1:
            continue;
            print("delta overall table:")
            df_overall = pd.DataFrame(list(delta_overall.items()), columns=['Binary', 'Delta'])
            print(df_overall)

            print("\ndelta position table:")
            df_position = pd.DataFrame.from_dict(delta_position, orient='index', 
                                                columns=['Pos_0', 'Pos_1', 'Pos_2', 'Pos_3', 'Pos_4'])
            print(df_position)

    # print(np.mean(count_tries))

    # Compute and log average entropy
    avg_entropy = np.mean(entropies)
    print(f"Average entropy over {N} runs: {avg_entropy:.6f}")

    # Compute standard error for overall_counts
    counts_array = np.array([overall_counts[vid] for vid in ids], dtype=float)
    se_overall = np.std(counts_array, ddof=1) / math.sqrt(len(counts_array))
    print(f"Standard error of overall_counts: {se_overall:.6f}")

    # Compute standard error per position
    num_positions = K
    for pos in range(num_positions):
        pos_vals = np.array([position_counts[vid][pos] for vid in ids], dtype=float)
        se_pos = np.std(pos_vals, ddof=1) / math.sqrt(len(pos_vals))
        print(f"Position {pos} standard error: {se_pos:.6f}")

    # --- report fraction of times the (uniquely) least‐frequent was chosen ---
    if lf_condition_count > 0:
        frac = lf_included_count / lf_condition_count
        print(
        f"Least‐frequent vignette was included "
        f"{frac:.4f} of the time when it was uniquely least‐frequent "
        f"({lf_included_count}/{lf_condition_count})"
        )

    # --- Marginal bit counts ---
    print("Bit marginal counts:")
    for b in range(6):
        zeros = sum(overall_counts[vid] for vid in ids if vid[b] == '0')
        ones  = sum(overall_counts[vid] for vid in ids if vid[b] == '1')
        ratio = ones / zeros if zeros > 0 else float('inf')
        print(f"  Bit {b}: 0s={zeros}  1s={ones}  ratio(1/0)={ratio:.4f}")

    # --- Static plot of final distribution ---
    fig, ax = plt.subplots(figsize=(12, 6))
    ax.bar(range(len(ids)), counts_array)
    ax.set_xticks(range(len(ids)))
    ax.set_xticklabels(ids, rotation='vertical', fontsize=6)
    ax.set_ylabel('Count')
    ax.set_title('Final Distribution of Overall Counts')
    plt.tight_layout()
    plt.savefig('overall_counts_distribution.png')
    print("Saved static plot to overall_counts_distribution.png")

    # --- Animated plot over time ---
    if args.animate:
        fig2, ax2 = plt.subplots(figsize=(12, 6))
        bar_container = ax2.bar(range(len(ids)), history[0])
        ax2.set_xticks(range(len(ids)))
        ax2.set_xticklabels(ids, rotation='vertical', fontsize=6)
        ax2.set_xlabel('Vignette variations')
        ax2.set_ylabel('Count')
        ax2.set_ylim(0, 40)

        def update(frame):
            # determine previous counts (zero for the very first frame)
            if frame == 0:
                prev_counts = [0] * len(history[0])
            else:
                prev_counts = history[frame - 1]

            curr_counts = history[frame]

            for bar, curr, prev in zip(bar_container, curr_counts, prev_counts):
                # update each bar’s height
                bar.set_height(curr)
                # if this vignette’s count increased this iteration, color it red
                if curr > prev:
                    bar.set_color('#a734e0')
                else:
                    bar.set_color('#1f77b4')  # or your original default color

            ax2.set_title(f'Distribution after {frame+1} participants')
            return bar_container

        ani = FuncAnimation(
            fig2, update, frames=len(history), interval=200, blit=False, repeat=False
        )
        ani.save('counts_animation.gif', writer='pillow', dpi=200, fps=10)
        print("Saved animation to counts_animation.mp4")
        plt.show()

if __name__ == '__main__':
    main()
