import { convertDocxToPdf } from './graph.mjs';

const usage = `Usage: ${process.argv[1]} input_path output_path`;
const [, , inputPath, outputPath, ...extra] = process.argv;
const clientId = process.env.ONEDRIVE_CLIENT_ID;
const refreshToken = process.env.ONEDRIVE_REFRESH_TOKEN;

if (inputPath === undefined || outputPath === undefined || extra.length > 0) {
  console.error(usage);
  process.exitCode = 1;
} else if (clientId === undefined || clientId === '') {
  console.error('ONEDRIVE_CLIENT_IDを設定してください');
  process.exitCode = 1;
} else if (refreshToken === undefined || refreshToken === '') {
  console.error('ONEDRIVE_REFRESH_TOKENを設定してください');
  process.exitCode = 1;
} else {
  try {
    await convertDocxToPdf({
      clientId,
      refreshToken,
      inputPath,
      outputPath,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
