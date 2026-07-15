/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

async function ok(response: Response, operation: string): Promise<Response> {
  if (response.ok) return response;

  const body: {
    error?: string /* OAuth */ | { message?: string } /* Graph API */;
    error_description?: string; // OAuth
  } | null = await response.json().catch(() => null);
  const message =
    body?.error_description ??
    (typeof body?.error === 'string' ? body.error : body?.error?.message) ??
    `HTTP ${response.status}`;

  throw new Error(`Failed to ${operation}: ${message}`);
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

function oauthRequest(
  clientId: string,
  refreshToken: string,
): Promise<Response> {
  return fetch(
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
  }>(await oauthRequest(clientId, refreshToken), 'get an access token');
  if (refreshTokenOutputPath) {
    if (!refresh_token) {
      console.error(
        'The authentication response has no new refresh token; automatic refresh is disabled',
      );
    } else {
      try {
        await mkdir(dirname(refreshTokenOutputPath), { recursive: true });
        await writeFile(refreshTokenOutputPath, refresh_token, {
          mode: 0o600,
        });
      } catch (error) {
        console.error(
          `Could not save the refresh token; automatic refresh is disabled: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
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
    'get the OneDrive app folder',
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
    'upload the DOCX',
  );
  try {
    const pdf = await ok(
      await graphRequest(
        `/me/drive/items/${encodeURIComponent(itemId)}/content?format=pdf`,
        {},
        access_token,
      ),
      'convert to PDF',
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
        'delete the uploaded DOCX',
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
  console.error('Set MS_CLIENT_ID');
  process.exit(1);
}
if (!refreshToken) {
  console.error('Set MS_REFRESH_TOKEN');
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
