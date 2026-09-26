import test from 'node:test';
import assert from 'node:assert';
import {
  calculateMedian,
  splitTrainVal,
  calculateEuclideanError,
  solveAffineLeastSquares,
} from '../src/services/affineSolver.ts';
import {
  CALIBRATION_TARGETS,
  MIN_SAMPLES_PER_TARGET,
  resolveTargetScreenPoint,
  isBilateralSampleValid,
  fitCalibrationModel,
  mapGazeToScreen,
} from '../src/services/calibrationService.ts';
import type {
  CalibrationGazeSample,
  TargetSampleCollection,
  CalibrationModel,
} from '../src/types/calibration.ts';
import type { GazeFeatureSet } from '../src/types/vision.ts';

// --------------------------------------------------------------------------
// 1. Median calculation
// --------------------------------------------------------------------------
test('1. Median calculation', () => {
  // Odd length
  assert.strictEqual(calculateMedian([1, 3, 2]), 2);
  assert.strictEqual(calculateMedian([5]), 5);
  assert.strictEqual(calculateMedian([10, -5, 0]), 0);

  // Even length
  assert.strictEqual(calculateMedian([4, 1, 3, 2]), 2.5);
  assert.strictEqual(calculateMedian([1, 2]), 1.5);
  assert.strictEqual(calculateMedian([-0.5, 0.2, -0.1, 0.4]), 0.05);

  // Throws on empty array
  assert.throws(() => calculateMedian([]), /Cannot compute median of empty array/);
});

// --------------------------------------------------------------------------
// 2. Valid/invalid sample filtering
// --------------------------------------------------------------------------
test('2. Valid/invalid sample filtering', () => {
  const validFeatureSet: GazeFeatureSet = {
    rightEye: {
      status: 'VALID',
      horizontalPosition: -0.1,
      verticalPosition: 0.05,
      horizontalRatio: 0.45,
      verticalRatio: 0.525,
      irisCenter: { x: 0.4, y: 0.5, z: 0 },
      eyeWidth: 0.08,
    },
    leftEye: {
      status: 'VALID',
      horizontalPosition: -0.12,
      verticalPosition: 0.04,
      horizontalRatio: 0.44,
      verticalRatio: 0.52,
      irisCenter: { x: 0.6, y: 0.5, z: 0 },
      eyeWidth: 0.08,
    },
    bilateral: {
      status: 'VALID',
      horizontalPosition: -0.11,
      verticalPosition: 0.045,
      horizontalRatio: 0.445,
      verticalRatio: 0.5225,
    },
    timestampMs: 1000,
  };

  // Valid bilateral sample
  assert.strictEqual(isBilateralSampleValid(validFeatureSet), true);

  // Null or undefined
  assert.strictEqual(isBilateralSampleValid(null), false);
  assert.strictEqual(isBilateralSampleValid(undefined), false);

  // Single eye invalid (e.g. left eye occluded)
  const singleEyeInvalid: GazeFeatureSet = {
    ...validFeatureSet,
    leftEye: { ...validFeatureSet.leftEye, status: 'MISSING_LANDMARKS' },
    bilateral: { ...validFeatureSet.bilateral, status: 'ONLY_RIGHT_VALID', horizontalPosition: null, verticalPosition: null },
  };
  assert.strictEqual(isBilateralSampleValid(singleEyeInvalid), false);

  // Non-finite H or V
  const nanFeatureSet: GazeFeatureSet = {
    ...validFeatureSet,
    bilateral: { ...validFeatureSet.bilateral, horizontalPosition: Number.NaN },
  };
  assert.strictEqual(isBilateralSampleValid(nanFeatureSet), false);
});

