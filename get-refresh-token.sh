#!/usr/bin/env bash

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
