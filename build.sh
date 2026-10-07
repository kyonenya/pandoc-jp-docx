#!/bin/sh
set -eu

usage="Usage: $0 input_pattern output_path [--defaults=path] [--no-postprocess]"

input_pattern=${1:?"$usage"}
output_path=${2:?"$usage"}
defaults_path=
postprocess=true

shift 2

for opt in "$@"; do
  case "$opt" in
    '')
      ;;
    --defaults=*)
      defaults_path=${opt#--defaults=}
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

set --
for path in $input_pattern; do # expand
  if [ -e "$path" ]; then
    set -- "$@" "$path"
  else
    echo "No input files matched: $path" >&2
  fi
done

if [ "$#" -eq 0 ]; then
  echo "No input files to convert" >&2
  exit 1
fi

pandoc \
  --defaults=defaults.yml \
  ${defaults_path:+--defaults="$defaults_path"} \
  --output="$output_path" \
  "$@"

if [ "$postprocess" = "true" ]; then
  ./postprocess/numbering.sh "$output_path"
fi
