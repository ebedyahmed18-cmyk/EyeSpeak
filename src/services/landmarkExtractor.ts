import { NormalizedLandmark, ExtractedLandmarks } from '../types/vision';

// Canonical MediaPipe face mesh eye contour indices
export const LEFT_EYE_CONTOUR_INDICES = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
] as const;

export const RIGHT_EYE_CONTOUR_INDICES = [
  263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466,
] as const;

// Canonical MediaPipe iris indices (center + 4 boundary landmarks)
export const LEFT_IRIS_INDICES = [468, 469, 470, 471, 472] as const;
export const RIGHT_IRIS_INDICES = [473, 474, 475, 476, 477] as const;

export const EXPECTED_IRIS_COUNT = LEFT_IRIS_INDICES.length + RIGHT_IRIS_INDICES.length; // 10

/**
 * Extracts raw face mesh, eye contours, and iris landmarks from MediaPipe raw landmark list.
 * NOTE: Strictly extracts raw coordinates; does NOT calculate gaze direction or gaze features.
 */
export function extractLandmarks(
  rawLandmarks: Array<{ x: number; y: number; z?: number }> | undefined | null
): ExtractedLandmarks | null {
  if (!rawLandmarks || rawLandmarks.length === 0) {
    return null;
  }

  const faceMesh: NormalizedLandmark[] = rawLandmarks.map((pt) => ({
    x: pt.x,
    y: pt.y,
    z: pt.z ?? 0,
  }));

  const leftEyeContour: NormalizedLandmark[] = [];
  for (const idx of LEFT_EYE_CONTOUR_INDICES) {
    if (idx < faceMesh.length) {
      leftEyeContour.push(faceMesh[idx]);
    }
  }

  const rightEyeContour: NormalizedLandmark[] = [];
  for (const idx of RIGHT_EYE_CONTOUR_INDICES) {
    if (idx < faceMesh.length) {
      rightEyeContour.push(faceMesh[idx]);
    }
  }

  const leftIris: NormalizedLandmark[] = [];
  for (const idx of LEFT_IRIS_INDICES) {
    if (idx < faceMesh.length) {
      leftIris.push(faceMesh[idx]);
    }
  }

  const rightIris: NormalizedLandmark[] = [];
  for (const idx of RIGHT_IRIS_INDICES) {
    if (idx < faceMesh.length) {
      rightIris.push(faceMesh[idx]);
    }
  }

  return {
    faceMesh,
    leftEyeContour,
    rightEyeContour,
    leftIris,
    rightIris,
  };
}

/**
 * Calculates factual count of available iris landmarks.
 */
export function countValidIrisPoints(landmarks: ExtractedLandmarks | null): number {
  if (!landmarks) return 0;
  return landmarks.leftIris.length + landmarks.rightIris.length;
}
