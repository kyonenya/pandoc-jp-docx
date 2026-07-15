# pandoc-ja-docx

ルビ・傍点・セクション区切りなどに対応した、日本語組版向け Word 文書を [Pandoc](https://github.com/jgm/pandoc) で変換するためのワークフロー

GitHub Actions、およびローカルの両方で使用できる。

## スタイル

### ルビ

青空文庫記法のルビを Word のルビに変換する。

`｜振《ふ》り｜仮名《がな》` → <ruby>振<rt>ふ</rt></ruby>り<ruby>仮名<rt>がな</rt></ruby>

脚注内のルビも同じ記法で書ける。

### 傍点

日本語を含む \*\*<ruby>強<rt>・</rt>調<rt>・</rt>テ<rt>・</rt>キ<rt>・</rt>ス<rt>・</rt>ト<rt>・</rt></ruby>\*\* を丸傍点に変換する。

日本語を含まない \*\***strong text**\*\* はデフォルトのまま太字で出力する。

### 改ページ・セクション区切り

フェンス付き div で、Word の改ページまたはセクション区切りを挿入できる。

改ページ

```md
::: {.page-break}
:::
```

セクション区切り（次ページから）

```md
::: {.section-break type="nextPage"}
:::
```

セクション区切り（奇数ページから）

```md
::: {.section-break type="oddPage"}
:::
```

セクション区切り（偶数ページから）

```md
::: {.section-break type="evenPage"}
:::
```

### 半角幅の固定

セクション記号 `§`、プライム記号 `′` `″` `‴` は必ず半角幅で表示させる。

（デフォルトだと英数字隣接時は半角表示されるが、日本語隣接時に全角表示されてしまう）

### 箇条書き・番号付きリスト

箇条書きと番号付きリストは日本語で 2 文字分のインデント幅になるよう後処理する。

（Pandoc では reference.docx でリストスタイルを指定できないため後処理をかけている）

## GitHub Actions での使い方

呼び出し側のリポジトリの `.github/workflows/` 以下に YAML ファイルを作成する。

```yaml
# pandoc-docx.yml
name: Build DOCX

on:
  push:
    branches:
      - main

permissions:
  contents: write

jobs:
  build:
    uses: kyonenya/pandoc-jp-docx/.github/workflows/docx.yml@v2
    with:
      input_pattern: sample/[0-9]*.md
      output_name: output
      defaults: defaults.yml # 省略可
```

- `input_pattern` に指定した glob パターンにマッチする Markdown ファイルを処理する
  - 単一フォルダを対象にする場合は
`sample/[0-9]*.md`、ネストされたフォルダを対象にする場合は `[A-Z]*/[0-9]*.md`
のように指定する
- `output_name` で出力する docx ファイルの名前を指定する
  - `<output_name>.docx` として出力される
  - 出力されたファイルは、main ブランチで実行した場合 `main_pandoc-<output_name>` ブランチにプッシュされる
- `defaults` に Pandoc defaults ファイルを指定できる
  - コンパイル時にこのリポジトリ側の共通 defaults ファイルとマージされる
  - 呼び出し側リポジトリの reference.docx を使う場合は、呼び出し側の defaults ファイルで `reference-doc: ${.}/reference.docx` を指定する

### PDF も出力する

生成した DOCX を PDF に変換できる。個人用 OneDrive アカウントと Microsoft Graph API を使用する。

```yaml
jobs:
  build:
    uses: kyonenya/pandoc-jp-docx/.github/workflows/docx.yml@v2
    with:
      input_pattern: sample/[0-9]*.md
      output_name: output
      pdf: true
    secrets:
      ms_client_id: ${{ secrets.MS_CLIENT_ID }}
      ms_refresh_token: ${{ secrets.MS_REFRESH_TOKEN }}
      gh_secrets_write_pat: ${{ secrets.GH_SECRETS_WRITE_PAT }}
```

- `pdf` が `true` の場合、`<output_name>.pdf` を出力する

Entra アプリの登録とリフレッシュトークンの取得方法は [PDF 出力の設定](docs/postprocess-pdf.md) を参照のこと。

## ローカルでの使い方

`build.sh` を実行する。

```sh
./build.sh 'sample/[0-9]*.md' dist/sample.docx
```

```sh
./build.sh 'sample/[0-9]*.md' dist/with-config.docx --defaults=sample/defaults.yml
```

[Pandoc をインストール](https://github.com/jgm/pandoc/blob/main/INSTALL.md) しておく必要がある。
