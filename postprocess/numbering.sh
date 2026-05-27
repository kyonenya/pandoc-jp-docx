#!/bin/sh
# pandoc が生成した docx の word/numbering.xml を後処理で書き換える
set -eu

input_path=${1:?Usage: $0 path/to/file.docx}
input_dir=$(dirname "$input_path")
input_file=$(basename "$input_path")
script_dir=$(dirname "$0")

tmp_dir=$(mktemp -d "$input_dir/.tmp.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT
mkdir -p "$tmp_dir/word"

numbering_path="$tmp_dir/word/numbering.xml"

if ! unzip -p "$input_path" word/numbering.xml > "$numbering_path" 2>/dev/null; then
  echo "skipped postprocess: no numbering.xml"
  exit 0
fi

node "$script_dir/numbering.mts" "$numbering_path"

(cd "$tmp_dir" && zip -q "../$input_file" word/numbering.xml)
