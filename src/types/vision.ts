/**
 * Represents a single normalized 3D landmark coordinate [0.0, 1.0].
 */
export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

/**
 * Extracted landmark collections for face mesh, eye contours, and irises.
 */
export interface ExtractedLandmarks {
  /** All raw face landmarks returned by MediaPipe (468 or 478 points) */
  faceMesh: NormalizedLandmark[];
  /** Canonical eyelid/contour landmarks for the left eye */
  leftEyeContour: NormalizedLandmark[];
  /** Canonical eyelid/contour landmarks for the right eye */
  rightEyeContour: NormalizedLandmark[];
  /** Canonical left iris landmarks (5 points: center + 4 perimeter points) */
  leftIris: NormalizedLandmark[];
  /** Canonical right iris landmarks (5 points: center + 4 perimeter points) */
  rightIris: NormalizedLandmark[];
}

/**
 * Strictly factual diagnostic indicators for the Vision Pipeline.
 * NOTE: No subjective 'confidence' or arbitrary 'quality' scores are used.
 */
export interface DiagnosticState {
  /** True when camera stream is active and video track is running */
  cameraActive: boolean;
  /** True when MediaPipe FaceLandmarker model has been loaded from local asset */
  modelLoaded: boolean;
  /** True if a face was detected in the current video frame */
  faceDetected: boolean;
  /** True if landmarks were successfully extracted from the detection */
  landmarksAvailable: boolean;
  /** Total expected iris landmarks (5 left + 5 right = 10) */
  expectedIrisCount: number;
  /** Actual count of valid iris landmarks extracted (0 to 10) */
  actualIrisCount: number;
  /** Frame rate calculated over recent frame loop */
  fps: number;
  /** Camera status message or error description if camera access fails */
  cameraStatusText: string;
  /** Model status message or error description if model loading fails */
  modelStatusText: string;
  /** Whether factual console logging is enabled */
  loggingEnabled: boolean;
}

/**
 * Factual geometric validity status for per-eye gaze features.
 * NOTE: Strict geometric checks only (no heuristic blink classification).
 */
export type GazeFeatureValidity =
  | 'VALID'
  | 'MISSING_LANDMARKS'
  | 'INVALID_GEOMETRY';

/**
 * Factual validity status for bilateral gaze features.
 * NOTE: Bilateral features are populated ONLY when both eyes are VALID.
 */
export type BilateralStatus =
  | 'VALID'
  | 'ONLY_LEFT_VALID'
  | 'ONLY_RIGHT_VALID'
  | 'NONE_VALID';

/**
 * Normalized eye-local gaze features for a single eye.
 * Uses the stable eye corners (canthi) to define the local 2D coordinate frame.
 */
export interface EyeGazeFeature {
  /**
   * Canonical horizontal position relative to corner reference span.
   * Nominal reference range: [-1.0, +1.0] (unclamped).
   * -1.0 = image-left reference corner, 0.0 = center, +1.0 = image-right reference corner.
   */
  horizontalPosition: number | null;
  /**
   * Signed local vertical displacement of the iris relative to the eye-corner coordinate frame.
   * Nominal reference range: [-1.0, +1.0] (unclamped).
   * V = 0: Iris center projects onto the local horizontal inter-corner line through the corner midpoint.
   * V > 0: Iris has positive displacement toward image-down within the local eye frame.
   * V < 0: Iris has negative displacement toward image-up within the local eye frame.
   * [-1.0, +1.0] is a nominal numerical normalization range, NOT anatomical gaze limits.
   */
  verticalPosition: number | null;
  /**
   * Normalized horizontal ratio: (horizontalPosition + 1) / 2.
   * Nominal reference range: [0.0, 1.0] (unclamped).
   */
  horizontalRatio: number | null;
  /**
   * Normalized vertical ratio: (verticalPosition + 1) / 2.
   * Nominal reference range: [0.0, 1.0] (unclamped).
   */
  verticalRatio: number | null;
  /** Designated canonical iris center landmark in normalized image coordinates */
  irisCenter: NormalizedLandmark | null;
  /** Eye corner reference span (width W) in normalized image coordinates */
  eyeWidth: number | null;
  /** Strictly geometric validity status */
  status: GazeFeatureValidity;
}

/**
 * Bilateral combined gaze features.
 * Populated ONLY when both eyes are 'VALID'. Otherwise all coordinates are null.
 */
export interface BilateralGazeFeature {
  /** Combined horizontal position [-1.0, 1.0] (unclamped), populated ONLY when status === 'VALID' */
  horizontalPosition: number | null;
  /** Combined vertical position [-1.0, 1.0] (unclamped), populated ONLY when status === 'VALID' */
  verticalPosition: number | null;
  /** Combined horizontal ratio [0.0, 1.0] (unclamped), populated ONLY when status === 'VALID' */
  horizontalRatio: number | null;
  /** Combined vertical ratio [0.0, 1.0] (unclamped), populated ONLY when status === 'VALID' */
  verticalRatio: number | null;
  /** Factual bilateral status */
  status: BilateralStatus;
}

/**
 * Complete set of extracted gaze features for both eyes and bilateral combination.
 */
export interface GazeFeatureSet {
  /** Subject's anatomical right eye (MediaPipe indices 33, 133, 468) */
  rightEye: EyeGazeFeature;
  /** Subject's anatomical left eye (MediaPipe indices 362, 263, 473) */
  leftEye: EyeGazeFeature;
  /** Bilateral combination */
  bilateral: BilateralGazeFeature;
  /** Timestamp in milliseconds of the analyzed video frame */
  timestampMs: number;
}

