/**
 * Task 3: Calibration Service
 * Manages 9-point calibration grid, affine model fitting, validation, and live screen mapping.
 */

import type {
  CalibrationTarget,
  ScreenPoint,
  TargetSampleCollection,
  CalibrationModel,
  LiveGazeMapping,
  TargetValidationError,
} from '../types/calibration.ts';
import type { GazeFeatureSet } from '../types/vision.ts';
import {
  calculateMedian,
  splitTrainVal,
  calculateEuclideanError,
  solveAffineLeastSquares,
  type TrainingSamplePair,
} from './affineSolver.ts';

/** Minimum valid samples required per calibration target */
export const MIN_SAMPLES_PER_TARGET = 20;

/** Timing constants per specification */
export const STABILIZATION_DURATION_MS = 500;
export const RECORDING_DURATION_MS = 1000;

/**
 * Approved 9-point calibration grid arranged in a 3x3 layout.
 *
 * Logical layout:
 *   1 (Top-Left)     ───── 2 (Top-Center)    ───── 3 (Top-Right)
 *   │                                              │
 *   8 (Middle-Left)  ───── 9 (Center)        ───── 4 (Middle-Right)
 *   │                                              │
 *   7 (Bottom-Left)  ───── 6 (Bottom-Center) ───── 5 (Bottom-Right)
 *
 * Traversal Order:
 *   1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9
 *
 * Screen-relative coordinates [0.10, 0.90] ensure broad display coverage
 * while leaving a comfortable margin for eye movements.
 */
export const CALIBRATION_TARGETS: readonly CalibrationTarget[] = [
  { id: 1, relX: 0.10, relY: 0.10, description: 'Top-Left' },
  { id: 2, relX: 0.50, relY: 0.10, description: 'Top-Center' },
  { id: 3, relX: 0.90, relY: 0.10, description: 'Top-Right' },
  { id: 4, relX: 0.90, relY: 0.50, description: 'Middle-Right' },
  { id: 5, relX: 0.90, relY: 0.90, description: 'Bottom-Right' },
  { id: 6, relX: 0.50, relY: 0.90, description: 'Bottom-Center' },
  { id: 7, relX: 0.10, relY: 0.90, description: 'Bottom-Left' },
  { id: 8, relX: 0.10, relY: 0.50, description: 'Middle-Left' },
  { id: 9, relX: 0.50, relY: 0.50, description: 'Center' },
] as const;

/**
 * Resolves screen-relative target coordinates into absolute viewport pixels.
 */
export function resolveTargetScreenPoint(
  target: CalibrationTarget,
  viewportWidth: number,
  viewportHeight: number
): ScreenPoint {
  return {
    x: Math.round(target.relX * viewportWidth),
    y: Math.round(target.relY * viewportHeight),
  };
}

/**
 * Factual validity check for calibration samples according to Task 3 Section 3:
 * A sample is valid ONLY when:
 * - Right eye gaze feature status === 'VALID'
 * - Left eye gaze feature status === 'VALID'
 * - Bilateral H exists and is finite
 * - Bilateral V exists and is finite
 */
export function isBilateralSampleValid(gazeFeatures: GazeFeatureSet | null | undefined): boolean {
  if (!gazeFeatures) return false;

  const rightValid = gazeFeatures.rightEye.status === 'VALID';
  const leftValid = gazeFeatures.leftEye.status === 'VALID';
  const biH = gazeFeatures.bilateral.horizontalPosition;
  const biV = gazeFeatures.bilateral.verticalPosition;

  return (
    rightValid &&
    leftValid &&
    biH !== null &&
    biH !== undefined &&
    Number.isFinite(biH) &&
    biV !== null &&
    biV !== undefined &&
    Number.isFinite(biV)
  );
}

/**
 * Fits a 2D affine calibration model from the 9 target collections
 * and evaluates validation error on the held-out 20% samples.
 */
