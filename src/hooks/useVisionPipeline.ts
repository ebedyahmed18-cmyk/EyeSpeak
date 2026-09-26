import { useEffect, useRef, useState, useCallback } from 'react';
import type { DiagnosticState, ExtractedLandmarks, GazeFeatureSet } from '../types/vision';
import { startCamera, stopCamera } from '../services/cameraService';
import { faceLandmarkerService } from '../services/faceLandmarkerService';
import { extractLandmarks, countValidIrisPoints, EXPECTED_IRIS_COUNT } from '../services/landmarkExtractor';
import { extractGazeFeatures } from '../services/gazeFeatureExtractor';

export function useVisionPipeline() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  // FPS calculation refs
  const frameCountRef = useRef<number>(0);
  const lastFpsTimestampRef = useRef<number>(performance.now());
  const currentFpsRef = useRef<number>(0);

  // Logging throttle ref (logs every ~1 second if enabled)
  const lastLogTimestampRef = useRef<number>(0);
  const loggingEnabledRef = useRef<boolean>(false);

  const [extractedLandmarks, setExtractedLandmarks] = useState<ExtractedLandmarks | null>(null);
  const [gazeFeatures, setGazeFeatures] = useState<GazeFeatureSet | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticState>({
    cameraActive: false,
    modelLoaded: false,
    faceDetected: false,
    landmarksAvailable: false,
    expectedIrisCount: EXPECTED_IRIS_COUNT,
    actualIrisCount: 0,
    fps: 0,
    cameraStatusText: 'Initializing camera...',
    modelStatusText: 'Loading local FaceLandmarker model...',
    loggingEnabled: false,
  });

  const toggleLogging = useCallback(() => {
    setDiagnostics((prev) => {
      const next = !prev.loggingEnabled;
      loggingEnabledRef.current = next;
      console.log(`[VisionPipeline] Factual console logging ${next ? 'ENABLED' : 'DISABLED'}`);
      return { ...prev, loggingEnabled: next };
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initPipeline() {
      const video = videoRef.current;
      if (!video) return;

      // 1. Initialize Camera
      try {
        const { stream, statusText } = await startCamera(video);
        if (!isMounted) {
          stopCamera(stream);
          return;
        }
        streamRef.current = stream;
        setDiagnostics((prev) => ({
          ...prev,
          cameraActive: true,
          cameraStatusText: statusText,
        }));
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Camera failed to initialize';
        setDiagnostics((prev) => ({
          ...prev,
          cameraActive: false,
          cameraStatusText: msg,
        }));
        return;
      }

      // 2. Initialize MediaPipe FaceLandmarker
      try {
        await faceLandmarkerService.initialize();
        if (!isMounted) return;
        setDiagnostics((prev) => ({
          ...prev,
          modelLoaded: true,
          modelStatusText: 'Model loaded successfully (local asset)',
        }));
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to load local model asset';
        setDiagnostics((prev) => ({
          ...prev,
          modelLoaded: false,
          modelStatusText: msg,
        }));
        return;
      }

      // 3. Start Detection Loop
      function renderLoop() {
        if (!isMounted) return;

        const currentVideo = videoRef.current;
        const now = performance.now();

        // FPS tracking
        frameCountRef.current++;
        if (now - lastFpsTimestampRef.current >= 1000) {
          currentFpsRef.current = Math.round(
            (frameCountRef.current * 1000) / (now - lastFpsTimestampRef.current)
          );
          frameCountRef.current = 0;
          lastFpsTimestampRef.current = now;
        }

        if (
          currentVideo &&
          currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          currentVideo.currentTime !== lastVideoTimeRef.current
        ) {
          lastVideoTimeRef.current = currentVideo.currentTime;

          const result = faceLandmarkerService.detectVideoFrame(currentVideo, now);

          if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
            const rawFace = result.faceLandmarks[0];
            const extracted = extractLandmarks(rawFace);
            const actualIrisCount = countValidIrisPoints(extracted);
            const features = extractGazeFeatures(extracted, now);

            setExtractedLandmarks(extracted);
            setGazeFeatures(features);
            setDiagnostics((prev) => ({
              ...prev,
              faceDetected: true,
              landmarksAvailable: extracted !== null,
              actualIrisCount,
              fps: currentFpsRef.current,
            }));

            // Factual console logging if enabled
            if (loggingEnabledRef.current && now - lastLogTimestampRef.current >= 1000) {
              lastLogTimestampRef.current = now;
              console.log(
                `[VisionPipeline Log] Face: YES | Irises: ${actualIrisCount}/${EXPECTED_IRIS_COUNT} | FPS: ${currentFpsRef.current}`
              );
              if (features) {
                console.log(
                  `[Task 2 GazeFeatures] R(H: ${features.rightEye.horizontalPosition?.toFixed(2) ?? 'null'}, V: ${features.rightEye.verticalPosition?.toFixed(2) ?? 'null'}, ${features.rightEye.status}) | ` +
                  `L(H: ${features.leftEye.horizontalPosition?.toFixed(2) ?? 'null'}, V: ${features.leftEye.verticalPosition?.toFixed(2) ?? 'null'}, ${features.leftEye.status}) | ` +
                  `Bilateral(H: ${features.bilateral.horizontalPosition?.toFixed(2) ?? 'null'}, V: ${features.bilateral.verticalPosition?.toFixed(2) ?? 'null'}, ${features.bilateral.status})`
                );
              }
            }
          } else {
            setExtractedLandmarks(null);
            setGazeFeatures(null);
            setDiagnostics((prev) => ({
              ...prev,
              faceDetected: false,
              landmarksAvailable: false,
              actualIrisCount: 0,
              fps: currentFpsRef.current,
            }));

            if (loggingEnabledRef.current && now - lastLogTimestampRef.current >= 1000) {
              lastLogTimestampRef.current = now;
              console.log(
                `[VisionPipeline Log] Face: NO | Irises: 0/${EXPECTED_IRIS_COUNT} | FPS: ${currentFpsRef.current}`
              );
            }
          }
        }

        animFrameIdRef.current = requestAnimationFrame(renderLoop);
      }

      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    }

    initPipeline();

    return () => {
      isMounted = false;
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      stopCamera(streamRef.current);
      faceLandmarkerService.dispose();
    };
  }, []);

  return {
    videoRef,
    diagnostics,
    extractedLandmarks,
    gazeFeatures,
    toggleLogging,
  };
}
