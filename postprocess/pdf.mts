/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface ResponseBody {
  access_token?: unknown;
  error?: string | { message?: string };
  error_description?: string;
  id?: unknown;
  parentReference?: { driveId?: unknown };
}

function errorMessage(body: ResponseBody, fallback: string): string {
  if (body.error_description) return body.error_description;
  if (typeof body.error === 'string') return body.error;
  return body.error?.message ?? fallback;
}

async function responseBody(response: Response): Promise<ResponseBody> {
  const text = await response.text();
  if (text === '') return {};

  try {
    return JSON.parse(text) as ResponseBody;
  } catch {
    return { error: text };
  }
}

async function expectedBody(
  response: Response,
  operation: string,
): Promise<ResponseBody> {
  const body = await responseBody(response);
  if (!response.ok) {
    throw new Error(
      `${operation}: ${errorMessage(body, `HTTP ${response.status}`)}`,
    );
  }
  return body;
}

async function main(
  inputPath: string,
  outputPath: string,
  clientId: string,
  refreshToken: string,
): Promise<void> {
  const tokenResponse = await fetch(
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
  );
  const tokenBody = await expectedBody(
    tokenResponse,
    'アクセストークンの取得に失敗しました',
  );
  if (typeof tokenBody.access_token !== 'string') {
    throw new Error('認証応答にアクセストークンがありません');
  }

  const accessToken = tokenBody.access_token;
  const graphRequest = (path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...options,
      headers,
    });
  };
  const getDriveId = async () => {
    const response = await graphRequest('/me/drive?$select=id');
    const body = await expectedBody(
      response,
      'OneDriveのドライブID取得に失敗しました',
    );
    if (typeof body.id !== 'string') {
      throw new Error('OneDriveのドライブIDを取得できませんでした');
    }
    return body.id;
  };

  const appRootResponse = await graphRequest(
    '/me/drive/special/approot?$select=id',
  );
  const appRootBody = await expectedBody(
    appRootResponse,
    'OneDriveのアプリフォルダ取得に失敗しました',
  );
  if (typeof appRootBody.id !== 'string') {
    throw new Error('OneDriveのアプリフォルダIDを取得できませんでした');
  }

  const uploadResponse = await graphRequest(
    `/me/drive/items/${encodeURIComponent(appRootBody.id)}:/${randomUUID()}.docx:/content`,
    {
      method: 'PUT',
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      body: Uint8Array.from(await readFile(inputPath)),
    },
  );
  const uploadBody = await expectedBody(
    uploadResponse,
    'DOCXのアップロードに失敗しました',
  );
  if (typeof uploadBody.id !== 'string') {
    throw new Error('アップロードしたDOCXのアイテムIDを取得できませんでした');
  }

  const itemId = uploadBody.id;
  const driveId =
    typeof uploadBody.parentReference?.driveId === 'string'
      ? uploadBody.parentReference.driveId
      : undefined;
  try {
    const pdfResponse = await graphRequest(
      `/me/drive/items/${encodeURIComponent(itemId)}/content?format=pdf`,
    );
    if (!pdfResponse.ok) {
      const body = await responseBody(pdfResponse);
      throw new Error(
        `PDF変換に失敗しました: ${errorMessage(body, `HTTP ${pdfResponse.status}`)}`,
      );
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Buffer.from(await pdfResponse.arrayBuffer()));
  } finally {
    try {
      const deleteDriveId = driveId ?? (await getDriveId());
      const deleteResponse = await graphRequest(
        `/drives/${encodeURIComponent(deleteDriveId)}/items/${encodeURIComponent(itemId)}/permanentDelete`,
        { method: 'POST', headers: { Accept: 'application/json' } },
      );
      await expectedBody(
        deleteResponse,
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
  await main(args[0], args[1], clientId, refreshToken);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
