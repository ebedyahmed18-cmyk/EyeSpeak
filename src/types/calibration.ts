/**
 * Task 3: Calibration & Gaze Estimation Types
 * Defines data structures for 9-point calibration, affine fitting, validation, and live screen mapping.
 */

/** Screen point in absolute display/viewport pixels */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** Normalized screen-relative coordinates in [0.0, 1.0] */
export interface NormalizedPoint {
  relX: number;
  relY: number;
}

/** 9-Point calibration target specification */
export interface CalibrationTarget {
  /** Target index in logical traversal order (1 to 9) */
  id: number;
  /** Normalized screen-relative X [0.0, 1.0] */
  relX: number;
  /** Normalized screen-relative Y [0.0, 1.0] */
  relY: number;
  /** Descriptive logical grid position */
  description: string;
}

/** Single bilateral gaze sample collected during calibration */
export interface CalibrationGazeSample {
  h: number;
  v: number;
  timestampMs: number;
}

/** Target sample container and validation metrics */
export interface TargetSampleCollection {
  target: CalibrationTarget;
  screenPoint: ScreenPoint;
  samples: CalibrationGazeSample[];
  trainSamples: CalibrationGazeSample[];
  valSamples: CalibrationGazeSample[];
  medianH: number | null;
  medianV: number | null;
  valErrorMean?: number;
  valErrorMax?: number;
}

/** 2D Affine Model coefficients: X = a0 + a1*H + a2*V, Y = b0 + b1*H + b2*V */
export interface AffineCoefficients {
  /** Coefficients for horizontal coordinate [a0 (bias), a1 (H weight), a2 (V weight)] */
  thetaX: [number, number, number];
  /** Coefficients for vertical coordinate [b0 (bias), b1 (H weight), b2 (V weight)] */
  thetaY: [number, number, number];
}

/** Per-target validation error details */
export interface TargetValidationError {
  targetId: number;
  meanError: number;
  maxError: number;
  sampleCount: number;
}

/** Result of fitting and validating the calibration model */
export interface CalibrationModel {
  status: 'VALID' | 'INVALID';
  failureReason?: string;
  coefficients?: AffineCoefficients;
  viewportWidth: number;
  viewportHeight: number;
  validationErrorMean?: number;
  validationErrorMax?: number;
  validationSampleCount?: number;
  targetErrors?: TargetValidationError[];
  calibratedAtMs?: number;
}

/** Live mapped screen point from H/V gaze features */
export interface LiveGazeMapping {
  /** Raw un-clamped predicted horizontal coordinate in viewport pixels */
  x: number;
  /** Raw un-clamped predicted vertical coordinate in viewport pixels */
  y: number;
  /** True if the predicted coordinate lies outside viewport bounds [0, viewportWidth] x [0, viewportHeight] */
  outOfBounds: boolean;
}

/** Overall calibration session lifecycle state */
export type CalibrationLifecycleStatus =
  | 'IDLE'
  | 'STABILIZING'
  | 'RECORDING'
  | 'CALIBRATING'
  | 'SUCCESS'
  | 'FAILED';

/** State for the calibration process */
export interface CalibrationSessionState {
  status: CalibrationLifecycleStatus;
  currentTargetIndex: number; // 0 to 8
  currentTarget: CalibrationTarget | null;
  stabilizationRemainingMs: number;
  recordingRemainingMs: number;
  targetCollections: TargetSampleCollection[];
  activeModel: CalibrationModel | null;
  errorMessage: string | null;
}
