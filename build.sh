#!/bin/sh
set -eu

input_folder=${1:?Usage: $0 input_folder output_file [config]}
output_file=${2:?Usage: $0 input_folder output_file [config]}
config=${3:-}

sh build-pandoc.sh "$input_folder" "$output_file" "$config"
./postprocess/numbering.sh "$output_file"
