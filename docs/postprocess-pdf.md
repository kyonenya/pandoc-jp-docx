# PDF 出力の設定

生成した DOCX を Microsoft Graph API で個人用 OneDrive に一時アップロードし、PDF としてダウンロードする機能。

PDF 変換時に Microsoft から取得した新しいリフレッシュトークンをもとに、呼び出し側リポジトリの `MS_REFRESH_TOKEN` を自己更新する。

以下の3つの情報を呼び出し側リポジトリの Secrets に登録することで使用できる。

1. `MS_CLIENT_ID`: Entra アプリのクライアント ID
2. `MS_REFRESH_TOKEN`: PDF 変換に使用するリフレッシュトークン
3. `GH_SECRETS_WRITE_PAT`: GitHub Secret を更新するための PAT

## 1. Entra アプリを登録する

Microsoft Entra 管理センターでアプリを登録する。

- 名前: `pandoc-jp-docx`
- サポートされているアカウントの種類: 個人用 Microsoft アカウントのみ
- リダイレクト URI: なし
- パブリック クライアント フローを許可する: はい
- Microsoft Graph の委任されたアクセス許可: `Files.ReadWrite.AppFolder`
- （クライアントシークレットは作成しない）

登録後、アプリケーション ID （クライアント ID）をコピーして Secrets に登録する。

```bash
gh secret set MS_CLIENT_ID --repo 'owner/repository'
```

## 2. リフレッシュトークンを取得する

`curl` と `jq` をインストールし、次のコマンドをクライアント ID を書き換えたうえで実行する。

表示された URL を開いてコードを入力し、PDF 変換に使う個人 Microsoft アカウントでサインインする。

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

認証完了後、標準出力に表示されたリフレッシュトークンをコピーして Secrets に登録する。

```bash
gh secret set MS_REFRESH_TOKEN --repo 'owner/repository'
```

## 3. GitHub Secret 更新用 PAT を登録する

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
