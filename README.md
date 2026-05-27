# pandoc-ja-docx

ルビ・傍点・セクション区切りなどに対応した、日本語組版向けPandoc Word変換共通ワークフロー

## GitHub Actions で使う

呼び出し側のリポジトリでは、Markdown をフォルダに置く。変換対象は
`input_pattern` に指定した glob パターンである。単一フォルダを対象にする場合は
`sample/[0-9]*.md`、ネストしたフォルダを対象にする場合は `[A-Z]*/[0-9]*.md`
のように指定する。
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
      input_pattern: sample/[0-9]*.md
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
      input_pattern: sample/[0-9]*.md
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
      input_pattern: sample/[0-9]*.md
      output_name: with-toc
      config: defaults.yml
      shared_ref: v1

  no-toc:
    uses: kyonenya/pandoc-jp-docx/.github/workflows/docx.yml@v1
    with:
      input_pattern: sample/[0-9]*.md
      output_name: no-toc
      shared_ref: v1
```

生成物は `<caller ref>_pandoc-<name>` ブランチへ publish される。

テスト用 workflow は `.github/workflows/_sample.yml` に置いている。

## デフォルトスタイル

### 傍点

日本語を含む強調テキストは、Word の丸傍点になる。

日本語を含む <span style="text-emphasis: filled dot; -webkit-text-emphasis: filled dot;">強調テキスト</span> は傍点になる。

日本語を含まない `**strong text**` は、通常の強調のまま出力する。

### ルビ

青空文庫風のルビ記法は、Word のルビになる。

```md
｜振《ふ》り｜仮名《がな》
```

<ruby>振<rt>ふ</rt></ruby>り<ruby>仮名<rt>がな</rt></ruby>

脚注内のルビも同じ記法で書ける。

### 半角幅の固定

`§`、`′`、`″` は半角幅で表示する。

### 改ページ・セクション区切り

フェンス付き div で、Word の改ページまたはセクション区切りを挿入できる。

```md
::: {.page-break}
:::
```

```md
::: {.section-break type="nextPage"}
:::
```

`section-break` の `type` には次を指定できる。

- `nextPage`: 次ページからのセクション区切り
- `oddPage`: 奇数ページからのセクション区切り
- `evenPage`: 偶数ページからのセクション区切り

### 箇条書き・番号付きリスト

箇条書きと番号付きリストは、Word 用の既定リストスタイルにそろえる。
インデントはレベルごとに 2 文字ずつ深くなり、ぶら下げ幅は 1 文字である。

## ローカルで使う

ローカルで開発する際は `build.sh` を使う。

```sh
./build.sh 'sample/[0-9]*.md' sample
```

caller defaults を渡すこともできる。

```sh
./build.sh 'sample/[0-9]*.md' with-toc sample/defaults.yml
```
