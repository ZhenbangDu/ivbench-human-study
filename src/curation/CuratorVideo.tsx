import type { Ref } from 'react';

type CuratorVideoProps = {
  label: string;
  source: string | null;
  videoRef: Ref<HTMLVideoElement>;
  onTimeUpdate(time: number): void;
};

export function CuratorVideo({ label, source, videoRef, onTimeUpdate }: CuratorVideoProps) {
  return (
    <section className="curator-media-card" aria-label={`${label} video`}>
      <div className="curator-media-label">{label}</div>
      <div className="curator-video-frame">
        {source ? (
          <video
            ref={videoRef}
            src={source}
            preload="metadata"
            autoPlay
            loop
            muted
            playsInline
            onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
          />
        ) : (
          <div className="curator-video-missing">
            <strong>{label} video unavailable</strong>
            <span>This item cannot be included yet.</span>
          </div>
        )}
      </div>
    </section>
  );
}
