import type { CSSProperties } from 'react';
import type { GroundTruthConfig, NormalizedRegion } from '../study/types';

type GroundTruthProps = {
  config: GroundTruthConfig;
  time: number;
};

function eventRegionKey(region: NormalizedRegion | null) {
  return region
    ? [region.x, region.y, region.width, region.height].join(':')
    : 'unconstrained';
}

export function activeGroundTruthEvents(config: GroundTruthConfig, time: number) {
  const latestStartByRegion = new Map<string, number>();
  for (const event of config.events) {
    if (event.timeStart > time) continue;
    const key = eventRegionKey(event.region);
    const latestStart = latestStartByRegion.get(key);
    if (latestStart === undefined || event.timeStart > latestStart) {
      latestStartByRegion.set(key, event.timeStart);
    }
  }

  return config.events
    .filter((event) => (
      event.timeStart === latestStartByRegion.get(eventRegionKey(event.region))
      && time < event.timeEnd
    ))
    .sort((left, right) => left.timeStart - right.timeStart);
}

function groupedRegionalEvents(events: GroundTruthConfig['events']) {
  const groups = new Map<string, {
    region: NormalizedRegion;
    events: GroundTruthConfig['events'];
  }>();

  for (const event of events) {
    if (!event.region) continue;
    const key = eventRegionKey(event.region);
    const group = groups.get(key) ?? { region: event.region, events: [] };
    group.events.push(event);
    groups.set(key, group);
  }
  return [...groups.values()];
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
  const regionalEvents = groupedRegionalEvents(activeEvents);
  const unconstrainedEvents = activeEvents.filter((event) => event.region === null);
  const progress = Math.min(100, Math.max(0, (time / config.durationSeconds) * 100));

  return (
    <section className="ground-truth-card" aria-label="Ground Truth reference">
      <div className="ground-truth-heading">
        <span>Ground Truth</span>
        <span className="ground-truth-purpose">Layout &amp; timing</span>
      </div>
      <div
        className="ground-truth-canvas"
        data-testid="ground-truth-canvas"
        style={{ aspectRatio: `${config.canvas.width} / ${config.canvas.height}` }}
      >
        <div className="gt-grid" />
        {config.subjectRegion ? (
          <div className="gt-region gt-subject" style={regionStyle(config.subjectRegion)}>
            <span>SUBJECT</span>
          </div>
        ) : (
          <div className="gt-unconstrained">UNCONSTRAINED</div>
        )}
        {regionalEvents.map(({ region, events }) => (
          <div
            className="gt-region gt-text"
            data-testid="ground-truth-text-region"
            key={eventRegionKey(region)}
            style={regionStyle(region)}
          >
            {events.map((event) => (
              <span key={event.id}>{event.text}</span>
            ))}
          </div>
        ))}
        {unconstrainedEvents.map((event) => (
          <div className="gt-unconstrained-text" key={event.id}>{event.text}</div>
        ))}
        <div className="gt-timecode">{time.toFixed(1)}s</div>
      </div>
      <div className="gt-timeline" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}
