import type { FC } from 'react';
import { VisionPipelineViewer } from './components/VisionPipelineViewer';

export const App: FC = () => {
  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-brand">
          <h1 className="header-title">EyeSpeak</h1>
          <span className="header-subtitle">Assistive Gaze Engine — Milestone 1</span>
        </div>
        <div className="header-tagline">
          Zero-Network Local Vision Pipeline • MediaPipe FaceLandmarker
        </div>
      </header>

      <main className="app-main">
        <VisionPipelineViewer />
      </main>

      <footer className="app-footer">
        EyeSpeak Phase 1 &bull; Task 3 of 4: Gaze Estimation & Calibration (9-Point 2D Affine Screen Mapping)
      </footer>
    </div>
  );
};

export default App;
