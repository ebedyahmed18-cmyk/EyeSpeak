import { useEffect, useRef } from 'react';
import type { FC } from 'react';
import type { ExtractedLandmarks, GazeFeatureSet } from '../types/vision';
import { RIGHT_EYE_LANDMARKS, LEFT_EYE_LANDMARKS } from '../services/gazeFeatureExtractor';

interface DebugOverlayProps {
  landmarks: ExtractedLandmarks | null;
  gazeFeatures?: GazeFeatureSet | null;
  videoElement: HTMLVideoElement | null;
}

export const DebugOverlay: FC<DebugOverlayProps> = ({
  landmarks,
  gazeFeatures,
  videoElement,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Synchronize canvas resolution to match natural video resolution
    if (videoElement && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
      if (canvas.width !== videoElement.videoWidth || canvas.height !== videoElement.videoHeight) {
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
      }
    }

    const width = canvas.width;
    const height = canvas.height;

    // Clear previous frame
    ctx.clearRect(0, 0, width, height);

    if (!landmarks) return;

    // 1. Draw Face Mesh (faint subtle dots for orientation)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';
    for (let i = 0; i < landmarks.faceMesh.length; i++) {
      const pt = landmarks.faceMesh[i];
      ctx.beginPath();
      ctx.arc(pt.x * width, pt.y * height, 1.0, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Helper to draw contour path
    const drawContour = (
      points: Array<{ x: number; y: number }>,
      strokeColor: string,
      fillColor?: string
    ) => {
      if (points.length === 0) return;
      ctx.beginPath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.moveTo(points[0].x * width, points[0].y * height);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x * width, points[i].y * height);
      }
      ctx.closePath();
      ctx.stroke();

      if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
    };

    // 2. Draw Left & Right Eye Contours (Cyan)
    drawContour(landmarks.leftEyeContour, '#00e5ff', 'rgba(0, 229, 255, 0.08)');
    drawContour(landmarks.rightEyeContour, '#00e5ff', 'rgba(0, 229, 255, 0.08)');

    // 3. Draw Iris Landmarks
    const drawIris = (points: Array<{ x: number; y: number }>, label: string) => {
      if (points.length === 0) return;

      // Draw perimeter boundary
      if (points.length >= 5) {
        const perimeter = [points[1], points[2], points[3], points[4]];
        drawContour(perimeter, '#39ff14', 'rgba(57, 255, 20, 0.12)');
      }

      // Draw other iris boundary dots
      for (let i = 1; i < points.length; i++) {
        const pt = points[i];
        ctx.beginPath();
        ctx.arc(pt.x * width, pt.y * height, 2, 0, 2 * Math.PI);
        ctx.fillStyle = '#39ff14';
        ctx.fill();
      }

      // Small diagnostic label near iris
      const center = points[0];
      ctx.font = '10px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, center.x * width + 6, center.y * height - 6);
    };

    drawIris(landmarks.leftIris, 'L-Iris');
    drawIris(landmarks.rightIris, 'R-Iris');

    // 4. Task 2 Eye-Local Axes & Designated Iris Center Markers (Candidate B)
    const mesh = landmarks.faceMesh;
    const drawEyeAxes = (
      startIdx: number,
      endIdx: number,
      irisIdx: number,
      hVal: number | null | undefined,
      vVal: number | null | undefined
    ) => {
      if (
        startIdx >= mesh.length ||
        endIdx >= mesh.length ||
        irisIdx >= mesh.length
      ) {
        return;
      }

      const pStart = mesh[startIdx];
      const pEnd = mesh[endIdx];
      const pIris = mesh[irisIdx];

      // Horizontal axis: P_start -> P_end (cyan-blue line)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.moveTo(pStart.x * width, pStart.y * height);
      ctx.lineTo(pEnd.x * width, pEnd.y * height);
      ctx.stroke();

      // Perpendicular vertical axis: corner-based orthogonal axis through midpoint (pink-magenta line)
      const vHx = pEnd.x - pStart.x;
      const vHy = pEnd.y - pStart.y;
      const spanW = Math.hypot(vHx, vHy);
      if (spanW > 1e-6) {
        const uHx = vHx / spanW;
        const uHy = vHy / spanW;
        let uVx = -uHy;
        let uVy = uHx;
        if (uVy < 0) {
          uVx = -uVx;
          uVy = -uVy;
        }

        const oX = (pStart.x + pEnd.x) / 2;
        const oY = (pStart.y + pEnd.y) / 2;
        const halfSpan = spanW / 2;

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 64, 129, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.moveTo((oX - uVx * halfSpan) * width, (oY - uVy * halfSpan) * height);
        ctx.lineTo((oX + uVx * halfSpan) * width, (oY + uVy * halfSpan) * height);
        ctx.stroke();
      }

      // Designated canonical iris center (vibrant gold circle with black border)
      ctx.beginPath();
      ctx.arc(pIris.x * width, pIris.y * height, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffd600';
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Factual H/V badge near eye
      if (hVal !== null && hVal !== undefined && vVal !== null && vVal !== undefined) {
        const text = `H:${hVal > 0 ? '+' : ''}${hVal.toFixed(2)} V:${vVal > 0 ? '+' : ''}${vVal.toFixed(2)}`;
        ctx.font = '10px monospace';
        ctx.fillStyle = '#ffd600';
        ctx.fillText(text, pStart.x * width, (pStart.y + 0.04) * height);
      }
    };

    // Right eye axes & center
    drawEyeAxes(
      RIGHT_EYE_LANDMARKS.startCorner,
      RIGHT_EYE_LANDMARKS.endCorner,
      RIGHT_EYE_LANDMARKS.irisCenter,
      gazeFeatures?.rightEye.horizontalPosition,
      gazeFeatures?.rightEye.verticalPosition
    );

    // Left eye axes & center
    drawEyeAxes(
      LEFT_EYE_LANDMARKS.startCorner,
      LEFT_EYE_LANDMARKS.endCorner,
      LEFT_EYE_LANDMARKS.irisCenter,
      gazeFeatures?.leftEye.horizontalPosition,
      gazeFeatures?.leftEye.verticalPosition
    );
  }, [landmarks, gazeFeatures, videoElement]);

  return <canvas ref={canvasRef} className="debug-canvas" />;
};
