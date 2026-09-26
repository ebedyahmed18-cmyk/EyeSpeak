import { forwardRef } from 'react';

interface CameraFeedProps {
  onVideoLoaded?: () => void;
}

export const CameraFeed = forwardRef<HTMLVideoElement, CameraFeedProps>(
  ({ onVideoLoaded }, ref) => {
    return (
      <video
        ref={ref}
        playsInline
        muted
        autoPlay
        onLoadedMetadata={onVideoLoaded}
        className="feed-video"
      />
    );
  }
);

CameraFeed.displayName = 'CameraFeed';
