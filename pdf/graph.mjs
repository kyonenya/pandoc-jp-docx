import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const authUrl = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const graphUrl = 'https://graph.microsoft.com/v1.0';
const scope = 'https://graph.microsoft.com/Files.ReadWrite offline_access';

const defaultWait = (duration) =>
  new Promise((resolve) => setTimeout(resolve, duration));

const getErrorMessage = (body, fallback) =>
  body?.error_description ?? body?.error?.message ?? body?.error ?? fallback;

const readJson = async (response) => {
  const text = await response.text();

  if (text === '') {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

const postForm = (fetchImpl, url, values) =>
  fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(values),
  });

const graphRequest = (fetchImpl, accessToken, path, options = {}) =>
  fetchImpl(`${graphUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

const expectJson = async (response, operation) => {
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      `${operation}: ${getErrorMessage(body, `HTTP ${response.status}`)}`,
    );
  }

  return body;
};

export const requestDeviceCode = async (clientId, { fetchImpl = fetch } = {}) => {
  const response = await postForm(fetchImpl, `${authUrl}/devicecode`, {
    client_id: clientId,
    scope,
  });

  return expectJson(response, 'デバイスコードの取得に失敗しました');
};

export const pollDeviceCode = async (
  clientId,
  deviceCode,
  {
    expiresIn,
    interval = 5,
    fetchImpl = fetch,
    waitImpl = defaultWait,
    nowImpl = Date.now,
  } = {},
) => {
  const expiresAt = nowImpl() + expiresIn * 1000;
  let intervalSeconds = interval;

  while (nowImpl() < expiresAt) {
    await waitImpl(intervalSeconds * 1000);

    const response = await postForm(fetchImpl, `${authUrl}/token`, {
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    const body = await readJson(response);

    if (response.ok) {
      if (typeof body?.refresh_token !== 'string') {
        throw new Error('認証応答にリフレッシュトークンがありません');
      }

      return body;
    }

    if (body?.error === 'authorization_pending') {
      continue;
    }

    if (body?.error === 'slow_down') {
      intervalSeconds += 5;
      continue;
    }

    throw new Error(
      `認証に失敗しました: ${getErrorMessage(body, `HTTP ${response.status}`)}`,
    );
  }

  throw new Error('デバイスコードの有効期限が切れました');
};

export const getAccessToken = async (
  clientId,
  refreshToken,
  { fetchImpl = fetch } = {},
) => {
  const response = await postForm(fetchImpl, `${authUrl}/token`, {
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope,
  });
  const body = await expectJson(
    response,
    'アクセストークンの取得に失敗しました',
  );

  if (typeof body?.access_token !== 'string') {
    throw new Error('認証応答にアクセストークンがありません');
  }

  return body.access_token;
};

const getAppRootId = async (accessToken, fetchImpl) => {
  const response = await graphRequest(
    fetchImpl,
    accessToken,
    '/me/drive/special/approot?$select=id',
  );
  const body = await expectJson(
    response,
    'OneDriveのアプリフォルダ取得に失敗しました',
  );

  if (typeof body?.id !== 'string') {
    throw new Error('OneDriveのアプリフォルダIDを取得できませんでした');
  }

  return body.id;
};

const uploadDocx = async (
  accessToken,
  appRootId,
  remoteFile,
  content,
  fetchImpl,
) => {
  const path = `/me/drive/items/${encodeURIComponent(appRootId)}:/${encodeURIComponent(remoteFile)}:/content`;
  const response = await graphRequest(fetchImpl, accessToken, path, {
    method: 'PUT',
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    body: content,
  });
  const body = await expectJson(response, 'DOCXのアップロードに失敗しました');

  if (typeof body?.id !== 'string') {
    throw new Error('アップロードしたDOCXのアイテムIDを取得できませんでした');
  }

  return body;
};

const getDriveId = async (accessToken, uploadedItem, fetchImpl) => {
  if (typeof uploadedItem.parentReference?.driveId === 'string') {
    return uploadedItem.parentReference.driveId;
  }

  const response = await graphRequest(
    fetchImpl,
    accessToken,
    '/me/drive?$select=id',
  );
  const body = await expectJson(response, 'OneDriveのドライブID取得に失敗しました');

  if (typeof body?.id !== 'string') {
    throw new Error('OneDriveのドライブIDを取得できませんでした');
  }

  return body.id;
};

const downloadPdf = async (accessToken, itemId, fetchImpl) => {
  const response = await graphRequest(
    fetchImpl,
    accessToken,
    `/me/drive/items/${encodeURIComponent(itemId)}/content?format=pdf`,
  );

  if (!response.ok) {
    const body = await readJson(response);
    throw new Error(
      `PDF変換に失敗しました: ${getErrorMessage(body, `HTTP ${response.status}`)}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
};

const permanentlyDelete = async (
  accessToken,
  driveId,
  itemId,
  fetchImpl,
) => {
  const response = await graphRequest(
    fetchImpl,
    accessToken,
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/permanentDelete`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const body = await readJson(response);
    throw new Error(
      `アップロードしたDOCXの完全削除に失敗しました: ${getErrorMessage(body, `HTTP ${response.status}`)}`,
    );
  }
};

export const convertDocxToPdf = async (
  {
    clientId,
    refreshToken,
    inputPath,
    outputPath,
  },
  {
    fetchImpl = fetch,
    randomUUIDImpl = randomUUID,
    readFileImpl = readFile,
    writeFileImpl = writeFile,
    mkdirImpl = mkdir,
    logger = console,
  } = {},
) => {
  const content = await readFileImpl(inputPath);
  const accessToken = await getAccessToken(clientId, refreshToken, {
    fetchImpl,
  });
  const appRootId = await getAppRootId(accessToken, fetchImpl);
  const remoteFile = `${randomUUIDImpl()}.docx`;
  let uploadedItem;
  let driveId;

  try {
    uploadedItem = await uploadDocx(
      accessToken,
      appRootId,
      remoteFile,
      content,
      fetchImpl,
    );
    driveId = await getDriveId(accessToken, uploadedItem, fetchImpl);

    const pdf = await downloadPdf(accessToken, uploadedItem.id, fetchImpl);
    await mkdirImpl(dirname(outputPath), { recursive: true });
    await writeFileImpl(outputPath, pdf);
  } finally {
    if (uploadedItem !== undefined) {
      try {
        driveId ??= await getDriveId(accessToken, uploadedItem, fetchImpl);
        await permanentlyDelete(
          accessToken,
          driveId,
          uploadedItem.id,
          fetchImpl,
        );
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
      }
    }
  }
};
