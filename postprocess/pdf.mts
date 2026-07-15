/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

async function ok(response: Response, operation: string): Promise<Response> {
  if (response.ok) return response;

  const text = await response.text();
  let message = text || `HTTP ${response.status}`;
  try {
    // OAuth トークンエンドポイントは { error: string, error_description }、Graph API は { error: { message } }
    const body = JSON.parse(text);
    message =
      body.error_description ??
      (typeof body.error === 'string' ? body.error : body.error?.message) ??
      message;
  } catch {}

  throw new Error(`${operation}: ${message}`);
}

async function json<T>(response: Response, operation: string): Promise<T> {
  return (await ok(response, operation)).json() as Promise<T>;
}

function graphRequest(
  path: string,
  options: RequestInit,
  accessToken: string,
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers,
  });
}

async function main(
  inputPath: string,
  outputPath: string,
  clientId: string,
  refreshToken: string,
  refreshTokenOutputPath?: string,
): Promise<void> {
  const { access_token, refresh_token } = await json<{
    access_token: string;
    refresh_token?: string;
  }>(
    await fetch(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
          scope: 'https://graph.microsoft.com/Files.ReadWrite offline_access',
        }),
      },
    ),
    'アクセストークンの取得に失敗しました',
  );
  if (refreshTokenOutputPath) {
    if (refresh_token) {
      try {
        await mkdir(dirname(refreshTokenOutputPath), { recursive: true });
        await writeFile(refreshTokenOutputPath, refresh_token, {
          mode: 0o600,
        });
      } catch (error) {
        console.error(
          `リフレッシュトークンを一時保存できないため、自動更新できません: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      console.error(
        '認証応答に新しいリフレッシュトークンがないため、自動更新できません',
      );
    }
  }

  const {
    id: appRootId,
    parentReference: { driveId },
  } = await json<{
    id: string;
    parentReference: { driveId: string };
  }>(
    await graphRequest(
      '/me/drive/special/approot?$select=id,parentReference',
      {},
      access_token,
    ),
    'OneDriveのアプリフォルダ取得に失敗しました',
  );

  const { id: itemId } = await json<{ id: string }>(
    await graphRequest(
      `/me/drive/items/${encodeURIComponent(appRootId)}:/${randomUUID()}.docx:/content`,
      {
        method: 'PUT',
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        body: Uint8Array.from(await readFile(inputPath)),
      },
      access_token,
    ),
    'DOCXのアップロードに失敗しました',
  );
  try {
    const pdf = await ok(
      await graphRequest(
        `/me/drive/items/${encodeURIComponent(itemId)}/content?format=pdf`,
        {},
        access_token,
      ),
      'PDF変換に失敗しました',
    );

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Buffer.from(await pdf.arrayBuffer()));
  } finally {
    try {
      await ok(
        await graphRequest(
          `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/permanentDelete`,
          { method: 'POST', headers: { Accept: 'application/json' } },
          access_token,
        ),
        'アップロードしたDOCXの完全削除に失敗しました',
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
  }
}

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error(`Usage: node ${process.argv[1]} input_path output_path`);
  process.exit(2);
}

const clientId = process.env.MS_CLIENT_ID;
const refreshToken = process.env.MS_REFRESH_TOKEN;
if (!clientId) {
  console.error('MS_CLIENT_IDを設定してください');
  process.exit(1);
}
if (!refreshToken) {
  console.error('MS_REFRESH_TOKENを設定してください');
  process.exit(1);
}

try {
  await main(
    args[0],
    args[1],
    clientId,
    refreshToken,
    process.env.MS_REFRESH_TOKEN_OUTPUT_PATH,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
