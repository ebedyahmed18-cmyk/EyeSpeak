import type {
  NormalizedLandmark,
  ExtractedLandmarks,
  EyeGazeFeature,
  BilateralGazeFeature,
  GazeFeatureSet,
} from '../types/vision.ts';

/**
 * Canonical landmark indices for anatomical Right Eye (MediaPipe official).
 * Sits at image-left in unmirrored video (x ~ 0.35).
 * Uses stable eye corners (P33, P133) and canonical iris center (P468).
 */
export const RIGHT_EYE_LANDMARKS = {
  irisCenter: 468,
  startCorner: 33, // Lateral / temple
  endCorner: 133, // Medial / nose
} as const;

/**
 * Canonical landmark indices for anatomical Left Eye (MediaPipe official).
 * Sits at image-right in unmirrored video (x ~ 0.65).
 * Uses stable eye corners (P362, P263) and canonical iris center (P473).
 */
export const LEFT_EYE_LANDMARKS = {
  irisCenter: 473,
  startCorner: 362, // Medial / nose
  endCorner: 263, // Lateral / temple
} as const;

/** Numerical tolerance guard against division by zero (strictly geometric) */
export const GEOMETRIC_EPSILON = 1e-6;

/**
 * Computes pure eye-local gaze features for a single eye given its canonical landmarks
 * using the stable eye-corner (canthi) reference frame (Candidate B).
 *
 * Horizontal Axis:
 * - CornerStart -> CornerEnd (oriented along +X_img)
 * - uH = normalize(cornerEnd - cornerStart)
 *
 * Vertical Axis:
 * - Perpendicular to horizontal axis: uV = (-uHy, uHx)
 * - Orientation guard: if uVy < 0, uV = -uV (guarantees orientation toward image-down +Y)
 *
 * Origin:
 * - cornerMidpoint = (cornerStart + cornerEnd) / 2
 *
 * Iris Displacement:
 * - d = irisCenter - cornerMidpoint
 *
 * Normalization (Isotropic):
 * - H = dot(d, uH) / (W / 2)
 * - V = dot(d, uV) / (W / 2)
 * - ratio = (position + 1) / 2
 *
 * Semantics:
 * - Signed local vertical displacement of the iris relative to the eye-corner coordinate frame.
 * - V = 0: Iris center projects onto the local horizontal inter-corner line through the corner midpoint.
 * - V > 0: Iris has positive displacement toward image-down within the local eye frame.
 * - V < 0: Iris has negative displacement toward image-up within the local eye frame.
 * - [-1.0, +1.0] is a nominal numerical normalization range, NOT anatomical gaze limits.
 * - All outputs remain strictly unclamped.
 *
 * Cross-Axis Characterization Note:
 * Real webcam data shows measurable horizontal-to-vertical coupling due to ocular globe
 * spherical curvature (Listing's Law) and natural canthal tilt during lateral eye excursion.
 * The vertical response is not guaranteed universally zero during real ocular movement;
 * this residual coupling is characterized and will be resolved during later user-specific calibration (Task 3).
 */
