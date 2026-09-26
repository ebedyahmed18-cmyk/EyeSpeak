import test from 'node:test';
import assert from 'node:assert';
import {
  computeEyeGazeFeature,
  combineBilateralFeatures,
  extractGazeFeatures,
  RIGHT_EYE_LANDMARKS,
  LEFT_EYE_LANDMARKS,
  GEOMETRIC_EPSILON,
} from '../src/services/gazeFeatureExtractor.ts';
import type { NormalizedLandmark, ExtractedLandmarks } from '../src/types/vision.ts';

// Helper to construct a synthetic eye fixture
function createSyntheticEye(
  centerX: number = 0.5,
  centerY: number = 0.5,
  width: number = 0.08
) {
  const startCorner: NormalizedLandmark = { x: centerX - width / 2, y: centerY, z: 0 };
  const endCorner: NormalizedLandmark = { x: centerX + width / 2, y: centerY, z: 0 };
  const irisCenter: NormalizedLandmark = { x: centerX, y: centerY, z: 0 };
  return { startCorner, endCorner, irisCenter, width };
}

// --------------------------------------------------------------------------
// 1. Iris and Corner Landmark Mapping
// --------------------------------------------------------------------------
test('1. Iris and Corner Landmark Mapping', () => {
  assert.strictEqual(RIGHT_EYE_LANDMARKS.irisCenter, 468);
  assert.strictEqual(RIGHT_EYE_LANDMARKS.startCorner, 33);
  assert.strictEqual(RIGHT_EYE_LANDMARKS.endCorner, 133);

  assert.strictEqual(LEFT_EYE_LANDMARKS.irisCenter, 473);
  assert.strictEqual(LEFT_EYE_LANDMARKS.startCorner, 362);
  assert.strictEqual(LEFT_EYE_LANDMARKS.endCorner, 263);

  // Eyelid aperture landmarks (159, 145, 386, 374) must not be in gaze landmark mapping
  assert.strictEqual('upperRef' in RIGHT_EYE_LANDMARKS, false);
  assert.strictEqual('lowerRef' in RIGHT_EYE_LANDMARKS, false);
  assert.strictEqual('upperRef' in LEFT_EYE_LANDMARKS, false);
  assert.strictEqual('lowerRef' in LEFT_EYE_LANDMARKS, false);
});

// --------------------------------------------------------------------------
// 2. Translation Invariance
// --------------------------------------------------------------------------
test('2. Translation Invariance', () => {
  const eye = createSyntheticEye(0.4, 0.4, 0.08);
  eye.irisCenter = { x: 0.41, y: 0.395, z: 0 };

  const base = computeEyeGazeFeature(eye.irisCenter, eye.startCorner, eye.endCorner);
  assert.strictEqual(base.status, 'VALID');

  const dx = 0.25;
  const dy = -0.15;
  const shifted = computeEyeGazeFeature(
    { x: eye.irisCenter.x + dx, y: eye.irisCenter.y + dy, z: 0 },
    { x: eye.startCorner.x + dx, y: eye.startCorner.y + dy, z: 0 },
    { x: eye.endCorner.x + dx, y: eye.endCorner.y + dy, z: 0 }
  );

  assert.strictEqual(shifted.status, 'VALID');
  assert.ok(Math.abs(base.horizontalPosition! - shifted.horizontalPosition!) < 1e-6);
  assert.ok(Math.abs(base.verticalPosition! - shifted.verticalPosition!) < 1e-6);
  assert.ok(Math.abs(base.horizontalRatio! - shifted.horizontalRatio!) < 1e-6);
  assert.ok(Math.abs(base.verticalRatio! - shifted.verticalRatio!) < 1e-6);
});

// --------------------------------------------------------------------------
// 3. Scale Invariance
// --------------------------------------------------------------------------
test('3. Scale Invariance', () => {
  const eye = createSyntheticEye(0.5, 0.5, 0.08);
  eye.irisCenter = { x: 0.51, y: 0.505, z: 0 };

  const base = computeEyeGazeFeature(eye.irisCenter, eye.startCorner, eye.endCorner);
  assert.strictEqual(base.status, 'VALID');

  for (const s of [0.5, 2.5]) {
    const scalePt = (pt: NormalizedLandmark): NormalizedLandmark => ({
      x: 0.5 + (pt.x - 0.5) * s,
      y: 0.5 + (pt.y - 0.5) * s,
      z: 0,
    });

    const scaled = computeEyeGazeFeature(
      scalePt(eye.irisCenter),
      scalePt(eye.startCorner),
      scalePt(eye.endCorner)
    );

    assert.strictEqual(scaled.status, 'VALID');
    assert.ok(Math.abs(base.horizontalPosition! - scaled.horizontalPosition!) < 1e-6);
    assert.ok(Math.abs(base.verticalPosition! - scaled.verticalPosition!) < 1e-6);
    assert.ok(Math.abs(base.horizontalRatio! - scaled.horizontalRatio!) < 1e-6);
    assert.ok(Math.abs(base.verticalRatio! - scaled.verticalRatio!) < 1e-6);
  }
});

