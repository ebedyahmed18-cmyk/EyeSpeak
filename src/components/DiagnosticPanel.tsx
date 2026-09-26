import { useState, useRef, type FC } from 'react';
import type { DiagnosticState, GazeFeatureSet, ExtractedLandmarks } from '../types/vision';

interface DiagnosticPanelProps {
  diagnostics: DiagnosticState;
  gazeFeatures: GazeFeatureSet | null;
  landmarks?: ExtractedLandmarks | null;
  onToggleLogging: () => void;
}

export const DiagnosticPanel: FC<DiagnosticPanelProps> = ({
  diagnostics,
  gazeFeatures,
  landmarks,
  onToggleLogging,
}) => {
  const [capturedNeutral, setCapturedNeutral] = useState<any>(null);
  const [capturedDownward, setCapturedDownward] = useState<any>(null);
  const [capturedUpward, setCapturedUpward] = useState<any>(null);
  const [capturedLookRight, setCapturedLookRight] = useState<any>(null);
  const [capturedLookLeft, setCapturedLookLeft] = useState<any>(null);
  const [captureStatus, setCaptureStatus] = useState<string>('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [targetLabel, setTargetLabel] = useState<string | null>(null);

  const landmarksRef = useRef(landmarks);
  landmarksRef.current = landmarks;

  const startControlledCapture = (label: 'neutral' | 'downward' | 'upward' | 'look_right' | 'look_left') => {
    if (countdown !== null) return;
    setTargetLabel(label);
    setCountdown(3);
    setCaptureStatus(`Stabilize head & eyes for [${label.replace('_', ' ').toUpperCase()}]... 3s`);

    let remaining = 3;
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdown(remaining);
        setCaptureStatus(`Hold steady... ${remaining}s`);
      } else {
        clearInterval(timer);
        setCountdown(null);
        setTargetLabel(null);
        captureFrame(label, landmarksRef.current);
      }
    }, 1000);
  };

  const captureFrame = async (
    label: 'neutral' | 'downward' | 'upward' | 'look_right' | 'look_left',
    activeLandmarks = landmarksRef.current
  ) => {
    if (!activeLandmarks?.faceMesh || activeLandmarks.faceMesh.length < 478) {
      setCaptureStatus('Error: Full face mesh (478 landmarks) not available');
      return;
    }

    const mesh = activeLandmarks.faceMesh;
    // Right Eye
    const r159 = mesh[159];
    const r145 = mesh[145];
    const r468 = mesh[468];
    const r33  = mesh[33];
    const r133 = mesh[133];

    // Left Eye
    const l386 = mesh[386];
    const l374 = mesh[374];
    const l473 = mesh[473];
    const l362 = mesh[362];
    const l263 = mesh[263];

    function analyzeEye(eyeName: string, upper: any, lower: any, iris: any, cStart: any, cEnd: any) {
      // Candidate A: Current eyelid-based
      const vVertX = lower.x - upper.x;
      const vVertY = lower.y - upper.y;
      const H = Math.hypot(vVertX, vVertY);
      const uVertX = vVertX / H;
      const uVertY = vVertY / H;
      const oVertX = (upper.x + lower.x) / 2;
      const oVertY = (upper.y + lower.y) / 2;
      const dX = iris.x - oVertX;
      const dY = iris.y - oVertY;
      const dotVert = dX * uVertX + dY * uVertY;
      const finalV_A = dotVert / (H / 2);

      // Candidate B: Stable eye-corner reference
      const vHorizX = cEnd.x - cStart.x;
      const vHorizY = cEnd.y - cStart.y;
      const W = Math.hypot(vHorizX, vHorizY);
      const uHorizX = vHorizX / W;
      const uHorizY = vHorizY / W;
      // perpendicular pointing downward (+Y)
      let uVertBX = -uHorizY;
      let uVertBY = uHorizX;
      if (uVertBY < 0) { uVertBX = -uVertBX; uVertBY = -uVertBY; }
      const oCornerX = (cStart.x + cEnd.x) / 2;
      const oCornerY = (cStart.y + cEnd.y) / 2;
      const dIrisBX = iris.x - oCornerX;
      const dIrisBY = iris.y - oCornerY;
      const dotVertB = dIrisBX * uVertBX + dIrisBY * uVertBY;
      const finalV_B = dotVertB / (W / 2);

      return {
        eyeName,
        landmarks: {
          upperRef: { x: upper.x, y: upper.y, z: upper.z },
          lowerRef: { x: lower.x, y: lower.y, z: lower.z },
          irisCenter: { x: iris.x, y: iris.y, z: iris.z },
          cornerStart: { x: cStart.x, y: cStart.y, z: cStart.z },
          cornerEnd: { x: cEnd.x, y: cEnd.y, z: cEnd.z },
        },
        candidateA: {
          horizontalAxisVec: { x: vHorizX, y: vHorizY },
          horizontalSpanW: W,
          verticalAxisVec: { x: vVertX, y: vVertY },
          verticalSpanH: H,
          verticalUnitVec: { x: uVertX, y: uVertY },
          verticalMidpoint: { x: oVertX, y: oVertY },
          irisCenter: { x: iris.x, y: iris.y, z: iris.z },
          irisToMidpointVec: { x: dX, y: dY },
          verticalDotProduct: dotVert,
          finalV: finalV_A,
        },
        candidateB: {
          cornerWidthW: W,
          cornerMidpoint: { x: oCornerX, y: oCornerY },
          verticalAxisUnit: { x: uVertBX, y: uVertBY },
          irisToCornerMidpointVec: { x: dIrisBX, y: dIrisBY },
          verticalDotProduct: dotVertB,
          finalV: finalV_B,
        }
      };
    }

    const rightAnalysis = analyzeEye('Right Eye (Subject Right)', r159, r145, r468, r33, r133);
    const leftAnalysis = analyzeEye('Left Eye (Subject Left)', l386, l374, l473, l362, l263);

    const frameData = {
      label,
      timestamp: new Date().toISOString(),
      right: rightAnalysis,
      left: leftAnalysis,
      bilateral: {
        candidateA_V: (rightAnalysis.candidateA.finalV + leftAnalysis.candidateA.finalV) / 2,
        candidateB_V: (rightAnalysis.candidateB.finalV + leftAnalysis.candidateB.finalV) / 2,
      }
    };

    if (label === 'neutral') {
      setCapturedNeutral(frameData);
    } else if (label === 'downward') {
      setCapturedDownward(frameData);
    } else if (label === 'upward') {
      setCapturedUpward(frameData);
    } else if (label === 'look_right') {
      setCapturedLookRight(frameData);
    } else if (label === 'look_left') {
      setCapturedLookLeft(frameData);
    }

    try {
      await fetch('/api/save-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(frameData)
      });
      setCaptureStatus(`Successfully saved ${label} frame!`);
    } catch {
      setCaptureStatus(`Saved ${label} frame locally`);
    }
  };
  return (
    <div className="diagnostic-panel">
      {/* Header */}
      <div className="panel-header">
        <div>
          <h2 className="panel-title">System Diagnostics</h2>
          <span className="task-badge">Task 1: Vision Pipeline &bull; Task 2: Gaze Feature Extraction</span>
        </div>
      </div>

      {/* Task 1: Vision Pipeline Metrics */}
      <div className="section-title">Task 1: Pipeline & Camera Health</div>
      <div className="metrics-grid">
        {/* Camera Status Card */}
        <div className={`metric-card ${diagnostics.cameraActive ? 'status-ok' : 'status-warning'}`}>
          <div className="metric-label">Camera Status</div>
          <div className="metric-value">
            <span className="status-dot" />
            {diagnostics.cameraActive ? 'Active' : 'Disconnected'}
          </div>
          <div className="metric-sub">{diagnostics.cameraStatusText}</div>
        </div>

        {/* Model Asset Card */}
        <div className={`metric-card ${diagnostics.modelLoaded ? 'status-ok' : 'status-warning'}`}>
          <div className="metric-label">Local Model (WASM)</div>
          <div className="metric-value">
            <span className="status-dot" />
            {diagnostics.modelLoaded ? 'Loaded' : 'Loading...'}
          </div>
          <div className="metric-sub">{diagnostics.modelStatusText}</div>
        </div>

        {/* Face Detection Card */}
        <div className={`metric-card ${diagnostics.faceDetected ? 'status-ok' : 'status-neutral'}`}>
          <div className="metric-label">Face Detection</div>
          <div className="metric-value">
            {diagnostics.faceDetected ? 'Detected' : 'Not Detected'}
          </div>
          <div className="metric-sub">
            {diagnostics.landmarksAvailable ? 'Landmarks Available' : 'No Landmark Stream'}
          </div>
        </div>

        {/* Iris Count Card */}
        <div
          className={`metric-card ${
            diagnostics.actualIrisCount === diagnostics.expectedIrisCount
              ? 'status-ok'
              : diagnostics.actualIrisCount > 0
              ? 'status-warning'
              : 'status-neutral'
          }`}
        >
          <div className="metric-label">Iris Landmarks (Total)</div>
          <div className="metric-value">
            {diagnostics.actualIrisCount} / {diagnostics.expectedIrisCount}
          </div>
          <div className="metric-sub">
            {diagnostics.actualIrisCount === diagnostics.expectedIrisCount
              ? 'All 10 points active'
              : 'Waiting for full face visibility'}
          </div>
        </div>

        {/* Pipeline FPS */}
        <div className="metric-card status-info">
          <div className="metric-label">Inference FPS</div>
          <div className="metric-value">{diagnostics.fps} FPS</div>
          <div className="metric-sub">Client rendering loop</div>
        </div>
      </div>

      {/* Task 2: Eye-Local Gaze Features */}
      <div className="section-title" style={{ marginTop: '1.25rem' }}>
        Task 2: Eye-Local Gaze Features (Unclamped Nominal [-1, +1])
      </div>
      <div className="metrics-grid">
        {/* Right Eye (Subject's Right) */}
        <div
          className={`metric-card ${
            gazeFeatures?.rightEye.status === 'VALID' ? 'status-ok' : 'status-warning'
          }`}
        >
          <div className="metric-label">
            Right Eye (Subject Right)
            <span
              className={`mini-badge ${
                gazeFeatures?.rightEye.status === 'VALID' ? 'badge-ok' : 'badge-warn'
              }`}
            >
              {gazeFeatures?.rightEye.status ?? 'AWAITING'}
            </span>
          </div>
          <div className="feature-readouts">
            <div className="feature-row">
              <span className="feat-name">H (image-right +):</span>
              <span className="feat-val">
                {gazeFeatures?.rightEye.horizontalPosition !== null &&
                gazeFeatures?.rightEye.horizontalPosition !== undefined
                  ? `${gazeFeatures.rightEye.horizontalPosition > 0 ? '+' : ''}${gazeFeatures.rightEye.horizontalPosition.toFixed(3)}`
                  : '—'}
              </span>
              <span className="feat-sub">
                (Ratio: {gazeFeatures?.rightEye.horizontalRatio?.toFixed(3) ?? '—'})
              </span>
            </div>
            <div className="feature-row">
              <span className="feat-name">V (local vertical +):</span>
              <span className="feat-val">
                {gazeFeatures?.rightEye.verticalPosition !== null &&
                gazeFeatures?.rightEye.verticalPosition !== undefined
                  ? `${gazeFeatures.rightEye.verticalPosition > 0 ? '+' : ''}${gazeFeatures.rightEye.verticalPosition.toFixed(3)}`
                  : '—'}
              </span>
              <span className="feat-sub">
                (Ratio: {gazeFeatures?.rightEye.verticalRatio?.toFixed(3) ?? '—'})
              </span>
            </div>
          </div>
          <div className="metric-sub">
            Span: W={gazeFeatures?.rightEye.eyeWidth ? (gazeFeatures.rightEye.eyeWidth * 100).toFixed(1) + '%' : '—'}
          </div>
        </div>

        {/* Left Eye (Subject's Left) */}
        <div
          className={`metric-card ${
            gazeFeatures?.leftEye.status === 'VALID' ? 'status-ok' : 'status-warning'
          }`}
        >
          <div className="metric-label">
            Left Eye (Subject Left)
            <span
              className={`mini-badge ${
                gazeFeatures?.leftEye.status === 'VALID' ? 'badge-ok' : 'badge-warn'
              }`}
            >
              {gazeFeatures?.leftEye.status ?? 'AWAITING'}
            </span>
          </div>
          <div className="feature-readouts">
            <div className="feature-row">
              <span className="feat-name">H (image-right +):</span>
              <span className="feat-val">
                {gazeFeatures?.leftEye.horizontalPosition !== null &&
                gazeFeatures?.leftEye.horizontalPosition !== undefined
                  ? `${gazeFeatures.leftEye.horizontalPosition > 0 ? '+' : ''}${gazeFeatures.leftEye.horizontalPosition.toFixed(3)}`
                  : '—'}
              </span>
              <span className="feat-sub">
                (Ratio: {gazeFeatures?.leftEye.horizontalRatio?.toFixed(3) ?? '—'})
              </span>
            </div>
            <div className="feature-row">
              <span className="feat-name">V (local vertical +):</span>
              <span className="feat-val">
                {gazeFeatures?.leftEye.verticalPosition !== null &&
                gazeFeatures?.leftEye.verticalPosition !== undefined
                  ? `${gazeFeatures.leftEye.verticalPosition > 0 ? '+' : ''}${gazeFeatures.leftEye.verticalPosition.toFixed(3)}`
                  : '—'}
              </span>
              <span className="feat-sub">
                (Ratio: {gazeFeatures?.leftEye.verticalRatio?.toFixed(3) ?? '—'})
              </span>
            </div>
          </div>
          <div className="metric-sub">
            Span: W={gazeFeatures?.leftEye.eyeWidth ? (gazeFeatures.leftEye.eyeWidth * 100).toFixed(1) + '%' : '—'}
          </div>
        </div>

        {/* Bilateral Combined */}
        <div
          className={`metric-card ${
            gazeFeatures?.bilateral.status === 'VALID' ? 'status-ok' : 'status-warning'
          }`}
        >
          <div className="metric-label">
            Bilateral Combination
            <span
              className={`mini-badge ${
                gazeFeatures?.bilateral.status === 'VALID' ? 'badge-ok' : 'badge-warn'
              }`}
            >
              {gazeFeatures?.bilateral.status ?? 'AWAITING'}
            </span>
          </div>
          <div className="feature-readouts">
            <div className="feature-row">
              <span className="feat-name">H (bilateral):</span>
              <span className="feat-val">
                {gazeFeatures?.bilateral.horizontalPosition !== null &&
                gazeFeatures?.bilateral.horizontalPosition !== undefined
                  ? `${gazeFeatures.bilateral.horizontalPosition > 0 ? '+' : ''}${gazeFeatures.bilateral.horizontalPosition.toFixed(3)}`
                  : 'null'}
              </span>
              <span className="feat-sub">
                (Ratio: {gazeFeatures?.bilateral.horizontalRatio?.toFixed(3) ?? 'null'})
              </span>
            </div>
            <div className="feature-row">
              <span className="feat-name">V (bilateral):</span>
              <span className="feat-val">
                {gazeFeatures?.bilateral.verticalPosition !== null &&
                gazeFeatures?.bilateral.verticalPosition !== undefined
                  ? `${gazeFeatures.bilateral.verticalPosition > 0 ? '+' : ''}${gazeFeatures.bilateral.verticalPosition.toFixed(3)}`
                  : 'null'}
              </span>
              <span className="feat-sub">
                (Ratio: {gazeFeatures?.bilateral.verticalRatio?.toFixed(3) ?? 'null'})
              </span>
            </div>
          </div>
          <div className="metric-sub">
            {gazeFeatures?.bilateral.status === 'VALID'
              ? 'Both eyes verified & averaged'
              : 'Requires both eyes VALID (no single-eye substitution)'}
          </div>
        </div>
      </div>

      {/* Control Actions */}
      <div className="panel-controls" style={{ marginTop: '1.25rem' }}>
        <button
          type="button"
          onClick={onToggleLogging}
          className={`btn-toggle ${diagnostics.loggingEnabled ? 'active' : ''}`}
        >
          Console Logging: {diagnostics.loggingEnabled ? 'Enabled' : 'Disabled'}
        </button>
        <span className="controls-hint">
          {diagnostics.loggingEnabled
            ? 'Emitting Task 1 & Task 2 status logs every ~1s (F12 DevTools)'
            : 'Console logging quiet. Click button to enable diagnostic output.'}
        </span>
      </div>

      {/* Task 2 Vertical Investigation: Raw Landmark Capture Section */}
      <div className="section-title" style={{ marginTop: '1.5rem', color: '#60a5fa' }}>
        🔬 Evidence-Based Investigation: Raw Landmark Capture
      </div>
      <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '0.5rem', marginTop: '0.5rem' }}>
        <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: '#94a3b8' }}>
          Capture live, unrounded MediaPipe landmark coordinates directly from the running video stream for mathematical verification of Candidate A vs Candidate B.
        </p>
        {/* Countdown Active Banner */}
        {countdown !== null && (
          <div style={{
            background: '#b91c1c',
            color: '#fff',
            padding: '0.75rem',
            borderRadius: '0.375rem',
            fontWeight: 'bold',
            fontSize: '1.1rem',
            textAlign: 'center',
            marginBottom: '0.75rem'
          }}>
            ⏳ STABILIZE HEAD & GAZE [{targetLabel?.toUpperCase()}]: {countdown}s (Release mouse, hold head steady)
          </div>
        )}

        <div style={{ marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.85rem', color: '#38bdf8' }}>
          ⏱️ Controlled 3-Second Countdown Capture (Recommended — prevents head movement on click):
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button
            type="button"
            disabled={countdown !== null}
            onClick={() => startControlledCapture('neutral')}
            style={{ padding: '0.45rem 0.85rem', backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: countdown !== null ? 'not-allowed' : 'pointer', fontWeight: 600 }}
          >
            ⏱️ 3s Neutral Gaze
          </button>
          <button
            type="button"
            disabled={countdown !== null}
            onClick={() => startControlledCapture('downward')}
            style={{ padding: '0.45rem 0.85rem', backgroundColor: '#b45309', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: countdown !== null ? 'not-allowed' : 'pointer', fontWeight: 600 }}
          >
            ⏱️ 3s Downward Gaze
          </button>
          <button
            type="button"
            disabled={countdown !== null}
            onClick={() => startControlledCapture('upward')}
            style={{ padding: '0.45rem 0.85rem', backgroundColor: '#047857', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: countdown !== null ? 'not-allowed' : 'pointer', fontWeight: 600 }}
          >
            ⏱️ 3s Upward Gaze
          </button>
          <button
            type="button"
            disabled={countdown !== null}
            onClick={() => startControlledCapture('look_right')}
            style={{ padding: '0.45rem 0.85rem', backgroundColor: '#4338ca', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: countdown !== null ? 'not-allowed' : 'pointer', fontWeight: 600 }}
          >
            ⏱️ 3s Look-Right
          </button>
          <button
            type="button"
            disabled={countdown !== null}
            onClick={() => startControlledCapture('look_left')}
            style={{ padding: '0.45rem 0.85rem', backgroundColor: '#6d28d9', color: '#fff', border: 'none', borderRadius: '0.25rem', cursor: countdown !== null ? 'not-allowed' : 'pointer', fontWeight: 600 }}
          >
            ⏱️ 3s Look-Left
          </button>
        </div>

        <div style={{ marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8rem', color: '#94a3b8' }}>
          Instant Capture (Manual click):
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => captureFrame('neutral')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            📸 Capture Neutral Gaze Frame
          </button>
          <button
            type="button"
            onClick={() => captureFrame('downward')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#d97706',
              color: '#fff',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            📸 Capture Downward Gaze Frame
          </button>
          <button
            type="button"
            onClick={() => captureFrame('upward')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#059669',
              color: '#fff',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            📸 Capture Upward Gaze Frame
          </button>
          <button
            type="button"
            onClick={() => captureFrame('look_right')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            📸 Capture Look-Right Frame
          </button>
          <button
            type="button"
            onClick={() => captureFrame('look_left')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#8b5cf6',
              color: '#fff',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            📸 Capture Look-Left Frame
          </button>
        </div>
        {captureStatus && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#10b981' }}>
            {captureStatus}
          </div>
        )}

        {(capturedNeutral || capturedDownward || capturedUpward || capturedLookRight || capturedLookLeft) && (
          <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {capturedNeutral && (
              <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
                <strong style={{ color: '#38bdf8' }}>Captured Neutral Frame</strong>
                <div>Right V(A): {capturedNeutral.right.candidateA.finalV.toFixed(3)} | V(B): {capturedNeutral.right.candidateB.finalV.toFixed(3)}</div>
                <div>Left V(A): {capturedNeutral.left.candidateA.finalV.toFixed(3)} | V(B): {capturedNeutral.left.candidateB.finalV.toFixed(3)}</div>
                <div style={{ fontWeight: 'bold', marginTop: '0.25rem' }}>
                  Bilateral V(A): {capturedNeutral.bilateral.candidateA_V.toFixed(3)} | V(B): {capturedNeutral.bilateral.candidateB_V.toFixed(3)}
                </div>
              </div>
            )}
            {capturedDownward && (
              <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
                <strong style={{ color: '#fbbf24' }}>Captured Downward Frame</strong>
                <div>Right V(A): {capturedDownward.right.candidateA.finalV.toFixed(3)} | V(B): {capturedDownward.right.candidateB.finalV.toFixed(3)}</div>
                <div>Left V(A): {capturedDownward.left.candidateA.finalV.toFixed(3)} | V(B): {capturedDownward.left.candidateB.finalV.toFixed(3)}</div>
                <div style={{ fontWeight: 'bold', marginTop: '0.25rem' }}>
                  Bilateral V(A): {capturedDownward.bilateral.candidateA_V.toFixed(3)} | V(B): {capturedDownward.bilateral.candidateB_V.toFixed(3)}
                </div>
              </div>
            )}
            {capturedUpward && (
              <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
                <strong style={{ color: '#34d399' }}>Captured Upward Frame</strong>
                <div>Right V(A): {capturedUpward.right.candidateA.finalV.toFixed(3)} | V(B): {capturedUpward.right.candidateB.finalV.toFixed(3)}</div>
                <div>Left V(A): {capturedUpward.left.candidateA.finalV.toFixed(3)} | V(B): {capturedUpward.left.candidateB.finalV.toFixed(3)}</div>
                <div style={{ fontWeight: 'bold', marginTop: '0.25rem' }}>
                  Bilateral V(A): {capturedUpward.bilateral.candidateA_V.toFixed(3)} | V(B): {capturedUpward.bilateral.candidateB_V.toFixed(3)}
                </div>
              </div>
            )}
            {capturedLookRight && (
              <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
                <strong style={{ color: '#818cf8' }}>Captured Look-Right Frame</strong>
                <div>Right V(A): {capturedLookRight.right.candidateA.finalV.toFixed(3)} | V(B): {capturedLookRight.right.candidateB.finalV.toFixed(3)}</div>
                <div>Left V(A): {capturedLookRight.left.candidateA.finalV.toFixed(3)} | V(B): {capturedLookRight.left.candidateB.finalV.toFixed(3)}</div>
                <div style={{ fontWeight: 'bold', marginTop: '0.25rem' }}>
                  Bilateral V(A): {capturedLookRight.bilateral.candidateA_V.toFixed(3)} | V(B): {capturedLookRight.bilateral.candidateB_V.toFixed(3)}
                </div>
              </div>
            )}
            {capturedLookLeft && (
              <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
                <strong style={{ color: '#c084fc' }}>Captured Look-Left Frame</strong>
                <div>Right V(A): {capturedLookLeft.right.candidateA.finalV.toFixed(3)} | V(B): {capturedLookLeft.right.candidateB.finalV.toFixed(3)}</div>
                <div>Left V(A): {capturedLookLeft.left.candidateA.finalV.toFixed(3)} | V(B): {capturedLookLeft.left.candidateB.finalV.toFixed(3)}</div>
                <div style={{ fontWeight: 'bold', marginTop: '0.25rem' }}>
                  Bilateral V(A): {capturedLookLeft.bilateral.candidateA_V.toFixed(3)} | V(B): {capturedLookLeft.bilateral.candidateB_V.toFixed(3)}
                </div>
              </div>
            )}
          </div>
        )}

        {(capturedNeutral || capturedDownward || capturedUpward || capturedLookRight || capturedLookLeft) && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
              Raw Captured Landmark JSON (auto-saved to actual-frames.json):
            </div>
            <textarea
              readOnly
              rows={8}
              style={{
                width: '100%',
                background: '#090d16',
                color: '#34d399',
                fontSize: '0.7rem',
                fontFamily: 'monospace',
                border: '1px solid #334155',
                borderRadius: '0.25rem',
                padding: '0.5rem',
                boxSizing: 'border-box'
              }}
              value={JSON.stringify({
                neutral: capturedNeutral,
                downward: capturedDownward,
                upward: capturedUpward,
                look_right: capturedLookRight,
                look_left: capturedLookLeft
              }, null, 2)}
            />
          </div>
        )}
      </div>
    </div>
  );
};
