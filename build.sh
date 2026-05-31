#!/bin/sh
set -eu

usage="Usage: $0 input_pattern output_path [--defaults=path] [--no-postprocess]"

input_pattern=${1:?"$usage"}
output_path=${2:?"$usage"}
config=
postprocess=true

shift 2

for opt in "$@"; do
  case "$opt" in
    '')
      ;;
    --defaults=*)
      config=${opt#--defaults=}
      ;;
    --no-postprocess)
      postprocess=false
      ;;
    *)
      echo "Unexpected option: $opt" >&2
      echo "$usage" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$(dirname "$output_path")"

set -- $input_pattern # expand

if [ "$#" -eq 1 ] && [ ! -e "$1" ]; then
  echo "No input files matched: $input_pattern" >&2
  exit 1
fi

pandoc \
  --defaults=defaults.yml \
  ${config:+--defaults="$config"} \
  --output="$output_path" \
  "$@"

if [ "$postprocess" = "true" ]; then
  ./postprocess/numbering.sh "$output_path"
fi
