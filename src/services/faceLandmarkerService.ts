import { FaceLandmarker, FilesetResolver, FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export class FaceLandmarkerService {
  private landmarker: FaceLandmarker | null = null;
  private isInitializing = false;

  /**
   * Initializes FaceLandmarker using strictly local WASM binaries and model asset.
   * NOTE: No external CDN or API endpoint is contacted.
   */
  public async initialize(): Promise<void> {
    if (this.landmarker) return;
    if (this.isInitializing) return;

    this.isInitializing = true;
    try {
      // Points exclusively to the local /mediapipe/wasm directory served by the application
      const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');

      // Points exclusively to the local model asset verified via SHA-256
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/models/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Runs landmark detection on a specific video frame at timestampMs.
   */
  public detectVideoFrame(videoElement: HTMLVideoElement, timestampMs: number): FaceLandmarkerResult | null {
    if (!this.landmarker) return null;
    if (videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;

    try {
      return this.landmarker.detectForVideo(videoElement, timestampMs);
    } catch (err) {
      console.error('[FaceLandmarkerService] Detection error:', err);
      return null;
    }
  }

  /**
   * Checks whether the landmarker is initialized and ready for inference.
   */
  public isReady(): boolean {
    return this.landmarker !== null;
  }

  /**
   * Releases resources allocated by the underlying MediaPipe landmarker.
   */
  public dispose(): void {
    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch {
        // Ignore close error on unmount
      }
      this.landmarker = null;
    }
  }
}

// Export singleton instance for the vision pipeline
export const faceLandmarkerService = new FaceLandmarkerService();
