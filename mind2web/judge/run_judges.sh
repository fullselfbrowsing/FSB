#!/bin/sh
set -eu
judge_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
trajectories=${1:?Usage: run_judges.sh trajectories output task_ids.json [passes]}
output=${2:?Output directory required}
task_ids=${3:?Expected task IDs JSON required}
passes=${4:-3}
[ "$passes" = 3 ] || { echo "The scorefield-v2 protocol requires exactly three passes per variant" >&2; exit 2; }
status=0
for variant in official strict; do
    if ! PYTHONPATH="$judge_dir" "$judge_dir/.venv/bin/python" -m om2w_judge.runner \
      --engine codex --variant "$variant" --passes "$passes" --retry_errors \
      --judge-protocol scorefield-v2 --num_workers 10 --engine-concurrency 10 \
      --trajectories_dir "$trajectories" --output_path "$output" --task_ids "$task_ids"; then
      status=1
    fi
done
exit "$status"
