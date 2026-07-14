import assert from 'node:assert/strict';
import test from 'node:test';

import {
  convertDocxToPdf,
  getAccessToken,
  pollDeviceCode,
  requestDeviceCode,
} from './graph.mjs';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

test('デバイスコード取得時に個人アカウント用scopeを要求する', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return jsonResponse({
      device_code: 'device-code',
      expires_in: 900,
      interval: 5,
      message: 'Sign in',
    });
  };

  await requestDeviceCode('client-id', { fetchImpl });

  assert.equal(
    request.url,
    'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode',
  );
  assert.equal(request.options.body.get('client_id'), 'client-id');
  assert.equal(
    request.options.body.get('scope'),
    'https://graph.microsoft.com/Files.ReadWrite offline_access',
  );
});

test('デバイス認証の完了までポーリングする', async () => {
  const waits = [];
  const responses = [
    jsonResponse({ error: 'authorization_pending' }, 400),
    jsonResponse({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    }),
  ];
  const fetchImpl = async () => responses.shift();

  const token = await pollDeviceCode('client-id', 'device-code', {
    expiresIn: 900,
    interval: 2,
    fetchImpl,
    waitImpl: async (duration) => waits.push(duration),
    nowImpl: () => 0,
  });

  assert.equal(token.refresh_token, 'refresh-token');
  assert.deepEqual(waits, [2000, 2000]);
});

test('固定リフレッシュトークンからアクセストークンだけを返す', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return jsonResponse({
      access_token: 'access-token',
      refresh_token: 'rotated-refresh-token',
    });
  };

  const accessToken = await getAccessToken('client-id', 'refresh-token', {
    fetchImpl,
  });

  assert.equal(accessToken, 'access-token');
  assert.equal(request.options.body.get('refresh_token'), 'refresh-token');
  assert.equal(request.options.body.get('grant_type'), 'refresh_token');
});

const createConversion = (responses) => {
  const requests = [];
  const writes = [];
  const directories = [];
  const errors = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    const response = responses.shift();

    assert.notEqual(response, undefined, `Unexpected request: ${url}`);
    return response;
  };
  const run = () =>
    convertDocxToPdf(
      {
        clientId: 'client-id',
        refreshToken: 'refresh-token',
        inputPath: 'dist/input.docx',
        outputPath: 'dist/output.pdf',
      },
      {
        fetchImpl,
        randomUUIDImpl: () => 'remote-id',
        readFileImpl: async () => Buffer.from('docx'),
        writeFileImpl: async (path, content) => writes.push({ path, content }),
        mkdirImpl: async (path, options) =>
          directories.push({ path, options }),
        logger: {
          error: (message) => errors.push(message),
        },
      },
    );

  return { run, requests, writes, directories, errors };
};

const tokenResponse = () => jsonResponse({ access_token: 'access-token' });
const appRootResponse = () => jsonResponse({ id: 'app-root-id' });
const uploadResponse = () =>
  jsonResponse({
    id: 'item-id',
    parentReference: {
      driveId: 'drive-id',
    },
  });
const pdfResponse = () => new Response(Buffer.from('pdf'));
const deleteResponse = () => new Response(null, { status: 204 });

test('DOCXをPDFへ変換してからアップロード済みファイルを完全削除する', async () => {
  const conversion = createConversion([
    tokenResponse(),
    appRootResponse(),
    uploadResponse(),
    pdfResponse(),
    deleteResponse(),
  ]);

  await conversion.run();

  assert.equal(conversion.requests.length, 5);
  assert.match(conversion.requests[2].url, /remote-id\.docx:\/content$/);
  assert.match(conversion.requests[3].url, /item-id\/content\?format=pdf$/);
  assert.match(
    conversion.requests[4].url,
    /drives\/drive-id\/items\/item-id\/permanentDelete$/,
  );
  assert.equal(conversion.requests[4].options.method, 'POST');
  assert.deepEqual(conversion.directories, [
    { path: 'dist', options: { recursive: true } },
  ]);
  assert.equal(conversion.writes[0].path, 'dist/output.pdf');
  assert.equal(conversion.writes[0].content.toString(), 'pdf');
  assert.deepEqual(conversion.errors, []);
});

test('PDF変換が失敗してもアップロード済みファイルを完全削除する', async () => {
  const conversion = createConversion([
    tokenResponse(),
    appRootResponse(),
    uploadResponse(),
    jsonResponse({ error: { message: 'conversion failed' } }, 500),
    deleteResponse(),
  ]);

  await assert.rejects(conversion.run(), /PDF変換に失敗しました/);

  assert.equal(conversion.requests.length, 5);
  assert.match(conversion.requests[4].url, /permanentDelete$/);
  assert.deepEqual(conversion.writes, []);
});

test('完全削除が失敗しても作成済みPDFを維持する', async () => {
  const conversion = createConversion([
    tokenResponse(),
    appRootResponse(),
    uploadResponse(),
    pdfResponse(),
    jsonResponse({ error: { message: 'delete failed' } }, 500),
  ]);

  await conversion.run();

  assert.equal(conversion.writes[0].content.toString(), 'pdf');
  assert.deepEqual(conversion.errors, [
    'アップロードしたDOCXの完全削除に失敗しました: delete failed',
  ]);
});
