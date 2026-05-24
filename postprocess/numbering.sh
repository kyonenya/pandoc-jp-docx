#!/bin/sh
# pandoc が生成した docx の numbering.xml を後処理で書き換える
set -eu

docx=${1:?Usage: $0 path/to/file.docx}
docx_dir=$(cd "$(dirname "$docx")" && pwd -P)
docx_abs="$docx_dir/$(basename "$docx")"
script_dir=$(cd "$(dirname "$0")" && pwd)

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/word"

# numbering.xml を持たないドキュメント (リスト無し) はスキップ
if ! unzip -p "$docx_abs" word/numbering.xml > "$tmp/word/numbering.xml" 2>/dev/null \
   || [ ! -s "$tmp/word/numbering.xml" ]; then
  echo "skipped postprocess: no numbering.xml"
  exit 0
fi

node "$script_dir/numbering.mts" "$tmp/word/numbering.xml"

(cd "$tmp" && zip -q "$docx_abs" word/numbering.xml)