// --------------------------------------------------------------------------
// 3. Minimum sample requirement
// --------------------------------------------------------------------------
test('3. Minimum sample requirement', () => {
  const viewportW = 960;
  const viewportH = 540;

  // Create 9 targets, but Target 1 has only 19 samples (< 20 required)
  const collections: TargetSampleCollection[] = CALIBRATION_TARGETS.map((target, idx) => ({
    target,
    screenPoint: resolveTargetScreenPoint(target, viewportW, viewportH),
    samples: new Array(idx === 0 ? 19 : 25).fill(null).map((_, i) => ({
      h: (target.relX - 0.5) * 0.4 + i * 0.001,
      v: (target.relY - 0.5) * 0.4 + i * 0.001,
      timestampMs: 1000 + i * 40,
    })),
    trainSamples: [],
    valSamples: [],
    medianH: null,
    medianV: null,
  }));

  const result = fitCalibrationModel(collections, viewportW, viewportH);
  assert.strictEqual(result.status, 'INVALID');
  assert.ok(result.failureReason?.includes('only 19 valid samples'));
  assert.ok(result.failureReason?.includes(`minimum required is ${MIN_SAMPLES_PER_TARGET}`));
});

// --------------------------------------------------------------------------
// 4. Deterministic 80/20 split
// --------------------------------------------------------------------------
test('4. Deterministic 80/20 split', () => {
  // 25 samples
  const samples: CalibrationGazeSample[] = new Array(25).fill(null).map((_, i) => ({
    h: i * 0.01,
    v: -i * 0.01,
    timestampMs: i * 40,
  }));

  const { train, val } = splitTrainVal(samples);

  // 25 total: exactly 5 to val (indices 4, 9, 14, 19, 24 -> 20%), 20 to train (80%)
  assert.strictEqual(val.length, 5);
  assert.strictEqual(train.length, 20);
  assert.strictEqual(train.length + val.length, samples.length);

  // Check deterministic assignment
  assert.strictEqual(val[0].h, samples[4].h);
  assert.strictEqual(val[1].h, samples[9].h);
  assert.strictEqual(val[2].h, samples[14].h);
  assert.strictEqual(val[3].h, samples[19].h);
  assert.strictEqual(val[4].h, samples[24].h);

  // Repeating split produces identical deterministic output
  const split2 = splitTrainVal(samples);
  assert.deepStrictEqual(train, split2.train);
  assert.deepStrictEqual(val, split2.val);
});

// --------------------------------------------------------------------------
// 5. Affine model fitting with synthetic known data
// --------------------------------------------------------------------------
test('5. Affine model fitting with synthetic known data', () => {
  // Ground truth affine parameters:
  // X = 480 + 350*H - 50*V
  // Y = 270 + 30*H + 280*V
  const trueA0 = 480;
  const trueA1 = 350;
  const trueA2 = -50;

  const trueB0 = 270;
  const trueB1 = 30;
  const trueB2 = 280;

  // Generate synthetic training points across varying H and V
  const trainingPairs = [
    { h: -0.2, v: -0.2 },
    { h: 0.0, v: -0.2 },
    { h: 0.2, v: -0.2 },
    { h: -0.2, v: 0.0 },
    { h: 0.0, v: 0.0 },
    { h: 0.2, v: 0.0 },
    { h: -0.2, v: 0.2 },
    { h: 0.0, v: 0.2 },
    { h: 0.2, v: 0.2 },
  ].map(({ h, v }) => ({
    h,
    v,
    x: trueA0 + trueA1 * h + trueA2 * v,
    y: trueB0 + trueB1 * h + trueB2 * v,
  }));

  const res = solveAffineLeastSquares(trainingPairs);
  assert.strictEqual(res.isDegenerate, false);
  assert.ok(res.coefficients !== null);

  const [a0, a1, a2] = res.coefficients.thetaX;
  const [b0, b1, b2] = res.coefficients.thetaY;

  // Accuracy must match ground truth to within floating point precision
  assert.ok(Math.abs(a0 - trueA0) < 1e-6, `a0 error: ${a0} vs ${trueA0}`);
  assert.ok(Math.abs(a1 - trueA1) < 1e-6, `a1 error: ${a1} vs ${trueA1}`);
  assert.ok(Math.abs(a2 - trueA2) < 1e-6, `a2 error: ${a2} vs ${trueA2}`);

  assert.ok(Math.abs(b0 - trueB0) < 1e-6, `b0 error: ${b0} vs ${trueB0}`);
  assert.ok(Math.abs(b1 - trueB1) < 1e-6, `b1 error: ${b1} vs ${trueB1}`);
  assert.ok(Math.abs(b2 - trueB2) < 1e-6, `b2 error: ${b2} vs ${trueB2}`);
});

