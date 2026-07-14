/// <reference types="node" />

interface ResponseBody {
  device_code?: unknown;
  error?: string | { message?: string };
  error_description?: string;
  expires_in?: unknown;
  interval?: unknown;
  message?: unknown;
  refresh_token?: unknown;
}

const AUTH_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';

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

async function main(clientId: string): Promise<void> {
  const response = await fetch(`${AUTH_URL}/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope: 'https://graph.microsoft.com/Files.ReadWrite offline_access',
    }),
  });
  const body = await responseBody(response);
  if (!response.ok) {
    throw new Error(
      `デバイスコードの取得に失敗しました: ${errorMessage(body, `HTTP ${response.status}`)}`,
    );
  }
  if (
    typeof body.message !== 'string' ||
    typeof body.device_code !== 'string' ||
    typeof body.expires_in !== 'number'
  ) {
    throw new Error('デバイスコードの応答が不正です');
  }

  console.error(body.message);
  const deviceCode = body.device_code;
  const expiresAt = Date.now() + body.expires_in * 1000;
  const pollToken = async (intervalSeconds: number): Promise<string> => {
    if (Date.now() >= expiresAt) {
      throw new Error('デバイスコードの有効期限が切れました');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
    const response = await fetch(`${AUTH_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const body = await responseBody(response);

    if (response.ok) {
      if (typeof body.refresh_token !== 'string') {
        throw new Error('認証応答にリフレッシュトークンがありません');
      }
      return body.refresh_token;
    }
    if (body.error === 'authorization_pending')
      return pollToken(intervalSeconds);
    if (body.error === 'slow_down') return pollToken(intervalSeconds + 5);
    throw new Error(
      `認証に失敗しました: ${errorMessage(body, `HTTP ${response.status}`)}`,
    );
  };

  const refreshToken = await pollToken(
    typeof body.interval === 'number' ? body.interval : 5,
  );
  process.stdout.write(`${refreshToken}\n`);
}

const clientId = process.env.MS_CLIENT_ID;
if (!clientId) {
  console.error('MS_CLIENT_IDを設定してください');
  process.exit(1);
}

try {
  await main(clientId);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
