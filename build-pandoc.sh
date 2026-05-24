#!/bin/sh
set -eu

input_folder=${1:?Usage: $0 input_folder [config] [output_file]}
config=${2:-}
output_file=${3:-"dist/$(basename "$input_folder").docx"}

if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  input_folder="caller/$input_folder"
  config=${config:+"caller/$config"}
  output_file="caller/$output_file"
fi

mkdir -p "$(dirname "$output_file")"

pandoc \
  --defaults=defaults.yml \
  ${config:+--defaults="$config"} \
  --output="$output_file" \
  "$input_folder"/[0-9]*.md

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "output_file=$output_file"
    echo "publish_dir=$(dirname "$output_file")"
    echo "name=$(basename "$output_file" .docx)"
  } >> "$GITHUB_OUTPUT"
fi
