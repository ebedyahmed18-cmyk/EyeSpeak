export interface CameraInitResult {
  stream: MediaStream;
  statusText: string;
}

/**
 * Initializes webcam access via getUserMedia and attaches the stream to the given video element.
 */
export async function startCamera(videoElement: HTMLVideoElement): Promise<CameraInitResult> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera API (navigator.mediaDevices.getUserMedia) is not supported in this browser.');
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
        frameRate: { ideal: 30 },
      },
      audio: false,
    });

    videoElement.srcObject = stream;

    // Await metadata load to ensure video dimensions are resolved
    await new Promise<void>((resolve) => {
      if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
        resolve();
      } else {
        videoElement.onloadedmetadata = () => {
          resolve();
        };
      }
    });

    await videoElement.play();

    return {
      stream,
      statusText: `Camera active (${videoElement.videoWidth}x${videoElement.videoHeight})`,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Camera permission was denied. Please allow camera access in your browser settings.');
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('No camera device detected. Please connect a webcam.');
      }
      if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        throw new Error('Camera is already in use by another application.');
      }
      throw new Error(`Camera error: ${err.name} - ${err.message}`);
    }
    throw err;
  }
}

/**
 * Cleanly stops all tracks of the given MediaStream.
 */
export function stopCamera(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    track.stop();
  });
}
