# EyeSpeak — Project State

**Current Milestone:** Phase 1 — Core Local Vision Engine & Calibration  
**Active Task:** Task 3 of 4: Gaze Estimation & Calibration (IMPLEMENTED — PENDING HUMAN VERIFICATION)  
**Last Updated:** 2026-09-26  

---

## Overall Status Summary

| Item | Status | Notes |
| :--- | :--- | :--- |
| **Phase 1** | In Progress | 3 of 4 Tasks in progress/verified |
| **Task 1: Vision Pipeline Baseline** | **APPROVED** | Network audit verified (100% local, offline), 10/10 irises, console triaged |
| **Task 2: Gaze Feature Extraction** | **APPROVED** | Candidate B corner-based isotropic $W/2$ feature extraction. Automated suite: 11/11 PASS |
| **Task 3: Gaze Estimation & Calibration** | **IMPLEMENTED — PENDING HUMAN VERIFICATION** | 9-point calibration, median $H/V$, 2D affine model, 80/20 held-out validation. Automated suite: 13/13 PASS |
| **Task 4: Dwell / Selection Trigger** | **NOT STARTED** | On hold pending Task 3 formal approval |

---

## Task 3 Specification & Implementation Status

### Task 3 Objective:
Learn the relationship between Task 2 bilateral gaze features ($H, V$) and screen coordinates ($X, Y$) using a 9-point calibration grid, per-target median aggregation, 2D affine model fitting, and held-out validation.

### Implementation:
**COMPLETE**

1. **9-Point Calibration Grid**:
   - Arranged in a $3 \times 3$ perimeter-first traversal order:
     $1 (\text{Top-Left}) \rightarrow 2 (\text{Top-Center}) \rightarrow 3 (\text{Top-Right}) \rightarrow 4 (\text{Middle-Right}) \rightarrow 5 (\text{Bottom-Right}) \rightarrow 6 (\text{Bottom-Center}) \rightarrow 7 (\text{Bottom-Left}) \rightarrow 8 (\text{Middle-Left}) \rightarrow 9 (\text{Center})$.
   - Uses screen-relative coordinates ($0.10 \dots 0.90$) to adapt responsively to any viewport dimensions without hardcoding resolutions.
2. **Calibration Timing**:
   - 500 ms stabilization period per target (gaze samples excluded from data collection).
   - 1000 ms recording period per target (valid bilateral samples recorded).
3. **Valid Sample Filtering**:
   - Samples are accepted only when both eyes have `status === 'VALID'` and bilateral $H, V$ are finite.
   - Non-interpolated, non-reused, zero synthetic fake samples.
4. **Sample Threshold Guard**:
   - Minimum 20 valid samples required per target. If any target finishes with $< 20$ samples, calibration is marked `INVALID` with target ID and failure reason exposed.
5. **Per-Target Median Aggregation**:
   - Calculates exact $\text{median}(H)$ and $\text{median}(V)$ per target. Zero temporal smoothing or EMA.
6. **Deterministic 80/20 Train/Validation Split**:
   - Evaluates the model on held-out samples: every 5th sample (indices 4, 9, 14, 19, ...) goes to validation ($20\%$), remaining go to training ($80\%$) inside each target.
7. **2D Affine Model**:
   - $X = a_0 + a_1 \cdot H + a_2 \cdot V$
   - $Y = b_0 + b_1 \cdot H + b_2 \cdot V$
   - Fitted via normal equations $(A^T A) \theta = A^T B$. Singular/collinear data safely detected via determinant threshold ($|\det| < 10^{-9}$).
8. **Validation & Error Metrics**:
   - Computes Euclidean distance error $E = \sqrt{(X_{\text{pred}} - X_{\text{target}})^2 + (Y_{\text{pred}} - Y_{\text{target}})^2}$.
   - Exposes mean validation error, max validation error, validation sample count, and per-target errors.
9. **Live Unclamped Screen Mapping**:
   - Predicts $(X, Y)$ from live $(H, V)$ using fitted coefficients. Returns unclamped raw pixels with factual `outOfBounds` boolean.
10. **Debug UI**:
    - High-visibility `CalibrationOverlay` displaying active targets, countdowns, and live gaze cursor.
    - `CalibrationDebugPanel` displaying lifecycle state, target progress, sample counts, 2D affine equations, validation error metrics, and per-target breakdown.

### Automated Verification:
**PASS (24/24 Deterministic Unit Tests Across Task 2 & Task 3)**

- **Test Runner:** Node.js native test runner (`node:test` + `node:assert` with `--experimental-strip-types`)
- **Suite:** [`test/gazeFeatureExtractor.test.ts`](file:///c:/Users/ebedy/Desktop/EyeSpeak/test/gazeFeatureExtractor.test.ts) (11 tests) + [`test/calibration.test.ts`](file:///c:/Users/ebedy/Desktop/EyeSpeak/test/calibration.test.ts) (13 tests)
- **Total Execution Time:** ~230 ms (zero external network dependencies)
- **Verified Invariants:**
  1. `Median calculation`: Exact calculation for odd, even, floating-point; empty array rejection.
  2. `Valid/invalid sample filtering`: Excludes unilateral, missing, and non-finite samples.
  3. `Minimum sample requirement`: Rejects target collections with $< 20$ samples as `INVALID`.
  4. `Deterministic 80/20 split`: Exactly $80\%$ train / $20\%$ validation uniformly distributed.
  5. `Affine model fitting with synthetic known data`: Solves known ground truth within $< 10^{-6}$.
  6. `Correct X mapping`: Verifies $X = a_0 + a_1 H + a_2 V$.
  7. `Correct Y mapping`: Verifies $Y = b_0 + b_1 H + b_2 V$.
  8. `Cross-axis contribution`: Verifies $V$ contribution to $X$ and $H$ contribution to $Y$.
  9. `Degenerate / unsolvable model handling`: Rejects constant, collinear, and $< 3$ sample sets.
  10. `Euclidean validation error`: Exact distance calculation and multi-target validation metrics.
  11. `Out-of-bounds detection`: Correct flags for left, right, top, bottom; preserves unclamped values.
  12. `Successful calibration lifecycle`: Full 9-target synthesis, model fitting, and live mapping.
  13. `Failed calibration when a target has fewer than 20 valid samples`: Clean failure with clear reason.

### Task 3 Final Human Verification:
**PENDING**

Awaiting human runtime verification on live webcam stream (`http://localhost:5173/`):
1. Start calibration and observe target 1 at Top-Left.
2. Observe 500 ms stabilization and 1000 ms recording countdown for each of the 9 targets.
3. Confirm invalid frames are excluded and sample counts accumulate.
4. Confirm calibration succeeds when all targets have $\ge 20$ valid samples.
5. Inspect validation error and fitted 2D affine equations in the debug panel.
6. Observe live gaze mapping as eyes move across the display.

### Task 4 (Dwell / Selection Trigger):
**NOT STARTED**

---

## Active Attention Points / Next Steps

1. Human runtime verification of Task 3 on `http://localhost:5173/`.
2. Reviewer inspection of calibration error metrics and live mapping.
3. Supervisor formal approval of Task 3.
4. Proceed to Task 4 (Dwell / Selection Trigger).
