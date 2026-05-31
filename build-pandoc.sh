#!/bin/sh
# GitHub Actions/ローカル共通
set -eu

input_pattern=${1:?Usage: $0 input_pattern output_file [config]}
output_file=${2:?Usage: $0 input_pattern output_file [config]}
config=${3:-}

mkdir -p "$(dirname "$output_file")"

set -- $input_pattern # expand

if [ "$#" -eq 1 ] && [ ! -e "$1" ]; then
  echo "No input files matched: $input_pattern" >&2
  exit 1
fi

pandoc \
  --defaults=defaults.yml \
  --output="$output_file" \
  ${config:+--defaults="$config"} \
  "$@"
