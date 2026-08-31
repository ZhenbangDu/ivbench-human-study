import { useEffect, useRef } from 'react';
import type { CandidateVideo } from '../study/types';

type MediaPanelProps = {
  candidate: CandidateVideo;
  label: string;
  playing: boolean;
  time: number;
};

export function MediaPanel({ candidate, label, playing, time }: MediaPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !candidate.src) return;
    if (Math.abs(video.currentTime - time) > 0.18) video.currentTime = time;
    if (playing) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [candidate.src, playing, time]);

  return (
    <section className="candidate-card" aria-label={`${label} candidate video`}>
      <div className="candidate-frame">
        {candidate.src ? (
          <video
            ref={videoRef}
            src={candidate.src}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <div className="video-empty-state">
            <span className="video-empty-icon" aria-hidden="true">▶</span>
            <strong>Video not added yet</strong>
            <small>Neutral media file will appear here</small>
          </div>
        )}
      </div>
      <div className="position-label">{label}</div>
    </section>
  );
}
