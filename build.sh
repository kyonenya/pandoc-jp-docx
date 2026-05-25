#!/bin/sh
set -eu

input_pattern=${1:?Usage: $0 input_pattern output_name [config]}
output_name=${2:?Usage: $0 input_pattern output_name [config]}
config=${3:-}
output_file="dist/$output_name.docx"

sh build-pandoc.sh "$input_pattern" "$output_file" "$config"
./postprocess/numbering.sh "$output_file"
