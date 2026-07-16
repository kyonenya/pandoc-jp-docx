/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

async function ok(
  responsePromise: Promise<Response>,
  operation: string,
): Promise<Response> {
  const response = await responsePromise;
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

async function json<T>(
  responsePromise: Promise<Response>,
  operation: string,
): Promise<T> {
  return (await ok(responsePromise, operation)).json() as Promise<T>;
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
        scope:
          'https://graph.microsoft.com/Files.ReadWrite.AppFolder offline_access',
      }),
    },
  );
}

async function main(
  inputPath: string,
  outputPath: string,
  clientId: string,
  refreshToken: string,
  refreshTokenOutputPath: string,
): Promise<void> {
  const { access_token, refresh_token } = await json<{
    access_token: string;
    refresh_token?: string;
  }>(oauthRequest(clientId, refreshToken), 'get an access token');

  if (!refresh_token) {
    console.error(
      'The authentication response has no new refresh token; automatic refresh is skipped',
    );
  } else {
    try {
      await mkdir(dirname(refreshTokenOutputPath), { recursive: true });
      await writeFile(refreshTokenOutputPath, refresh_token, { mode: 0o600 });
    } catch (error) {
      console.error(
        `Could not save the refresh token; automatic refresh is skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const { id: appRootId } = await json<{ id: string }>(
    graphRequest('/me/drive/special/approot?$select=id', {}, access_token),
    'get the OneDrive app folder',
  );

  const { id: itemId } = await json<{ id: string }>(
    graphRequest(
      `/me/drive/items/${encodeURIComponent(appRootId)}:/${randomUUID()}.docx:/content`,
      {
        method: 'PUT',
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        body: await readFile(inputPath),
      },
      access_token,
    ),
    'upload the DOCX',
  );
  try {
    const pdf = await ok(
      graphRequest(
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
        graphRequest(
          `/me/drive/items/${encodeURIComponent(itemId)}`,
          { method: 'DELETE' },
          access_token,
        ),
        'delete the uploaded DOCX',
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;

  console.error(`Missing environment variable: ${name}`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error(`Usage: node ${process.argv[1]} input_path output_path`);
  process.exit(2);
}
const clientId = requiredEnv('MS_CLIENT_ID');
const refreshToken = requiredEnv('MS_REFRESH_TOKEN');
const refreshTokenOutputPath = requiredEnv('MS_REFRESH_TOKEN_OUTPUT_PATH');

try {
  await main(args[0], args[1], clientId, refreshToken, refreshTokenOutputPath);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