// --------------------------------------------------------------------------
// 6. Correct X mapping
// --------------------------------------------------------------------------
test('6. Correct X mapping', () => {
  const model: CalibrationModel = {
    status: 'VALID',
    viewportWidth: 1000,
    viewportHeight: 600,
    coefficients: {
      thetaX: [500, 400, -20],
      thetaY: [300, 10, 350],
    },
  };

  // Test at center H = 0, V = 0: X = 500
  const center = mapGazeToScreen(0, 0, model);
  assert.ok(center !== null);
  assert.ok(Math.abs(center.x - 500) < 1e-6);

  // Test at H = 0.5, V = 0.1: X = 500 + 400*0.5 - 20*0.1 = 500 + 200 - 2 = 698
  const offset = mapGazeToScreen(0.5, 0.1, model);
  assert.ok(offset !== null);
  assert.ok(Math.abs(offset.x - 698) < 1e-6);
});

// --------------------------------------------------------------------------
// 7. Correct Y mapping
// --------------------------------------------------------------------------
test('7. Correct Y mapping', () => {
  const model: CalibrationModel = {
    status: 'VALID',
    viewportWidth: 1000,
    viewportHeight: 600,
    coefficients: {
      thetaX: [500, 400, -20],
      thetaY: [300, 10, 350],
    },
  };

  // Test at center H = 0, V = 0: Y = 300
  const center = mapGazeToScreen(0, 0, model);
  assert.ok(center !== null);
  assert.ok(Math.abs(center.y - 300) < 1e-6);

  // Test at H = 0.2, V = 0.4: Y = 300 + 10*0.2 + 350*0.4 = 300 + 2 + 140 = 442
  const offset = mapGazeToScreen(0.2, 0.4, model);
  assert.ok(offset !== null);
  assert.ok(Math.abs(offset.y - 442) < 1e-6);
});

// --------------------------------------------------------------------------
// 8. Cross-axis contribution
// --------------------------------------------------------------------------
test('8. Cross-axis contribution', () => {
  // Model with non-zero cross-axis terms:
  // a2 = -50 (V affects X)
  // b1 = 40 (H affects Y)
  const model: CalibrationModel = {
    status: 'VALID',
    viewportWidth: 1000,
    viewportHeight: 600,
    coefficients: {
      thetaX: [500, 300, -50],
      thetaY: [300, 40, 250],
    },
  };

  // With fixed H = 0.1, changing V from 0.0 to 0.2 alters X by -50 * 0.2 = -10
  const mapV0 = mapGazeToScreen(0.1, 0.0, model)!;
  const mapV1 = mapGazeToScreen(0.1, 0.2, model)!;
  assert.ok(Math.abs((mapV1.x - mapV0.x) - -10) < 1e-6);

  // With fixed V = 0.1, changing H from 0.0 to 0.2 alters Y by +40 * 0.2 = +8
  const mapH0 = mapGazeToScreen(0.0, 0.1, model)!;
  const mapH1 = mapGazeToScreen(0.2, 0.1, model)!;
  assert.ok(Math.abs((mapH1.y - mapH0.y) - 8) < 1e-6);
});

