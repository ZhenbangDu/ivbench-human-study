import type { CSSProperties } from 'react';
import type { GroundTruthConfig, NormalizedRegion } from '../study/types';

type GroundTruthProps = {
  config: GroundTruthConfig;
  time: number;
};

export function activeGroundTruthEvents(config: GroundTruthConfig, time: number) {
  return config.events.filter(
    (event) => event.timeStart <= time && time < event.timeEnd,
  );
}

function regionStyle(region: NormalizedRegion): CSSProperties {
  return {
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.width * 100}%`,
    height: `${region.height * 100}%`,
  };
}

export function GroundTruth({ config, time }: GroundTruthProps) {
  const activeEvents = activeGroundTruthEvents(config, time);
  const progress = Math.min(100, Math.max(0, (time / config.durationSeconds) * 100));

  return (
    <section className="ground-truth-card" aria-label="Ground Truth reference">
      <div className="ground-truth-heading">
        <span>Ground Truth</span>
        <span className="ground-truth-purpose">Layout &amp; timing</span>
      </div>
      <div className="ground-truth-canvas">
        <div className="gt-grid" />
        <div className="gt-region gt-subject" style={regionStyle(config.subjectRegion)}>
          <span>SUBJECT</span>
        </div>
        {activeEvents.map((event) => (
          <div
            className="gt-region gt-text"
            key={event.id}
            style={regionStyle(event.region)}
          >
            <span style={{ whiteSpace: 'nowrap' }}>{event.text}</span>
          </div>
        ))}
        <div className="gt-timecode">{time.toFixed(1)}s</div>
      </div>
      <div className="gt-timeline" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}
