#!/bin/sh
set -eu

input_folder=${1:?Usage: $0 input_folder [config] [output_file]}
config=${2:-}
output_file=${3:-}

if [ -z "$output_file" ]; then
  case "$input_folder" in
    caller/*)
      output_file="caller/dist/$(basename "$input_folder").docx"
      ;;
    *)
      output_file="dist/$(basename "$input_folder").docx"
      ;;
  esac
fi

mkdir -p "$(dirname "$output_file")"

set -- --defaults=defaults.yml
if [ -n "$config" ]; then
  set -- "$@" --defaults="$config"
fi

pandoc "$@" \
  --output="$output_file" \
  "$input_folder"/[0-9]*.md

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "output_file=$output_file"
    echo "publish_dir=$(dirname "$output_file")"
    echo "name=$(basename "$output_file" .docx)"
  } >> "$GITHUB_OUTPUT"
fi
