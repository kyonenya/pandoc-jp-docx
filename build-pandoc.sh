#!/bin/sh
set -eu

input_pattern=${1:?Usage: $0 input_pattern output_file [config]}
output_file=${2:?Usage: $0 input_pattern output_file [config]}
config=${3:-}

if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  input_pattern="caller/$input_pattern"
  output_file="caller/$output_file"
  config=${config:+"caller/$config"}
fi

mkdir -p "$(dirname "$output_file")"

set -- $input_pattern  # expand

if [ "$#" -eq 1 ] && [ "$1" = "$input_pattern" ]; then
  echo "No input files matched: $input_pattern" >&2
  exit 1
fi

pandoc \
  --defaults=defaults.yml \
  --output="$output_file" \
  ${config:+--defaults="$config"} \
  "$@"
