# pandoc-ja-docx

ルビ・傍点・セクション区切りなどに対応した、日本語組版向けPandoc Word変換共通ワークフロー

## GitHub Actions で使う

呼び出し側のリポジトリでは、Markdown をフォルダに置く。変換対象は
`input_folder` 内の `[0-9]*.md` である。
このリポジトリ側の共通設定は `defaults.yml` にあり、呼び出し側の `config`
に指定した Pandoc defaults と実行時にマージする。

```yaml
name: Build DOCX

on:
  push:
    branches:
      - main

permissions:
  contents: write

jobs:
  build:
    uses: kyonenya/pandoc-jp-docx/.github/workflows/docx.yml@v1
    with:
      input_folder: sample
      output_name: single-with-toc
      config: defaults.yml
      shared_ref: v1
```

`output_name` は必須である。生成先は `dist/<output_name>.docx` である。
`config` は省略できる。

```yaml
jobs:
  build:
    uses: kyonenya/pandoc-jp-docx/.github/workflows/docx.yml@v1
    with:
      input_folder: sample
      output_name: sample
      shared_ref: v1
```

`config` は Pandoc の defaults ファイルである。省略できる。

```yaml
toc: true
number-sections: true
metadata:
  title: サンプル
```

呼び出し側リポジトリの `reference.docx` を使う場合は、呼び出し側の
defaults で `reference-doc` を指定する。相対パスを defaults ファイル基準で
解決するため、`${.}` を使う。

```yaml
reference-doc: ${.}/reference.docx
```

`reference-doc: reference.docx` と書くと、実行ディレクトリ基準で共有側の
`reference.docx` が参照される場合がある。

複数の DOCX を生成する場合は job を分けて呼び出す。

```yaml
jobs:
  with-toc:
    uses: kyonenya/pandoc-jp-docx/.github/workflows/docx.yml@v1
    with:
      input_folder: sample
      output_name: with-toc
      config: defaults.yml
      shared_ref: v1

  no-toc:
    uses: kyonenya/pandoc-jp-docx/.github/workflows/docx.yml@v1
    with:
      input_folder: sample
      output_name: no-toc
      shared_ref: v1
```

生成物は `<caller ref>_pandoc-<name>` ブランチへ publish される。

テスト用 workflow は `.github/workflows/_sample.yml` に置いている。

## ローカルで使う

ローカルでは後処理込みの `build.sh` を使う。

```sh
./build.sh sample sample
```

caller defaults を渡すこともできる。

```sh
./build.sh sample with-toc sample/defaults.yml
```

Pandoc 変換部分は `build-pandoc.sh` に集約している。このスクリプトは
ローカル用 `build.sh` と GitHub Actions の両方から呼び出す。
