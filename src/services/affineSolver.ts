/**
 * Affine Solver & Mathematical Utilities for Task 3 Calibration
 * Deterministic least-squares solver for 2D affine mapping:
 *   X = a0 + a1 * H + a2 * V
 *   Y = b0 + b1 * H + b2 * V
 *
 * Implements:
 * - Exact median calculation
 * - Deterministic 80/20 training/validation split
 * - 3x3 normal equations solver with determinant-based degeneracy detection
 * - Euclidean validation error computation
 */

import type { AffineCoefficients, CalibrationGazeSample } from '../types/calibration.ts';

/** Minimum determinant magnitude required to invert normal equations matrix */
export const AFFINE_SINGULAR_EPSILON = 1e-9;

/**
 * Calculates the exact median of a collection of finite numbers.
 * For odd length: middle element.
 * For even length: average of the two middle elements.
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) {
    throw new Error('Cannot compute median of empty array');
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Deterministic 80% / 20% training/validation split inside a single target's sample set.
 * Every 5th sample (indices 4, 9, 14, 19, ...) is assigned to validation (20%).
 * The remaining 4 out of 5 samples are assigned to training (80%).
 *
 * This provides uniform, deterministic temporal coverage across the entire 1000 ms window
 * without introducing time-bias or non-deterministic randomization.
 */
export function splitTrainVal(samples: CalibrationGazeSample[]): {
  train: CalibrationGazeSample[];
  val: CalibrationGazeSample[];
} {
  const train: CalibrationGazeSample[] = [];
  const val: CalibrationGazeSample[] = [];

  for (let i = 0; i < samples.length; i++) {
    // Indices 4, 9, 14, 19... go to validation (20% of samples)
    if ((i + 1) % 5 === 0) {
      val.push(samples[i]);
    } else {
      train.push(samples[i]);
    }
  }

  return { train, val };
}

/**
 * Calculates Euclidean distance between predicted and target screen coordinates.
 */
export function calculateEuclideanError(
  predX: number,
  predY: number,
  targetX: number,
  targetY: number
): number {
  return Math.hypot(predX - targetX, predY - targetY);
}

export interface TrainingSamplePair {
  h: number;
  v: number;
  x: number;
  y: number;
}

export interface SolverResult {
  coefficients: AffineCoefficients | null;
  determinant: number;
  isDegenerate: boolean;
  errorMessage?: string;
}

/**
 * Solves the least-squares 2D affine mapping:
 *   [1, H, V] * thetaX ≈ X
 *   [1, H, V] * thetaY ≈ Y
 *
 * Normal equations:
 *   M * thetaX = B_X
 *   M * thetaY = B_Y
 *
 * where M = A^T * A (3x3 symmetric matrix) and B = A^T * Target.
 *
 * Returns null if the data is collinear or degenerate (|det(M)| < AFFINE_SINGULAR_EPSILON).
 */
export function solveAffineLeastSquares(samples: TrainingSamplePair[]): SolverResult {
  const n = samples.length;
  if (n < 3) {
    return {
      coefficients: null,
      determinant: 0,
      isDegenerate: true,
      errorMessage: `Insufficient training samples to fit 3-parameter affine model: got ${n}, minimum required is 3.`,
    };
  }

  // Accumulate components of M = A^T * A and B_X, B_Y
  let sumH = 0;
  let sumV = 0;
  let sumH2 = 0;
  let sumV2 = 0;
  let sumHV = 0;

  let sumX = 0;
  let sumHX = 0;
  let sumVX = 0;

  let sumY = 0;
  let sumHY = 0;
  let sumVY = 0;

  for (let i = 0; i < n; i++) {
    const { h, v, x, y } = samples[i];
    sumH += h;
    sumV += v;
    sumH2 += h * h;
    sumV2 += v * v;
    sumHV += h * v;

    sumX += x;
    sumHX += h * x;
    sumVX += v * x;

    sumY += y;
    sumHY += h * y;
    sumVY += v * y;
  }

  // M = [ m00, m01, m02 ]
  //     [ m10, m11, m12 ]
  //     [ m20, m21, m22 ]
  const m00 = n;
  const m01 = sumH;
  const m02 = sumV;

  const m10 = sumH;
  const m11 = sumH2;
  const m12 = sumHV;

  const m20 = sumV;
  const m21 = sumHV;
  const m22 = sumV2;

  // Compute 3x3 determinant via cofactor expansion along row 0
  const c00 = m11 * m22 - m12 * m21;
  const c01 = -(m10 * m22 - m12 * m20);
  const c02 = m10 * m21 - m11 * m20;

  const det = m00 * c00 + m01 * c01 + m02 * c02;

  if (Math.abs(det) < AFFINE_SINGULAR_EPSILON || !Number.isFinite(det)) {
    return {
      coefficients: null,
      determinant: det,
      isDegenerate: true,
      errorMessage: `Degenerate calibration geometry: feature matrix A^T A is singular (determinant = ${det.toExponential(3)}). Gaze samples lack 2D variation.`,
    };
  }

  // Compute remaining cofactors for adjugate matrix
  // Since M is symmetric, c10 = c01 and c20 = c02
  const c11 = m00 * m22 - m02 * m20;
  const c12 = -(m00 * m21 - m01 * m20);

  const c21 = -(m00 * m12 - m02 * m10);
  const c22 = m00 * m11 - m01 * m10;

  // Inverse matrix: M_inv = (1 / det) * adj(M)
  const inv00 = c00 / det;
  const inv01 = c01 / det;
  const inv02 = c02 / det;

  const inv10 = c01 / det;
  const inv11 = c11 / det;
  const inv12 = c12 / det;

  const inv20 = c02 / det;
  const inv21 = c21 / det;
  const inv22 = c22 / det;

  // Solve thetaX = M_inv * B_X
  const a0 = inv00 * sumX + inv01 * sumHX + inv02 * sumVX;
  const a1 = inv10 * sumX + inv11 * sumHX + inv12 * sumVX;
  const a2 = inv20 * sumX + inv21 * sumHX + inv22 * sumVX;

  // Solve thetaY = M_inv * B_Y
  const b0 = inv00 * sumY + inv01 * sumHY + inv02 * sumVY;
  const b1 = inv10 * sumY + inv11 * sumHY + inv12 * sumVY;
  const b2 = inv20 * sumY + inv21 * sumHY + inv22 * sumVY;

  if (
    !Number.isFinite(a0) || !Number.isFinite(a1) || !Number.isFinite(a2) ||
    !Number.isFinite(b0) || !Number.isFinite(b1) || !Number.isFinite(b2)
  ) {
    return {
      coefficients: null,
      determinant: det,
      isDegenerate: true,
      errorMessage: 'Numerical instability encountered during affine parameter calculation (non-finite coefficients).',
    };
  }

  return {
    coefficients: {
      thetaX: [a0, a1, a2],
      thetaY: [b0, b1, b2],
    },
    determinant: det,
    isDegenerate: false,
  };
}