// --------------------------------------------------------------------------
// 4. Rotation Invariance (Eye-Local Coordinate Frame)
// --------------------------------------------------------------------------
test('4. Rotation Invariance (Eye-Local Coordinate Frame)', () => {
  const eye = createSyntheticEye(0.5, 0.5, 0.08);
  eye.irisCenter = { x: 0.515, y: 0.505, z: 0 };

  const base = computeEyeGazeFeature(eye.irisCenter, eye.startCorner, eye.endCorner);
  assert.strictEqual(base.status, 'VALID');

  for (const angleDeg of [-20, 20]) {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const rotatePt = (pt: NormalizedLandmark): NormalizedLandmark => {
      const rx = pt.x - 0.5;
      const ry = pt.y - 0.5;
      return {
        x: 0.5 + (rx * cos - ry * sin),
        y: 0.5 + (rx * sin + ry * cos),
        z: 0,
      };
    };

    const rotated = computeEyeGazeFeature(
      rotatePt(eye.irisCenter),
      rotatePt(eye.startCorner),
      rotatePt(eye.endCorner)
    );

    assert.strictEqual(rotated.status, 'VALID');
    assert.ok(Math.abs(base.horizontalPosition! - rotated.horizontalPosition!) < 1e-6);
    assert.ok(Math.abs(base.verticalPosition! - rotated.verticalPosition!) < 1e-6);
    assert.ok(Math.abs(base.horizontalRatio! - rotated.horizontalRatio!) < 1e-6);
    assert.ok(Math.abs(base.verticalRatio! - rotated.verticalRatio!) < 1e-6);
  }
});

// --------------------------------------------------------------------------
// 5. Corner-Center Semantics
// --------------------------------------------------------------------------
test('5. Corner-Center Semantics', () => {
  const eye = createSyntheticEye(0.5, 0.5, 0.08);

  // Center: H = 0.0 (Ratio 0.5), V = 0.0 (Ratio 0.5)
  const center = computeEyeGazeFeature(eye.irisCenter, eye.startCorner, eye.endCorner);
  assert.strictEqual(center.status, 'VALID');
  assert.ok(Math.abs(center.horizontalPosition! - 0.0) < 1e-6);
  assert.ok(Math.abs(center.horizontalRatio! - 0.5) < 1e-6);
  assert.ok(Math.abs(center.verticalPosition! - 0.0) < 1e-6);
  assert.ok(Math.abs(center.verticalRatio! - 0.5) < 1e-6);

  // Start corner: H = -1.0 (Ratio 0.0)
  const atStart = computeEyeGazeFeature(eye.startCorner, eye.startCorner, eye.endCorner);
  assert.strictEqual(atStart.status, 'VALID');
  assert.ok(Math.abs(atStart.horizontalPosition! - -1.0) < 1e-6);
  assert.ok(Math.abs(atStart.horizontalRatio! - 0.0) < 1e-6);
  assert.ok(Math.abs(atStart.verticalPosition! - 0.0) < 1e-6);

  // End corner: H = +1.0 (Ratio 1.0)
  const atEnd = computeEyeGazeFeature(eye.endCorner, eye.startCorner, eye.endCorner);
  assert.strictEqual(atEnd.status, 'VALID');
  assert.ok(Math.abs(atEnd.horizontalPosition! - 1.0) < 1e-6);
  assert.ok(Math.abs(atEnd.horizontalRatio! - 1.0) < 1e-6);
  assert.ok(Math.abs(atEnd.verticalPosition! - 0.0) < 1e-6);
});