// --------------------------------------------------------------------------
// 9. Degenerate / unsolvable model handling
// --------------------------------------------------------------------------
test('9. Degenerate / unsolvable model handling', () => {
  // Case A: All gaze features are identical (user fixated on a single point during all targets)
  const constantPairs = [
    { h: 0.1, v: 0.1, x: 100, y: 100 },
    { h: 0.1, v: 0.1, x: 500, y: 100 },
    { h: 0.1, v: 0.1, x: 900, y: 100 },
    { h: 0.1, v: 0.1, x: 500, y: 300 },
  ];
  const resConstant = solveAffineLeastSquares(constantPairs);
  assert.strictEqual(resConstant.isDegenerate, true);
  assert.strictEqual(resConstant.coefficients, null);

  // Case B: Perfectly collinear features (V = 2 * H)
  const collinearPairs = [
    { h: -0.2, v: -0.4, x: 100, y: 100 },
    { h: 0.0, v: 0.0, x: 500, y: 300 },
    { h: 0.2, v: 0.4, x: 900, y: 500 },
    { h: 0.4, v: 0.8, x: 950, y: 550 },
  ];
  const resCollinear = solveAffineLeastSquares(collinearPairs);
  assert.strictEqual(resCollinear.isDegenerate, true);
  assert.strictEqual(resCollinear.coefficients, null);

  // Case C: Fewer than 3 points
  const insufficientPairs = [
    { h: 0.1, v: 0.2, x: 100, y: 200 },
    { h: 0.2, v: 0.3, x: 200, y: 300 },
  ];
  const resInsufficient = solveAffineLeastSquares(insufficientPairs);
  assert.strictEqual(resInsufficient.isDegenerate, true);
  assert.ok(resInsufficient.errorMessage?.includes('minimum required is 3'));
});

// --------------------------------------------------------------------------
// 10. Euclidean validation error
// --------------------------------------------------------------------------
test('10. Euclidean validation error', () => {
  // Direct Euclidean distance test
  const err = calculateEuclideanError(100, 100, 103, 104);
  assert.ok(Math.abs(err - 5.0) < 1e-6);

  // Validation across a synthetic calibration set
  const viewportW = 1000;
  const viewportH = 600;

  // Affine model with small intentional noise in validation samples
  const collections: TargetSampleCollection[] = CALIBRATION_TARGETS.map((target) => {
    const pt = resolveTargetScreenPoint(target, viewportW, viewportH);
    const nominalH = (target.relX - 0.5) * 0.4;
    const nominalV = (target.relY - 0.5) * 0.4;

    const samples: CalibrationGazeSample[] = new Array(25).fill(null).map((_, i) => ({
      h: nominalH + (i % 2 === 0 ? 0.002 : -0.002),
      v: nominalV + (i % 2 === 0 ? 0.002 : -0.002),
      timestampMs: 1000 + i * 40,
    }));

    return {
      target,
      screenPoint: pt,
      samples,
      trainSamples: [],
      valSamples: [],
      medianH: null,
      medianV: null,
    };
  });

  const model = fitCalibrationModel(collections, viewportW, viewportH);
  assert.strictEqual(model.status, 'VALID');
  assert.strictEqual(model.validationSampleCount, 9 * 5); // 5 validation samples per target * 9 targets = 45
  assert.ok(model.validationErrorMean !== undefined && model.validationErrorMean > 0);
  assert.ok(model.validationErrorMax !== undefined && model.validationErrorMax >= model.validationErrorMean);
  assert.strictEqual(model.targetErrors?.length, 9);
});

// --------------------------------------------------------------------------
// 11. Out-of-bounds detection
// --------------------------------------------------------------------------
test('11. Out-of-bounds detection', () => {
  const model: CalibrationModel = {
    status: 'VALID',
    viewportWidth: 960,
    viewportHeight: 540,
    coefficients: {
      thetaX: [480, 960, 0],
      thetaY: [270, 0, 540],
    },
  };

  // In-bounds center: X = 480, Y = 270
  const inside = mapGazeToScreen(0, 0, model)!;
  assert.strictEqual(inside.outOfBounds, false);
  assert.strictEqual(inside.x, 480);
  assert.strictEqual(inside.y, 270);

  // Left of screen: H = -0.6 -> X = 480 - 576 = -96 (out of bounds)
  const left = mapGazeToScreen(-0.6, 0, model)!;
  assert.strictEqual(left.outOfBounds, true);
  assert.strictEqual(left.x, -96); // Must remain UNCLAMPED

  // Right of screen: H = +0.6 -> X = 480 + 576 = 1056 (out of bounds)
  const right = mapGazeToScreen(0.6, 0, model)!;
  assert.strictEqual(right.outOfBounds, true);
  assert.strictEqual(right.x, 1056); // Must remain UNCLAMPED

  // Top of screen: V = -0.6 -> Y = 270 - 324 = -54 (out of bounds)
  const top = mapGazeToScreen(0, -0.6, model)!;
  assert.strictEqual(top.outOfBounds, true);
  assert.strictEqual(top.y, -54);

  // Bottom of screen: V = +0.6 -> Y = 270 + 324 = 594 (out of bounds)
  const bottom = mapGazeToScreen(0, 0.6, model)!;
  assert.strictEqual(bottom.outOfBounds, true);
  assert.strictEqual(bottom.y, 594);
});

