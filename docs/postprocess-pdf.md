# PDF 出力の設定

生成した DOCX を Microsoft Graph API で個人用 OneDrive に一時アップロードし、PDF としてダウンロードする。

## Entra アプリを登録する

Microsoft Entra 管理センターでアプリを登録する。

- 名前: `pandoc-jp-docx`
- サポートされているアカウントの種類: 個人用 Microsoft アカウントのみ
- リダイレクト URI: なし
- パブリック クライアント フローを許可する: はい
- Microsoft Graph の委任されたアクセス許可: `Files.ReadWrite.AppFolder`
- （クライアントシークレットは作成しない）

登録後、アプリケーション ID （クライアント ID）をコピーして呼び出し側リポジトリの Secrets に登録する。

```bash
gh secret set MS_CLIENT_ID --repo 'owner/repository'
```

## リフレッシュトークンを取得する

`curl` と `jq` をインストールし、次のコマンドをクライアント ID を書き換えて実行する。

```bash
bash <<'SH'
MS_CLIENT_ID='<クライアントID>'

set -euo pipefail

: "${MS_CLIENT_ID:?Set MS_CLIENT_ID}"
auth_url='https://login.microsoftonline.com/consumers/oauth2/v2.0'
response=$(curl --fail --silent --show-error \
  --data-urlencode "client_id=$MS_CLIENT_ID" \
  --data-urlencode 'scope=https://graph.microsoft.com/Files.ReadWrite.AppFolder offline_access' \
  "$auth_url/devicecode")

jq -r '.message' <<<"$response" >&2
device_code=$(jq -r '.device_code' <<<"$response")
interval=$(jq -r '.interval // 5' <<<"$response")

while true; do
  sleep "$interval"
  response=$(curl --silent --show-error \
    --data-urlencode "client_id=$MS_CLIENT_ID" \
    --data-urlencode "device_code=$device_code" \
    --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:device_code' \
    "$auth_url/token")

  case $(jq -r '.error // empty' <<<"$response") in
    '') jq -er '.refresh_token' <<<"$response"; break ;;
    authorization_pending) ;;
    slow_down) interval=$((interval + 5)) ;;
    *) jq -r '.error_description // .error' <<<"$response" >&2; exit 1 ;;
  esac
done
SH
```

表示された URL を開いてコードを入力し、PDF 変換に使う個人 Microsoft アカウントでサインインする。

認証完了後、標準出力に表示されたリフレッシュトークンをコピーして呼び出し側リポジトリの Secrets に登録する。

```bash
gh secret set MS_REFRESH_TOKEN --repo 'owner/repository'
```

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

作成後、PAT を各呼び出し側リポジトリへ登録する。

```sh
gh secret set GH_SECRETS_WRITE_PAT --repo 'owner/repository'
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

PDF 変換時に Microsoft から新しいリフレッシュトークンを取得し、呼び出し側リポジトリの `MS_REFRESH_TOKEN` が自動更新される。

`MS_REFRESH_TOKEN` 自体が無効になった場合は初回認証と同じコマンドを再実行して更新すること。

### エラー時の挙動

- PDF 変換に失敗した場合、workflow はエラーを表示して DOCX だけを成果物ブランチへ出力する
- OneDrive 上の DOCX をごみ箱へ移動できなかった場合もエラーを表示するが、成果物の出力は続行する
- `GH_SECRETS_WRITE_PAT` が未設定または無効な場合や、GitHub Secret の更新に
失敗した場合は警告を表示する。取得済みのアクセストークンによる PDF 変換と
成果物の公開は続行する
