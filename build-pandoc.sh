#!/bin/sh
set -eu

input_folder=${1:?Usage: $0 input_folder output_file [config]}
output_file=${2:?Usage: $0 input_folder output_file [config]}
config=${3:-}

if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  input_folder="caller/$input_folder"
  output_file="caller/$output_file"
  config=${config:+"caller/$config"}
fi

mkdir -p "$(dirname "$output_file")"

pandoc \
  --defaults=defaults.yml \
  --output="$output_file" \
  ${config:+--defaults="$config"} \
  "$input_folder"/[0-9]*.md
