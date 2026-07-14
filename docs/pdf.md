# PDF 出力の設定

生成した DOCX を Microsoft Graph API で個人用 OneDrive に一時アップロードし、
PDF としてダウンロードする。

## Entra アプリを登録する

Microsoft Entra 管理センターでアプリを登録する。

- 名前: `pandoc-jp-docx`
- サポートされているアカウントの種類: 個人用 Microsoft アカウントのみ
- リダイレクト URI: なし
- パブリック クライアント フローを許可する: はい
- Microsoft Graph の委任されたアクセス許可: `Files.ReadWrite`

クライアントシークレットは作成しない。

登録後、アプリケーション（クライアント）IDを控える。

## リフレッシュトークンを取得する

このリポジトリで、次のコマンドを実行する。

```sh
ONEDRIVE_CLIENT_ID='<クライアントID>' \
  node get-refresh-token.mts
```

表示された URL を開いてコードを入力し、PDF 変換に使う個人 Microsoft
アカウントでサインインする。認証が完了すると、標準出力にリフレッシュトークンが
出力される。

リフレッシュトークンを画面へ表示せず、呼び出し側リポジトリの Secret へ直接
登録する場合は次のように実行する。

```sh
ONEDRIVE_CLIENT_ID='<クライアントID>' \
  node get-refresh-token.mts \
  | gh secret set ONEDRIVE_REFRESH_TOKEN --repo '<owner/repository>'
```

クライアント ID も呼び出し側リポジトリに登録する。

```sh
gh secret set ONEDRIVE_CLIENT_ID \
  --repo '<owner/repository>' \
  --body '<クライアントID>'
```

クライアント ID は秘密情報ではないが、reusable workflow へ渡す値を揃えるため
Secret として扱う。リフレッシュトークンはリポジトリや `.env` に保存しない。

## Reusable workflow を呼び出す

```yaml
jobs:
  build:
    uses: kyonenya/pandoc-jp-docx/.github/workflows/docx.yml@v2
    with:
      input_pattern: sample/[0-9]*.md
      output_name: output
      pdf: true
    secrets:
      onedrive_client_id: ${{ secrets.ONEDRIVE_CLIENT_ID }}
      onedrive_refresh_token: ${{ secrets.ONEDRIVE_REFRESH_TOKEN }}
```

PDF 変換に失敗した場合、workflow はエラーを表示して DOCX だけを成果物ブランチへ
出力する。OneDrive 上の DOCX の完全削除に失敗した場合もエラーを表示するが、
成果物の出力は続行する。

## トークンを更新する

リフレッシュトークンが無効になった場合は、初回認証と同じコマンドを再実行し、
呼び出し側リポジトリの `ONEDRIVE_REFRESH_TOKEN` を更新する。