// --------------------------------------------------------------------------
// 12. Successful calibration lifecycle
// --------------------------------------------------------------------------
test('12. Successful calibration lifecycle', () => {
  const viewportW = 960;
  const viewportH = 540;

  // Fully valid 9-target collections with 25 valid samples each
  const collections: TargetSampleCollection[] = CALIBRATION_TARGETS.map((target) => {
    const pt = resolveTargetScreenPoint(target, viewportW, viewportH);
    const nominalH = (target.relX - 0.5) * 0.35;
    const nominalV = (target.relY - 0.5) * 0.35;

    const samples: CalibrationGazeSample[] = new Array(25).fill(null).map((_, i) => ({
      h: nominalH + (i % 2 === 0 ? 0.0005 : -0.0005),
      v: nominalV + (i % 2 === 0 ? 0.0005 : -0.0005),
      timestampMs: 1000 + i * 40,
    }));

    return {
      target,
      screenPoint: pt,
      samples,
      trainSamples: [],
      valSamples: [],
      medianH: null,
      medianV: null,
    };
  });

  const model = fitCalibrationModel(collections, viewportW, viewportH);
  assert.strictEqual(model.status, 'VALID');
  assert.ok(model.coefficients !== null);
  assert.ok(model.validationErrorMean! < 10.0, `Error was ${model.validationErrorMean}`); // Synthetic data has very low error

  // Live mapping functions properly with calibrated model
  const live = mapGazeToScreen(0, 0, model);
  assert.ok(live !== null);
  // Center gaze maps near screen center (480, 270)
  assert.ok(Math.abs(live.x - 480) < 20);
  assert.ok(Math.abs(live.y - 270) < 20);
  assert.strictEqual(live.outOfBounds, false);
});

// --------------------------------------------------------------------------
// 13. Failed calibration when a target has fewer than 20 valid samples
// --------------------------------------------------------------------------
test('13. Failed calibration when a target has fewer than 20 valid samples', () => {
  const viewportW = 960;
  const viewportH = 540;

  // Targets 1..8 have 25 samples, but Target 4 (index 3) has only 12 samples
  const collections: TargetSampleCollection[] = CALIBRATION_TARGETS.map((target, idx) => {
    const sampleCount = idx === 3 ? 12 : 25;
    const samples: CalibrationGazeSample[] = new Array(sampleCount).fill(null).map((_, i) => ({
      h: (target.relX - 0.5) * 0.35,
      v: (target.relY - 0.5) * 0.35,
      timestampMs: 1000 + i * 40,
    }));

    return {
      target,
      screenPoint: resolveTargetScreenPoint(target, viewportW, viewportH),
      samples,
      trainSamples: [],
      valSamples: [],
      medianH: null,
      medianV: null,
    };
  });

  const model = fitCalibrationModel(collections, viewportW, viewportH);
  assert.strictEqual(model.status, 'INVALID');
  assert.ok(model.failureReason?.includes('Target 4 (Middle-Right)'));
  assert.ok(model.failureReason?.includes('only 12 valid samples'));

  // Live mapping returns null when model is INVALID
  const live = mapGazeToScreen(0, 0, model);
  assert.strictEqual(live, null);
});
