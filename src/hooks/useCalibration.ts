/**
 * Task 3: Calibration Hook
 * Controls the 9-point calibration lifecycle state machine, sample collection,
 * affine model fitting, and continuous live screen mapping.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type {
  CalibrationSessionState,
  CalibrationModel,
  TargetSampleCollection,
  LiveGazeMapping,
} from '../types/calibration.ts';
import type { GazeFeatureSet } from '../types/vision.ts';
import {
  CALIBRATION_TARGETS,
  MIN_SAMPLES_PER_TARGET,
  STABILIZATION_DURATION_MS,
  RECORDING_DURATION_MS,
  resolveTargetScreenPoint,
  isBilateralSampleValid,
  fitCalibrationModel,
  mapGazeToScreen,
} from '../services/calibrationService.ts';

export function useCalibration(
  gazeFeatures: GazeFeatureSet | null,
  viewportWidth: number,
  viewportHeight: number
) {
  const [sessionState, setSessionState] = useState<CalibrationSessionState>({
    status: 'IDLE',
    currentTargetIndex: 0,
    currentTarget: null,
    stabilizationRemainingMs: 0,
    recordingRemainingMs: 0,
    targetCollections: [],
    activeModel: null,
    errorMessage: null,
  });

  const [liveMapping, setLiveMapping] = useState<LiveGazeMapping | null>(null);

  // Mutable refs to prevent state-closure lag during rapid video frame loop
  const gazeFeaturesRef = useRef(gazeFeatures);
  gazeFeaturesRef.current = gazeFeatures;

  const targetCollectionsRef = useRef<TargetSampleCollection[]>([]);
  const currentTargetIndexRef = useRef<number>(0);
  const statusRef = useRef<CalibrationSessionState['status']>('IDLE');
  statusRef.current = sessionState.status;

  const activeModelRef = useRef<CalibrationModel | null>(null);

  // 1. Continuous Live Mapping whenever an active model exists
  useEffect(() => {
    if (activeModelRef.current && gazeFeatures?.bilateral.status === 'VALID') {
      const mapping = mapGazeToScreen(
        gazeFeatures.bilateral.horizontalPosition,
        gazeFeatures.bilateral.verticalPosition,
        activeModelRef.current
      );
      setLiveMapping(mapping);
    } else {
      setLiveMapping(null);
    }
  }, [gazeFeatures]);

  // 2. Start Calibration Action
  const startCalibration = useCallback(() => {
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      setSessionState((prev) => ({
        ...prev,
        status: 'FAILED',
        errorMessage: 'Invalid viewport dimensions. Calibration cannot start.',
      }));
      return;
    }

    const initialCollections: TargetSampleCollection[] = CALIBRATION_TARGETS.map((target) => ({
      target,
      screenPoint: resolveTargetScreenPoint(target, viewportWidth, viewportHeight),
      samples: [],
      trainSamples: [],
      valSamples: [],
      medianH: null,
      medianV: null,
    }));

    targetCollectionsRef.current = initialCollections;
    currentTargetIndexRef.current = 0;

    setSessionState({
      status: 'STABILIZING',
      currentTargetIndex: 0,
      currentTarget: CALIBRATION_TARGETS[0],
      stabilizationRemainingMs: STABILIZATION_DURATION_MS,
      recordingRemainingMs: RECORDING_DURATION_MS,
      targetCollections: initialCollections,
      activeModel: null,
      errorMessage: null,
    });
    activeModelRef.current = null;
  }, [viewportWidth, viewportHeight]);

  // 3. Cancel / Reset Calibration Action
  const cancelCalibration = useCallback(() => {
    targetCollectionsRef.current = [];
    currentTargetIndexRef.current = 0;
    setSessionState({
      status: 'IDLE',
      currentTargetIndex: 0,
      currentTarget: null,
      stabilizationRemainingMs: 0,
      recordingRemainingMs: 0,
      targetCollections: [],
      activeModel: null,
      errorMessage: null,
    });
    activeModelRef.current = null;
    setLiveMapping(null);
  }, []);

  // 4. Calibration Lifecycle Loop
  useEffect(() => {
    if (sessionState.status === 'IDLE' || sessionState.status === 'SUCCESS' || sessionState.status === 'FAILED') {
      return;
    }

    let isRunning = true;
    let stageStart = performance.now();
    let sampleInterval: number | null = null;

    if (sessionState.status === 'STABILIZING') {
      const timer = window.setInterval(() => {
        if (!isRunning) return;
        const elapsed = performance.now() - stageStart;
        const remaining = Math.max(0, STABILIZATION_DURATION_MS - elapsed);

        if (remaining <= 0) {
          window.clearInterval(timer);
          // Transition to RECORDING
          setSessionState((prev) => ({
            ...prev,
            status: 'RECORDING',
            stabilizationRemainingMs: 0,
            recordingRemainingMs: RECORDING_DURATION_MS,
          }));
        } else {
          setSessionState((prev) => ({
            ...prev,
            stabilizationRemainingMs: Math.round(remaining),
          }));
        }
      }, 50);

      return () => {
        isRunning = false;
        window.clearInterval(timer);
      };
    }

    if (sessionState.status === 'RECORDING') {
      const currentIdx = currentTargetIndexRef.current;

      // Sample collection loop running at high frequency (~16ms)
      sampleInterval = window.setInterval(() => {
        if (!isRunning) return;
        const features = gazeFeaturesRef.current;

        if (isBilateralSampleValid(features)) {
          const sample = {
            h: features!.bilateral.horizontalPosition!,
            v: features!.bilateral.verticalPosition!,
            timestampMs: performance.now(),
          };

          const collection = targetCollectionsRef.current[currentIdx];
          if (collection) {
            collection.samples.push(sample);
          }
        }
      }, 16);

      // 1000ms countdown timer
      const countdownTimer = window.setInterval(() => {
        if (!isRunning) return;
        const elapsed = performance.now() - stageStart;
        const remaining = Math.max(0, RECORDING_DURATION_MS - elapsed);

        if (remaining <= 0) {
          window.clearInterval(countdownTimer);
          if (sampleInterval !== null) {
            window.clearInterval(sampleInterval);
          }

          const currentCollection = targetCollectionsRef.current[currentIdx];
          const sampleCount = currentCollection ? currentCollection.samples.length : 0;

          // Check minimum samples per target
          if (sampleCount < MIN_SAMPLES_PER_TARGET) {
            const target = CALIBRATION_TARGETS[currentIdx];
            const failureReason = `Target ${target.id} (${target.description}) collected only ${sampleCount} valid samples (< ${MIN_SAMPLES_PER_TARGET} required). Calibration marked INVALID.`;
            setSessionState((prev) => ({
              ...prev,
              status: 'FAILED',
              errorMessage: failureReason,
              targetCollections: [...targetCollectionsRef.current],
            }));
            return;
          }

          // Advance to next target or conclude calibration
          if (currentIdx < CALIBRATION_TARGETS.length - 1) {
            const nextIdx = currentIdx + 1;
            currentTargetIndexRef.current = nextIdx;
            setSessionState((prev) => ({
              ...prev,
              status: 'STABILIZING',
              currentTargetIndex: nextIdx,
              currentTarget: CALIBRATION_TARGETS[nextIdx],
              stabilizationRemainingMs: STABILIZATION_DURATION_MS,
              recordingRemainingMs: RECORDING_DURATION_MS,
              targetCollections: [...targetCollectionsRef.current],
            }));
          } else {
            // All 9 targets finished -> Fit Affine Model
            const fittedModel = fitCalibrationModel(
              targetCollectionsRef.current,
              viewportWidth,
              viewportHeight
            );

            if (fittedModel.status === 'VALID') {
              activeModelRef.current = fittedModel;
              setSessionState((prev) => ({
                ...prev,
                status: 'SUCCESS',
                activeModel: fittedModel,
                errorMessage: null,
                targetCollections: [...targetCollectionsRef.current],
              }));
            } else {
              setSessionState((prev) => ({
                ...prev,
                status: 'FAILED',
                activeModel: null,
                errorMessage: fittedModel.failureReason || 'Model fitting failed.',
                targetCollections: [...targetCollectionsRef.current],
              }));
            }
          }
        } else {
          setSessionState((prev) => ({
            ...prev,
            recordingRemainingMs: Math.round(remaining),
            targetCollections: [...targetCollectionsRef.current],
          }));
        }
      }, 50);

      return () => {
        isRunning = false;
        if (sampleInterval !== null) window.clearInterval(sampleInterval);
        window.clearInterval(countdownTimer);
      };
    }
  }, [sessionState.status, viewportWidth, viewportHeight]);

  return {
    sessionState,
    liveMapping,
    startCalibration,
    cancelCalibration,
  };
}
