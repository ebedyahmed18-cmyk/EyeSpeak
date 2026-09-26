/**
 * Task 3: Calibration Debug Panel Component
 * Developer diagnostic interface to control calibration, inspect sample counts,
 * view 2D affine coefficients, examine validation errors, and observe live screen mapping.
 */

import type { FC } from 'react';
import type {
  CalibrationSessionState,
  LiveGazeMapping,
} from '../types/calibration.ts';
import type { GazeFeatureSet } from '../types/vision.ts';
import { MIN_SAMPLES_PER_TARGET } from '../services/calibrationService.ts';

interface CalibrationDebugPanelProps {
  sessionState: CalibrationSessionState;
  liveMapping: LiveGazeMapping | null;
  gazeFeatures: GazeFeatureSet | null;
  viewportWidth: number;
  viewportHeight: number;
  onStartCalibration: () => void;
  onCancelCalibration: () => void;
}

export const CalibrationDebugPanel: FC<CalibrationDebugPanelProps> = ({
  sessionState,
  liveMapping,
  gazeFeatures,
  viewportWidth,
  viewportHeight,
  onStartCalibration,
  onCancelCalibration,
}) => {
  const isCalibrating =
    sessionState.status === 'STABILIZING' || sessionState.status === 'RECORDING';

  const isBilateralValid = gazeFeatures?.bilateral.status === 'VALID';
  const model = sessionState.activeModel;

  return (
    <div className="calibration-debug-panel" style={{ marginTop: '1.5rem' }}>
      <div className="section-title" style={{ color: '#38bdf8' }}>
        Task 3: 9-Point Calibration & 2D Affine Screen Mapping
      </div>

      {/* Control Actions & Status Banner */}
      <div
        style={{
          background: '#1e293b',
          padding: '1rem',
          borderRadius: '0.5rem',
          marginTop: '0.5rem',
          border: '1px solid #334155',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {!isCalibrating ? (
            <button
              type="button"
              onClick={onStartCalibration}
              style={{
                padding: '0.55rem 1.25rem',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
              }}
            >
              🎯 Start 9-Point Calibration
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancelCalibration}
              style={{
                padding: '0.55rem 1.25rem',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
              }}
            >
              ✕ Cancel Calibration
            </button>
          )}

          {/* Session State Badge */}
          <span
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              fontFamily: 'monospace',
              backgroundColor:
                sessionState.status === 'SUCCESS'
                  ? 'rgba(34, 197, 94, 0.2)'
                  : sessionState.status === 'FAILED'
                  ? 'rgba(239, 68, 68, 0.2)'
                  : isCalibrating
                  ? 'rgba(234, 179, 8, 0.2)'
                  : 'rgba(148, 163, 184, 0.2)',
              color:
                sessionState.status === 'SUCCESS'
                  ? '#4ade80'
                  : sessionState.status === 'FAILED'
                  ? '#f87171'
                  : isCalibrating
                  ? '#facc15'
                  : '#94a3b8',
              border: `1px solid ${
                sessionState.status === 'SUCCESS'
                  ? '#22c55e'
                  : sessionState.status === 'FAILED'
                  ? '#ef4444'
                  : isCalibrating
                  ? '#eab308'
                  : '#64748b'
              }`,
            }}
          >
            STATUS: {sessionState.status}
          </span>

          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            Viewport: {viewportWidth} × {viewportHeight} px
          </span>
        </div>

        {/* Live Calibration Progress Readout */}
        {isCalibrating && sessionState.currentTarget && (
          <div
            style={{
              marginTop: '0.85rem',
              padding: '0.75rem',
              backgroundColor: '#0f172a',
              borderRadius: '0.375rem',
              border: '1px solid #1e293b',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600 }}>
              <span style={{ color: '#38bdf8' }}>
                Active Target: {sessionState.currentTarget.id} of 9 ({sessionState.currentTarget.description})
              </span>
              <span style={{ color: sessionState.status === 'STABILIZING' ? '#facc15' : '#4ade80' }}>
                {sessionState.status === 'STABILIZING'
                  ? `Stabilizing: ${sessionState.stabilizationRemainingMs} ms`
                  : `Recording: ${sessionState.recordingRemainingMs} ms`}
              </span>
            </div>

            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#cbd5e1' }}>
              Valid Bilateral Samples Collected:{' '}
              <strong style={{ color: '#38bdf8' }}>
                {sessionState.targetCollections[sessionState.currentTargetIndex]?.samples.length ?? 0}
              </strong>{' '}
              / {MIN_SAMPLES_PER_TARGET} minimum required
            </div>

            <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: isBilateralValid ? '#4ade80' : '#f87171' }}>
              Current Frame Bilateral State:{' '}
              {isBilateralValid
                ? `VALID (H: ${gazeFeatures?.bilateral.horizontalPosition?.toFixed(3)}, V: ${gazeFeatures?.bilateral.verticalPosition?.toFixed(3)})`
                : 'WAITING FOR VALID BILATERAL GAZE (Excluded)'}
            </div>
          </div>
        )}

        {/* Error Alert */}
        {sessionState.status === 'FAILED' && sessionState.errorMessage && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: '0.375rem',
              color: '#fca5a5',
              fontSize: '0.8rem',
            }}
          >
            <strong>Calibration Failed:</strong> {sessionState.errorMessage}
          </div>
        )}

        {/* Live Gaze Mapping Output */}
        {liveMapping && (
          <div
            style={{
              marginTop: '0.85rem',
              padding: '0.75rem',
              backgroundColor: '#0f172a',
              borderRadius: '0.375rem',
              border: `1px solid ${liveMapping.outOfBounds ? '#ef4444' : '#0284c7'}`,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#38bdf8', marginBottom: '0.25rem' }}>
              Live Affine Screen Mapping (Unclamped)
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', fontFamily: 'monospace' }}>
              <span>
                Screen X: <strong>{liveMapping.x.toFixed(1)} px</strong> ({((liveMapping.x / viewportWidth) * 100).toFixed(1)}%)
              </span>
              <span>
                Screen Y: <strong>{liveMapping.y.toFixed(1)} px</strong> ({((liveMapping.y / viewportHeight) * 100).toFixed(1)}%)
              </span>
              <span style={{ color: liveMapping.outOfBounds ? '#ef4444' : '#22c55e', fontWeight: 'bold' }}>
                {liveMapping.outOfBounds ? '⚠️ OUT OF BOUNDS' : '✓ IN BOUNDS'}
              </span>
            </div>
          </div>
        )}

        {/* Model Metrics & Affine Coefficients */}
        {model && model.status === 'VALID' && model.coefficients && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#4ade80', marginBottom: '0.5rem' }}>
              ✓ Fitted 2D Affine Calibration Model & Held-Out Validation
            </div>

            {/* Error Metrics Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
              <div style={{ background: '#0f172a', padding: '0.5rem 0.75rem', borderRadius: '0.25rem' }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Mean Validation Error</div>
                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#38bdf8' }}>
                  {model.validationErrorMean?.toFixed(1)} px
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                  {viewportWidth > 0 ? ((model.validationErrorMean! / viewportWidth) * 100).toFixed(2) : 0}% viewport width
                </div>
              </div>

              <div style={{ background: '#0f172a', padding: '0.5rem 0.75rem', borderRadius: '0.25rem' }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Max Validation Error</div>
                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#facc15' }}>
                  {model.validationErrorMax?.toFixed(1)} px
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                  Worst-case held-out sample
                </div>
              </div>

              <div style={{ background: '#0f172a', padding: '0.5rem 0.75rem', borderRadius: '0.25rem' }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Validation Samples</div>
                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#e2e8f0' }}>
                  {model.validationSampleCount} samples
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                  Held-out 20% deterministic split
                </div>
              </div>
            </div>

            {/* Fitted Affine Equations */}
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.5rem 0.75rem',
                backgroundColor: '#0f172a',
                borderRadius: '0.25rem',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: '#cbd5e1',
              }}
            >
              <div>
                <strong>X</strong> = {model.coefficients.thetaX[0].toFixed(2)} +{' '}
                {model.coefficients.thetaX[1].toFixed(2)}·H +{' '}
                {model.coefficients.thetaX[2].toFixed(2)}·V
              </div>
              <div style={{ marginTop: '0.25rem' }}>
                <strong>Y</strong> = {model.coefficients.thetaY[0].toFixed(2)} +{' '}
                {model.coefficients.thetaY[1].toFixed(2)}·H +{' '}
                {model.coefficients.thetaY[2].toFixed(2)}·V
              </div>
            </div>

            {/* Per-Target Validation Table */}
            {sessionState.targetCollections.length > 0 && (
              <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                      <th style={{ padding: '0.35rem' }}>#</th>
                      <th style={{ padding: '0.35rem' }}>Target</th>
                      <th style={{ padding: '0.35rem' }}>Screen (X, Y)</th>
                      <th style={{ padding: '0.35rem' }}>Total</th>
                      <th style={{ padding: '0.35rem' }}>Train/Val</th>
                      <th style={{ padding: '0.35rem' }}>Median (H, V)</th>
                      <th style={{ padding: '0.35rem' }}>Mean Error</th>
                      <th style={{ padding: '0.35rem' }}>Max Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionState.targetCollections.map((col) => (
                      <tr key={col.target.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '0.35rem', fontWeight: 'bold', color: '#38bdf8' }}>{col.target.id}</td>
                        <td style={{ padding: '0.35rem' }}>{col.target.description}</td>
                        <td style={{ padding: '0.35rem', fontFamily: 'monospace' }}>
                          ({col.screenPoint.x}, {col.screenPoint.y})
                        </td>
                        <td style={{ padding: '0.35rem' }}>{col.samples.length}</td>
                        <td style={{ padding: '0.35rem' }}>
                          {col.trainSamples.length} / {col.valSamples.length}
                        </td>
                        <td style={{ padding: '0.35rem', fontFamily: 'monospace' }}>
                          ({col.medianH?.toFixed(3) ?? '—'}, {col.medianV?.toFixed(3) ?? '—'})
                        </td>
                        <td style={{ padding: '0.35rem', color: '#38bdf8' }}>
                          {col.valErrorMean !== undefined ? `${col.valErrorMean.toFixed(1)} px` : '—'}
                        </td>
                        <td style={{ padding: '0.35rem', color: '#facc15' }}>
                          {col.valErrorMax !== undefined ? `${col.valErrorMax.toFixed(1)} px` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