// --------------------------------------------------------------------------
// 6. Downward Displacement -> Positive V
// --------------------------------------------------------------------------
test('6. Downward Displacement -> Positive V', () => {
  const eye = createSyntheticEye(0.5, 0.5, 0.08);
  // Shift iris downward in image space (+Y)
  const dy = 0.010;
  const downRes = computeEyeGazeFeature(
    { x: 0.5, y: 0.5 + dy, z: 0 },
    eye.startCorner,
    eye.endCorner
  );

  assert.strictEqual(downRes.status, 'VALID');
  assert.ok(downRes.verticalPosition! > 0, `Expected V > 0, got ${downRes.verticalPosition}`);
  // W = 0.08, halfWidth = 0.04 -> V = 0.010 / 0.04 = +0.25
  assert.ok(Math.abs(downRes.verticalPosition! - 0.25) < 1e-6);
  assert.ok(Math.abs(downRes.verticalRatio! - 0.625) < 1e-6);
});

// --------------------------------------------------------------------------
// 7. Upward Displacement -> Negative V
// --------------------------------------------------------------------------
test('7. Upward Displacement -> Negative V', () => {
  const eye = createSyntheticEye(0.5, 0.5, 0.08);
  // Shift iris upward in image space (-Y)
  const dy = -0.010;
  const upRes = computeEyeGazeFeature(
    { x: 0.5, y: 0.5 + dy, z: 0 },
    eye.startCorner,
    eye.endCorner
  );

  assert.strictEqual(upRes.status, 'VALID');
  assert.ok(upRes.verticalPosition! < 0, `Expected V < 0, got ${upRes.verticalPosition}`);
  // W = 0.08, halfWidth = 0.04 -> V = -0.010 / 0.04 = -0.25
  assert.ok(Math.abs(upRes.verticalPosition! - -0.25) < 1e-6);
  assert.ok(Math.abs(upRes.verticalRatio! - 0.375) < 1e-6);
});

// --------------------------------------------------------------------------
// 8. Horizontal Cross-Axis Response
// --------------------------------------------------------------------------
test('8. Horizontal Cross-Axis Response', () => {
  const eye = createSyntheticEye(0.5, 0.5, 0.08);
  // Pure horizontal displacement (+X)
  const dx = 0.016;
  const horizRes = computeEyeGazeFeature(
    { x: 0.5 + dx, y: 0.5, z: 0 },
    eye.startCorner,
    eye.endCorner
  );

  assert.strictEqual(horizRes.status, 'VALID');
  // H = 0.016 / 0.04 = 0.40
  assert.ok(Math.abs(horizRes.horizontalPosition! - 0.40) < 1e-6);
  // Algorithmic vertical leakage on pure orthogonal displacement must be strictly 0
  assert.ok(Math.abs(horizRes.verticalPosition!) < 1e-6);
});

// --------------------------------------------------------------------------
// 9. Unclamped Extrema Fidelity
// --------------------------------------------------------------------------
test('9. Unclamped Extrema Fidelity', () => {
  const eye = createSyntheticEye(0.5, 0.5, 0.08);
  // Displace far beyond nominal range: dy = 0.080 (2x halfWidth)
  const dy = 0.080;
  const extremeRes = computeEyeGazeFeature(
    { x: 0.5, y: 0.5 + dy, z: 0 },
    eye.startCorner,
    eye.endCorner
  );

  assert.strictEqual(extremeRes.status, 'VALID');
  // V = 0.080 / 0.040 = +2.0
  assert.ok(Math.abs(extremeRes.verticalPosition! - 2.0) < 1e-6);
  assert.ok(Math.abs(extremeRes.verticalRatio! - 1.5) < 1e-6);

  // Negative extreme: dx = -0.080 (-2x halfWidth)
  const extremeHoriz = computeEyeGazeFeature(
    { x: 0.5 - dy, y: 0.5, z: 0 },
    eye.startCorner,
    eye.endCorner
  );
  assert.ok(Math.abs(extremeHoriz.horizontalPosition! - -2.0) < 1e-6);
  assert.ok(Math.abs(extremeHoriz.horizontalRatio! - -0.5) < 1e-6);
});

