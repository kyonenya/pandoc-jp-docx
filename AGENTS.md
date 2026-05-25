# AGENTS.md

- 応答は日本語で行う。
- README やサンプル本文は、既存の文体に合わせて「だ・である調」で書く。
- 変更前に `rg` / `rg --files` で既存構成を確認し、無関係な差分や staged 済みの変更は戻さない。
- 手編集は原則 `apply_patch` を使う。

## このリポジトリの構成

- 公開 reusable workflow は `.github/workflows/docx.yml` である。
- リポジトリ内検証 workflow は `.github/workflows/_sample.yml` である。
- shared 側の Pandoc defaults はルートの `defaults.yml` である。`defaults/docx.yml` は使わない。
- fixture 入力は `sample/` に置く。変換対象 Markdown は `[0-9]*.md` である。

## スクリプトの役割

- `build-pandoc.sh` はローカルと GitHub Actions の共通処理である。Pandoc 実行をここに集約する。
- `build.sh` はローカル用ラッパーである。`build-pandoc.sh` を呼び、その後 `postprocess/numbering.sh` を実行する。
- `build-pandoc.sh` の引数順は `input_folder output_file [config]` である。`output_file` は必須であり、`config` は第3引数である。
- `build.sh` の引数順は `input_folder output_name [config]` である。`output_name` は必須であり、`dist/<output_name>.docx` に出力する。
- workflow 側は `output_name` から `dist/<output_name>.docx` を組み立て、`build-pandoc.sh` へ渡す。

## 検証

変更内容に応じて、以下を実行する。

```sh
mise exec -- actionlint .github/workflows/*.yml
git diff --check
sh -n build-pandoc.sh
sh -n build.sh
mise exec -- ./build.sh sample fixture-with-toc sample/defaults.yml
mise exec -- ./build.sh sample sample
unzip -t dist/fixture-with-toc.docx
unzip -t dist/sample.docx
```
