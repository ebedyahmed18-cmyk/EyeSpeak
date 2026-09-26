import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const MODEL_CONFIG = {
  name: 'face_landmarker.task',
  url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
  expectedSha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
  expectedBytes: 3758596,
  destinationDir: path.join(projectRoot, 'public', 'models'),
  destinationPath: path.join(projectRoot, 'public', 'models', 'face_landmarker.task'),
};

const WASM_CONFIG = {
  sourceDir: path.join(projectRoot, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
  destinationDir: path.join(projectRoot, 'public', 'mediapipe', 'wasm'),
};

async function downloadAndVerifyModel() {
  console.log('----------------------------------------------------');
  console.log('[EyeSpeak Setup] Preparing Face Landmarker Model Asset');
  console.log(`- Source URL: ${MODEL_CONFIG.url}`);
  console.log(`- Target:     ${MODEL_CONFIG.destinationPath}`);
  console.log(`- Expected SHA-256: ${MODEL_CONFIG.expectedSha256}`);
  console.log('----------------------------------------------------');

  fs.mkdirSync(MODEL_CONFIG.destinationDir, { recursive: true });

  const tempFilePath = `${MODEL_CONFIG.destinationPath}.tmp-${Date.now()}`;
  const fileStream = fs.createWriteStream(tempFilePath);
  const hash = crypto.createHash('sha256');

  return new Promise((resolve, reject) => {
    https
      .get(MODEL_CONFIG.url, (res) => {
        if (res.statusCode !== 200) {
          fileStream.close();
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          return reject(
            new Error(`Failed to download model: HTTP ${res.statusCode} ${res.statusMessage}`)
          );
        }

        let downloadedBytes = 0;
        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          hash.update(chunk);
          fileStream.write(chunk);
        });

        res.on('end', () => {
          fileStream.end();
        });

        res.on('error', (err) => {
          fileStream.close();
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          reject(err);
        });
      })
      .on('error', (err) => {
        fileStream.close();
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        reject(err);
      });

    fileStream.on('finish', () => {
      const computedSha256 = hash.digest('hex');
      console.log(`- Downloaded: ${fs.statSync(tempFilePath).size} bytes`);
      console.log(`- Computed SHA-256: ${computedSha256}`);

      if (computedSha256 !== MODEL_CONFIG.expectedSha256) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        console.error('❌ [CRITICAL CHECKSUM MISMATCH]');
        console.error(`  Expected: ${MODEL_CONFIG.expectedSha256}`);
        console.error(`  Actual:   ${computedSha256}`);
        console.error('Aborting asset setup. Downloaded file discarded.');
        return reject(new Error('SHA-256 checksum verification failed.'));
      }

      // Rename temp file to final destination
      fs.renameSync(tempFilePath, MODEL_CONFIG.destinationPath);
      console.log('✅ Model asset verified and saved successfully.');
      resolve();
    });

    fileStream.on('error', (err) => {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      reject(err);
    });
  });
}

function copyWasmBinaries() {
  console.log('\n[EyeSpeak Setup] Copying MediaPipe WASM Binaries');
  console.log(`- Source: ${WASM_CONFIG.sourceDir}`);
  console.log(`- Target: ${WASM_CONFIG.destinationDir}`);

  if (!fs.existsSync(WASM_CONFIG.sourceDir)) {
    throw new Error(
      `MediaPipe WASM directory not found at: ${WASM_CONFIG.sourceDir}\n` +
      `Ensure you have executed 'npm install' before running 'npm run setup:assets'.`
    );
  }

  fs.mkdirSync(WASM_CONFIG.destinationDir, { recursive: true });

  const files = fs.readdirSync(WASM_CONFIG.sourceDir);
  let copiedCount = 0;

  for (const file of files) {
    const src = path.join(WASM_CONFIG.sourceDir, file);
    const dest = path.join(WASM_CONFIG.destinationDir, file);
    const stat = fs.statSync(src);

    if (stat.isFile()) {
      fs.copyFileSync(src, dest);
      copiedCount++;
      console.log(`  -> Copied ${file} (${(stat.size / 1024).toFixed(1)} KB)`);
    }
  }

  console.log(`✅ Copied ${copiedCount} WASM assets successfully.`);
}

async function main() {
  try {
    copyWasmBinaries();
    await downloadAndVerifyModel();
    console.log('\n====================================================');
    console.log('🎉 All local runtime assets prepared and verified!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ [Setup Failed]', err.message);
    process.exit(1);
  }
}

main();