export function fitCalibrationModel(
  targetCollections: TargetSampleCollection[],
  viewportWidth: number,
  viewportHeight: number
): CalibrationModel {
  // 1. Verify that all 9 targets are present
  if (targetCollections.length !== CALIBRATION_TARGETS.length) {
    return {
      status: 'INVALID',
      failureReason: `Calibration requires all ${CALIBRATION_TARGETS.length} targets. Received ${targetCollections.length}.`,
      viewportWidth,
      viewportHeight,
    };
  }

  // 2. Verify minimum sample requirement (>= 20 per target) and compute medians + splits
  const allTrainingPairs: TrainingSamplePair[] = [];

  for (let i = 0; i < targetCollections.length; i++) {
    const col = targetCollections[i];
    const target = col.target;

    if (col.samples.length < MIN_SAMPLES_PER_TARGET) {
      return {
        status: 'INVALID',
        failureReason: `Target ${target.id} (${target.description}) collected only ${col.samples.length} valid samples (minimum required is ${MIN_SAMPLES_PER_TARGET}). Calibration marked INVALID.`,
        viewportWidth,
        viewportHeight,
      };
    }

    // Compute median H/V per target
    const hValues = col.samples.map((s) => s.h);
    const vValues = col.samples.map((s) => s.v);
    col.medianH = calculateMedian(hValues);
    col.medianV = calculateMedian(vValues);

    // Deterministic 80/20 train/val split inside target
    const { train, val } = splitTrainVal(col.samples);
    col.trainSamples = train;
    col.valSamples = val;

    // Collect training pairs
    for (let j = 0; j < train.length; j++) {
      allTrainingPairs.push({
        h: train[j].h,
        v: train[j].v,
        x: col.screenPoint.x,
        y: col.screenPoint.y,
      });
    }
  }

  // 3. Fit 2D affine model on all training samples
  const solverResult = solveAffineLeastSquares(allTrainingPairs);

  if (solverResult.isDegenerate || !solverResult.coefficients) {
    return {
      status: 'INVALID',
      failureReason: solverResult.errorMessage || 'Degenerate calibration geometry encountered during model fitting.',
      viewportWidth,
      viewportHeight,
    };
  }

  const coefficients = solverResult.coefficients;
  const [a0, a1, a2] = coefficients.thetaX;
  const [b0, b1, b2] = coefficients.thetaY;

  // 4. Evaluate held-out validation samples from all 9 targets
  let totalValError = 0;
  let maxValError = 0;
  let totalValSamples = 0;
  const targetErrors: TargetValidationError[] = [];

  for (let i = 0; i < targetCollections.length; i++) {
    const col = targetCollections[i];
    let targetErrorSum = 0;
    let targetMaxError = 0;

    for (let j = 0; j < col.valSamples.length; j++) {
      const s = col.valSamples[j];
      const predX = a0 + a1 * s.h + a2 * s.v;
      const predY = b0 + b1 * s.h + b2 * s.v;
      const err = calculateEuclideanError(predX, predY, col.screenPoint.x, col.screenPoint.y);

      targetErrorSum += err;
      if (err > targetMaxError) {
        targetMaxError = err;
      }

      totalValError += err;
      if (err > maxValError) {
        maxValError = err;
      }
      totalValSamples++;
    }

    const targetMeanError = col.valSamples.length > 0 ? targetErrorSum / col.valSamples.length : 0;
    col.valErrorMean = targetMeanError;
    col.valErrorMax = targetMaxError;

    targetErrors.push({
      targetId: col.target.id,
      meanError: targetMeanError,
      maxError: targetMaxError,
      sampleCount: col.valSamples.length,
    });
  }

  const meanValError = totalValSamples > 0 ? totalValError / totalValSamples : 0;

  return {
    status: 'VALID',
    coefficients,
    viewportWidth,
    viewportHeight,
    validationErrorMean: meanValError,
    validationErrorMax: maxValError,
    validationSampleCount: totalValSamples,
    targetErrors,
    calibratedAtMs: performance.now(),
  };
}

/**
 * Live gaze mapping function:
 * Converts bilateral (H, V) features to viewport screen coordinates (X, Y)
 * using the fitted affine coefficients:
 *   X = a0 + a1 * H + a2 * V
 *   Y = b0 + b1 * H + b2 * V
 *
 * Coordinates are returned strictly UNCLAMPED.
 * outOfBounds is true when coordinates lie outside [0, viewportWidth] x [0, viewportHeight].
 */
export function mapGazeToScreen(
  h: number | null | undefined,
  v: number | null | undefined,
  model: CalibrationModel | null | undefined
): LiveGazeMapping | null {
  if (
    h === null ||
    h === undefined ||
    v === null ||
    v === undefined ||
    !Number.isFinite(h) ||
    !Number.isFinite(v) ||
    !model ||
    model.status !== 'VALID' ||
    !model.coefficients
  ) {
    return null;
  }

  const [a0, a1, a2] = model.coefficients.thetaX;
  const [b0, b1, b2] = model.coefficients.thetaY;

  // Unclamped 2D affine prediction
  const x = a0 + a1 * h + a2 * v;
  const y = b0 + b1 * h + b2 * v;

  const outOfBounds =
    x < 0 || x > model.viewportWidth || y < 0 || y > model.viewportHeight;

  return {
    x,
    y,
    outOfBounds,
  };
}
