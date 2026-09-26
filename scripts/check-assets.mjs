import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const requiredAssets = [
  {
    path: path.join(projectRoot, 'public', 'models', 'face_landmarker.task'),
    name: 'Model asset (public/models/face_landmarker.task)',
    minSize: 3000000,
  },
  {
    path: path.join(projectRoot, 'public', 'mediapipe', 'wasm', 'vision_wasm_internal.wasm'),
    name: 'WASM binaries (public/mediapipe/wasm/vision_wasm_internal.wasm)',
    minSize: 100000,
  },
];

let hasError = false;
const missingAssets = [];

for (const asset of requiredAssets) {
  if (!fs.existsSync(asset.path)) {
    hasError = true;
    missingAssets.push(`${asset.name} [MISSING]`);
  } else {
    const stat = fs.statSync(asset.path);
    if (stat.size < asset.minSize) {
      hasError = true;
      missingAssets.push(`${asset.name} [INVALID SIZE: ${stat.size} bytes]`);
    }
  }
}

if (hasError) {
  console.error('\n=============================================================');
  console.error('❌ [EyeSpeak Error] Missing or incomplete local runtime assets!');
  console.error('=============================================================');
  console.error('The following required assets are missing:');
  missingAssets.forEach((m) => console.error(`  - ${m}`));
  console.error('\nEyeSpeak requires local model and WASM binaries to guarantee offline');
  console.error('zero-network-request operation during runtime.\n');
  console.error('👉 Please run the following command to prepare the assets:');
  console.error('   npm run setup:assets\n');
  console.error('=============================================================\n');
  process.exit(1);
}

// All required assets exist
