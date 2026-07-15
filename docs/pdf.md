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

`curl` と `jq` をインストールし、このリポジトリで次のコマンドを実行する。

```sh
MS_CLIENT_ID='<クライアントID>' \
  ./get-refresh-token.sh
```

表示された URL を開いてコードを入力し、PDF 変換に使う個人 Microsoft
アカウントでサインインする。認証が完了すると、標準出力にリフレッシュトークンが
出力される。

リフレッシュトークンを画面へ表示せず、呼び出し側リポジトリの Secret へ直接
登録する場合は次のように実行する。

```sh
MS_CLIENT_ID='<クライアントID>' \
  ./get-refresh-token.sh \
  | gh secret set MS_REFRESH_TOKEN --repo '<owner/repository>'
```

クライアント ID も呼び出し側リポジトリに登録する。

```sh
gh secret set MS_CLIENT_ID \
  --repo '<owner/repository>' \
  --body '<クライアントID>'
```

クライアント ID は秘密情報ではないが、reusable workflow へ渡す値を揃えるため
Secret として扱う。リフレッシュトークンはリポジトリや `.env` に保存しない。

## GitHub Secret 更新用 PAT を登録する

呼び出し側リポジトリの `MS_REFRESH_TOKEN` を自動更新するため、
[fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
を作成する。

- Expiration: `No expiration`
- Resource owner: 呼び出し側リポジトリの owner
- Repository access: `Only select repositories`
- Selected repositories: reusable workflow を利用するリポジトリ
- Repository permissions: `Secrets` を `Read and write`

同じ resource owner の複数リポジトリで使用する場合は、1 つの PAT で対象の
リポジトリを複数選択できる。resource owner が異なる場合は owner ごとに PAT を
作成する。

作成した PAT を、各呼び出し側リポジトリへ登録する。

```sh
gh secret set GH_SECRETS_WRITE_PAT --repo '<owner/repository>'
```

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
      ms_client_id: ${{ secrets.MS_CLIENT_ID }}
      ms_refresh_token: ${{ secrets.MS_REFRESH_TOKEN }}
      gh_secrets_write_pat: ${{ secrets.GH_SECRETS_WRITE_PAT }}
```

PDF 変換に失敗した場合、workflow はエラーを表示して DOCX だけを成果物ブランチへ
出力する。OneDrive 上の DOCX の完全削除に失敗した場合もエラーを表示するが、
成果物の出力は続行する。

## トークンを更新する

PDF 変換時に Microsoft から新しいリフレッシュトークンを取得し、呼び出し側
リポジトリの `MS_REFRESH_TOKEN` を自動更新する。

`GH_SECRETS_WRITE_PAT` が未設定または無効な場合や、GitHub Secret の更新に
失敗した場合は警告を表示する。取得済みのアクセストークンによる PDF 変換と
成果物の公開は続行する。

`MS_REFRESH_TOKEN` 自体が無効になった場合は、初回認証と同じコマンドを再実行して
更新する。
