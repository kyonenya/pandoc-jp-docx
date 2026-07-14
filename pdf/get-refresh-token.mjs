import { pollDeviceCode, requestDeviceCode } from './graph.mjs';

const clientId = process.env.ONEDRIVE_CLIENT_ID;

if (clientId === undefined || clientId === '') {
  console.error('ONEDRIVE_CLIENT_IDを設定してください');
  process.exitCode = 1;
} else {
  try {
    const deviceCode = await requestDeviceCode(clientId);

    console.error(deviceCode.message);

    const token = await pollDeviceCode(clientId, deviceCode.device_code, {
      expiresIn: deviceCode.expires_in,
      interval: deviceCode.interval,
    });

    process.stdout.write(`${token.refresh_token}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
