import { useState, useRef, useEffect, type FC } from 'react';
import { useVisionPipeline } from '../hooks/useVisionPipeline';
import { useCalibration } from '../hooks/useCalibration';
import { CameraFeed } from './CameraFeed';
import { DebugOverlay } from './DebugOverlay';
import { DiagnosticPanel } from './DiagnosticPanel';
import { CalibrationOverlay } from './CalibrationOverlay';
import { CalibrationDebugPanel } from './CalibrationDebugPanel';

export const VisionPipelineViewer: FC = () => {
  const { videoRef, diagnostics, extractedLandmarks, gazeFeatures, toggleLogging } =
    useVisionPipeline();

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 960, height: 540 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const updateSize = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        setViewportSize({ width: el.clientWidth, height: el.clientHeight });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { sessionState, liveMapping, startCalibration, cancelCalibration } = useCalibration(
    gazeFeatures,
    viewportSize.width,
    viewportSize.height
  );

  return (
    <div className="viewer-container">
      {/* Video & Canvas Overlay Viewport */}
      <div className="viewport-wrapper" ref={stageRef}>
        <div className="feed-stage">
          <CameraFeed ref={videoRef} />
          <DebugOverlay
            landmarks={extractedLandmarks}
            gazeFeatures={gazeFeatures}
            videoElement={videoRef.current}
          />
          <CalibrationOverlay
            sessionState={sessionState}
            liveMapping={liveMapping}
            viewportWidth={viewportSize.width}
            viewportHeight={viewportSize.height}
          />
        </div>

        {!diagnostics.cameraActive && (
          <div className="viewport-placeholder">
            <div className="spinner" />
            <p>{diagnostics.cameraStatusText}</p>
          </div>
        )}
      </div>

      {/* Task 3 Calibration Debug Interface */}
      <CalibrationDebugPanel
        sessionState={sessionState}
        liveMapping={liveMapping}
        gazeFeatures={gazeFeatures}
        viewportWidth={viewportSize.width}
        viewportHeight={viewportSize.height}
        onStartCalibration={startCalibration}
        onCancelCalibration={cancelCalibration}
      />

      {/* Structured Diagnostic Panel (Task 1 & Task 2) */}
      <DiagnosticPanel
        diagnostics={diagnostics}
        gazeFeatures={gazeFeatures}
        landmarks={extractedLandmarks}
        onToggleLogging={toggleLogging}
      />
    </div>
  );
};