// --------------------------------------------------------------------------
// 10. Bilateral State Handling
// --------------------------------------------------------------------------
test('10. Bilateral State Handling', () => {
  const eye = createSyntheticEye(0.5, 0.5, 0.08);
  const rightValid = computeEyeGazeFeature({ x: 0.5, y: 0.504, z: 0 }, eye.startCorner, eye.endCorner);
  const leftValid = computeEyeGazeFeature({ x: 0.5, y: 0.508, z: 0 }, eye.startCorner, eye.endCorner);

  // Both valid -> averaged
  const bothValid = combineBilateralFeatures(rightValid, leftValid);
  assert.strictEqual(bothValid.status, 'VALID');
  // Right V = 0.004 / 0.04 = 0.10, Left V = 0.008 / 0.04 = 0.20 -> avg = 0.15
  assert.ok(Math.abs(bothValid.verticalPosition! - 0.15) < 1e-6);

  // Missing left -> ONLY_RIGHT_VALID
  const missingLeft = combineBilateralFeatures(rightValid, { ...leftValid, status: 'MISSING_LANDMARKS' });
  assert.strictEqual(missingLeft.status, 'ONLY_RIGHT_VALID');
  assert.strictEqual(missingLeft.horizontalPosition, null);
  assert.strictEqual(missingLeft.verticalPosition, null);

  // Missing right -> ONLY_LEFT_VALID
  const missingRight = combineBilateralFeatures({ ...rightValid, status: 'MISSING_LANDMARKS' }, leftValid);
  assert.strictEqual(missingRight.status, 'ONLY_LEFT_VALID');
  assert.strictEqual(missingRight.horizontalPosition, null);
  assert.strictEqual(missingRight.verticalPosition, null);

  // Neither valid -> NONE_VALID
  const neitherValid = combineBilateralFeatures(
    { ...rightValid, status: 'INVALID_GEOMETRY' },
    { ...leftValid, status: 'MISSING_LANDMARKS' }
  );
  assert.strictEqual(neitherValid.status, 'NONE_VALID');
  assert.strictEqual(neitherValid.horizontalPosition, null);
  assert.strictEqual(neitherValid.verticalPosition, null);
});

// --------------------------------------------------------------------------
// 11. Final W/2 Isotropic Normalization Verification
// --------------------------------------------------------------------------
test('11. Final W/2 Isotropic Normalization Verification', () => {
  const eye = createSyntheticEye(0.5, 0.5, 0.08); // W = 0.08, halfWidth = 0.04
  const dy = 0.020; // 20% vertical displacement downward

  const res = computeEyeGazeFeature(
    { x: 0.5, y: 0.5 + dy, z: 0 },
    eye.startCorner,
    eye.endCorner
  );

  assert.strictEqual(res.status, 'VALID');
  // Pure isotropic: denomV = W / 2 = 0.04
  // V = 0.020 / 0.040 = +0.50 (NOT 1.25 as would occur with 0.40 scaling)
  assert.ok(Math.abs(res.verticalPosition! - 0.50) < 1e-6);
  assert.ok(Math.abs(res.eyeWidth! - 0.08) < 1e-6);

  // Degenerate geometry guard
  const degenerate = computeEyeGazeFeature(
    { x: 0.5, y: 0.5, z: 0 },
    { x: 0.5, y: 0.5, z: 0 },
    { x: 0.5, y: 0.5, z: 0 }
  );
  assert.strictEqual(degenerate.status, 'INVALID_GEOMETRY');
  assert.strictEqual(degenerate.verticalPosition, null);

  // End-to-end extractGazeFeatures check
  const fakeMesh = new Array(478).fill(null).map((_, i) => ({ x: 0.5, y: 0.5, z: 0 }));
  fakeMesh[RIGHT_EYE_LANDMARKS.startCorner] = { x: 0.46, y: 0.5, z: 0 };
  fakeMesh[RIGHT_EYE_LANDMARKS.endCorner] = { x: 0.54, y: 0.5, z: 0 };
  fakeMesh[RIGHT_EYE_LANDMARKS.irisCenter] = { x: 0.50, y: 0.51, z: 0 };

  fakeMesh[LEFT_EYE_LANDMARKS.startCorner] = { x: 0.61, y: 0.5, z: 0 };
  fakeMesh[LEFT_EYE_LANDMARKS.endCorner] = { x: 0.69, y: 0.5, z: 0 };
  fakeMesh[LEFT_EYE_LANDMARKS.irisCenter] = { x: 0.65, y: 0.51, z: 0 };

  const extracted: ExtractedLandmarks = {
    faceMesh: fakeMesh,
    leftEyeContour: [],
    rightEyeContour: [],
    leftIris: [],
    rightIris: [],
  };

  const featureSet = extractGazeFeatures(extracted);
  assert.ok(featureSet !== null);
  assert.strictEqual(featureSet.bilateral.status, 'VALID');
  assert.ok(Math.abs(featureSet.bilateral.verticalPosition! - 0.25) < 1e-6);
});
