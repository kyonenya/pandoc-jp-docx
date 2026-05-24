#!/bin/sh
set -eu

input_folder=${1:?Usage: $0 input_folder [config] [output_file]}
config=${2:-}
output_file=${3:-}

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

GITHUB_OUTPUT="$tmp" sh build-pandoc.sh "$input_folder" "$config" "$output_file"
output_file=$(sed -n 's/^output_file=//p' "$tmp")
./postprocess/numbering.sh "$output_file"