export function computeEyeGazeFeature(
  irisCenter: NormalizedLandmark | undefined | null,
  startCorner: NormalizedLandmark | undefined | null,
  endCorner: NormalizedLandmark | undefined | null
): EyeGazeFeature {
  // 1. Landmark presence validation
  if (!irisCenter || !startCorner || !endCorner) {
    return {
      horizontalPosition: null,
      verticalPosition: null,
      horizontalRatio: null,
      verticalRatio: null,
      irisCenter: irisCenter ?? null,
      eyeWidth: null,
      status: 'MISSING_LANDMARKS',
    };
  }

  // 2. Eye-Local Horizontal Axis (CornerStart -> CornerEnd)
  const vHorizX = endCorner.x - startCorner.x;
  const vHorizY = endCorner.y - startCorner.y;
  const eyeWidth = Math.hypot(vHorizX, vHorizY);

  // 3. Geometric degeneracy check (division-by-zero guard)
  if (eyeWidth <= GEOMETRIC_EPSILON) {
    return {
      horizontalPosition: null,
      verticalPosition: null,
      horizontalRatio: null,
      verticalRatio: null,
      irisCenter,
      eyeWidth,
      status: 'INVALID_GEOMETRY',
    };
  }

  // 4. Horizontal Unit Basis Vector
  const uHorizX = vHorizX / eyeWidth;
  const uHorizY = vHorizY / eyeWidth;

  // 5. Perpendicular Vertical Unit Basis Vector pointing toward image-down (+Y_img)
  // Rotating (+1, 0) clockwise gives (0, +1): (-uHy, uHx)
  let uVertX = -uHorizY;
  let uVertY = uHorizX;
  if (uVertY < 0) {
    uVertX = -uVertX;
    uVertY = -uVertY;
  }

  // 6. Stable Origin: Midpoint of Bony Eye Corners
  const oCornerX = (startCorner.x + endCorner.x) / 2;
  const oCornerY = (startCorner.y + endCorner.y) / 2;

  // 7. Iris Displacement Relative to Corner Origin
  const dX = irisCenter.x - oCornerX;
  const dY = irisCenter.y - oCornerY;

  // 8. Dot Product Projections
  const dotHoriz = dX * uHorizX + dY * uHorizY;
  const dotVert = dX * uVertX + dY * uVertY;

  // 9. Pure Isotropic Normalization (denom = W / 2)
  const halfWidth = eyeWidth / 2;

  const horizontalPosition = dotHoriz / halfWidth;
  const horizontalRatio = (horizontalPosition + 1) / 2;

  const verticalPosition = dotVert / halfWidth;
  const verticalRatio = (verticalPosition + 1) / 2;

  return {
    horizontalPosition,
    verticalPosition,
    horizontalRatio,
    verticalRatio,
    irisCenter,
    eyeWidth,
    status: 'VALID',
  };
}

/**
 * Fuses per-eye gaze features into a bilateral representation.
 * Coordinates are populated ONLY when both eyes are 'VALID'.
 */
export function combineBilateralFeatures(
  rightEye: EyeGazeFeature,
  leftEye: EyeGazeFeature
): BilateralGazeFeature {
  const isRightValid = rightEye.status === 'VALID';
  const isLeftValid = leftEye.status === 'VALID';

  if (isRightValid && isLeftValid) {
    return {
      horizontalPosition: (rightEye.horizontalPosition! + leftEye.horizontalPosition!) / 2,
      verticalPosition: (rightEye.verticalPosition! + leftEye.verticalPosition!) / 2,
      horizontalRatio: (rightEye.horizontalRatio! + leftEye.horizontalRatio!) / 2,
      verticalRatio: (rightEye.verticalRatio! + leftEye.verticalRatio!) / 2,
      status: 'VALID',
    };
  }

  if (isLeftValid && !isRightValid) {
    return {
      horizontalPosition: null,
      verticalPosition: null,
      horizontalRatio: null,
      verticalRatio: null,
      status: 'ONLY_LEFT_VALID',
    };
  }

  if (isRightValid && !isLeftValid) {
    return {
      horizontalPosition: null,
      verticalPosition: null,
      horizontalRatio: null,
      verticalRatio: null,
      status: 'ONLY_RIGHT_VALID',
    };
  }

  return {
    horizontalPosition: null,
    verticalPosition: null,
    horizontalRatio: null,
    verticalRatio: null,
    status: 'NONE_VALID',
  };
}

/**
 * Top-level aggregator: extracts per-eye and bilateral gaze features from raw landmark collections.
 * Safely accesses canonical landmarks from extracted.faceMesh.
 */
export function extractGazeFeatures(
  extracted: ExtractedLandmarks | null | undefined,
  timestampMs: number = performance.now()
): GazeFeatureSet | null {
  if (!extracted || !extracted.faceMesh || extracted.faceMesh.length === 0) {
    return null;
  }

  const mesh = extracted.faceMesh;

  // Extract Right Eye landmarks (P33, P133, P468)
  const rightEye = computeEyeGazeFeature(
    mesh[RIGHT_EYE_LANDMARKS.irisCenter],
    mesh[RIGHT_EYE_LANDMARKS.startCorner],
    mesh[RIGHT_EYE_LANDMARKS.endCorner]
  );

  // Extract Left Eye landmarks (P362, P263, P473)
  const leftEye = computeEyeGazeFeature(
    mesh[LEFT_EYE_LANDMARKS.irisCenter],
    mesh[LEFT_EYE_LANDMARKS.startCorner],
    mesh[LEFT_EYE_LANDMARKS.endCorner]
  );

  // Combine bilateral
  const bilateral = combineBilateralFeatures(rightEye, leftEye);

  return {
    rightEye,
    leftEye,
    bilateral,
    timestampMs,
  };
}
