/**
 * Task 3: Calibration Overlay Component
 * Renders the active calibration target at the exact screen coordinate during calibration,
 * and visualizes live mapped gaze coordinates (unclamped) after successful calibration.
 */

import type { FC } from 'react';
import type {
  CalibrationSessionState,
  LiveGazeMapping,
  ScreenPoint,
} from '../types/calibration.ts';
import { resolveTargetScreenPoint } from '../services/calibrationService.ts';

interface CalibrationOverlayProps {
  sessionState: CalibrationSessionState;
  liveMapping: LiveGazeMapping | null;
  viewportWidth: number;
  viewportHeight: number;
}

export const CalibrationOverlay: FC<CalibrationOverlayProps> = ({
  sessionState,
  liveMapping,
  viewportWidth,
  viewportHeight,
}) => {
  const isCalibrating =
    sessionState.status === 'STABILIZING' || sessionState.status === 'RECORDING';

  let currentTargetPoint: ScreenPoint | null = null;
  if (isCalibrating && sessionState.currentTarget) {
    currentTargetPoint = resolveTargetScreenPoint(
      sessionState.currentTarget,
      viewportWidth,
      viewportHeight
    );
  }

  const currentSampleCount =
    isCalibrating && sessionState.targetCollections[sessionState.currentTargetIndex]
      ? sessionState.targetCollections[sessionState.currentTargetIndex].samples.length
      : 0;

  return (
    <div
      className="calibration-overlay-container"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      {/* 1. Active Calibration Target */}
      {isCalibrating && currentTargetPoint && sessionState.currentTarget && (
        <div
          style={{
            position: 'absolute',
            left: `${currentTargetPoint.x}px`,
            top: `${currentTargetPoint.y}px`,
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease-out',
          }}
        >
          {/* Target Reticle */}
          <div
            style={{
              position: 'relative',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor:
                sessionState.status === 'STABILIZING'
                  ? 'rgba(234, 179, 8, 0.25)'
                  : 'rgba(34, 197, 94, 0.25)',
              border: `3px solid ${
                sessionState.status === 'STABILIZING' ? '#eab308' : '#22c55e'
              }`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow:
                sessionState.status === 'STABILIZING'
                  ? '0 0 20px rgba(234, 179, 8, 0.6)'
                  : '0 0 25px rgba(34, 197, 94, 0.8)',
            }}
          >
            {/* Center Bullseye Dot */}
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor:
                  sessionState.status === 'STABILIZING' ? '#fde047' : '#4ade80',
              }}
            />
          </div>

          {/* Target Metadata Banner */}
          <div
            style={{
              marginTop: '8px',
              padding: '3px 8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(15, 23, 42, 0.90)',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              border: '1px solid #334155',
            }}
          >
            Target {sessionState.currentTarget.id}/9: {sessionState.currentTarget.description}
            <span style={{ marginLeft: '6px', color: sessionState.status === 'STABILIZING' ? '#facc15' : '#4ade80' }}>
              {sessionState.status === 'STABILIZING'
                ? `[Hold ${sessionState.stabilizationRemainingMs}ms]`
                : `[Recording: ${currentSampleCount} samples]`}
            </span>
          </div>
        </div>
      )}

      {/* 2. Live Mapped Gaze Crosshair (Visible when calibrated) */}
      {sessionState.status === 'SUCCESS' && liveMapping && (
        <div
          style={{
            position: 'absolute',
            left: `${liveMapping.x}px`,
            top: `${liveMapping.y}px`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        >
          {/* Unclamped Gaze Cursor */}
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: `2px solid ${liveMapping.outOfBounds ? '#ef4444' : '#38bdf8'}`,
              backgroundColor: liveMapping.outOfBounds
                ? 'rgba(239, 68, 68, 0.35)'
                : 'rgba(56, 189, 248, 0.35)',
              boxShadow: liveMapping.outOfBounds
                ? '0 0 15px rgba(239, 68, 68, 0.8)'
                : '0 0 15px rgba(56, 189, 248, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: liveMapping.outOfBounds ? '#f87171' : '#bae6fd',
              }}
            />
          </div>

          {/* Coordinate Readout Badge */}
          <div
            style={{
              marginTop: '4px',
              padding: '2px 6px',
              borderRadius: '3px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              color: liveMapping.outOfBounds ? '#f87171' : '#38bdf8',
              fontSize: '10px',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              border: `1px solid ${liveMapping.outOfBounds ? '#ef4444' : '#0284c7'}`,
            }}
          >
            ({Math.round(liveMapping.x)}, {Math.round(liveMapping.y)})
            {liveMapping.outOfBounds && ' [OUT OF BOUNDS]'}
          </div>
        </div>
      )}
    </div>
  );
};
