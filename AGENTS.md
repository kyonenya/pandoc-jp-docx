# AGENTS.md

- 応答は日本語で行う。

## このリポジトリの構成

- 公開 reusable workflow は `.github/workflows/docx.yml` である。
- リポジトリ内検証 workflow は `.github/workflows/_sample.yml` である。
- shared 側の Pandoc defaults はルートの `defaults.yml` である。`defaults/docx.yml` は使わない。
- fixture 入力は `sample/` に置く。変換対象 Markdown は `sample/[0-9]*.md` である。

## スクリプトの役割

- `build.sh` はローカルと GitHub Actions の共通処理である。Pandoc 実行と `postprocess/numbering.sh` の実行をここに集約する。
- `build.sh` の引数順は `input_pattern output_path [--defaults=path] [--no-postprocess]` である。`output_path` は必須であり、`defaults` は任意である。
- `--no-postprocess` を指定すると `postprocess/numbering.sh` を実行しない。
- workflow 側は `output_name` から `caller/dist/<output_name>.docx` を組み立て、`build.sh` へ渡す。
- `postprocess/pdf.mts` で、Microsoft Graph API を使って DOCX を PDF に変換する。
  - エラー時も best-effort で処理を継続し、生成できた PDF や、あるいは DOCX だけでも成果物ブランチへの公開を続行する。
- `get-refresh-token.sh` で PDF 変換用の初回のリフレッシュトークンを取得する。

## コード規約

- 一回しか使われない関数や変数は切り出さずにインラインで書けるか検討すること。
- 一行で書けるものは一行で書けないか検討すること。
- 命名規則
  - パスを表す名前には `path` を使う。`path = dir + file` である。
  - ディレクトリを表す名前には `dir` を使う。
  - ファイルを表す名前には `file` を使う。`file = name + ext` である。
  - 拡張子を含まない名前には `name` を使う。
  - 拡張子を表す名前には `ext` を使う。

## 検証

変更内容に応じて、以下を実行する。

```sh
mise exec -- actionlint .github/workflows/*.yml
git diff --check
sh -n build.sh
mise exec -- ./build.sh 'sample/[0-9]*.md' dist/with-config.docx --defaults=sample/defaults.yml
mise exec -- ./build.sh 'sample/[0-9]*.md' dist/sample.docx
mise exec -- ./build.sh 'sample/[0-9]*.md' dist/no-postprocess.docx --no-postprocess
unzip -t dist/with-config.docx
unzip -t dist/sample.docx
unzip -t dist/no-postprocess.docx
```
