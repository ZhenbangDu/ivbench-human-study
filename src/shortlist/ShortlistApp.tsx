import { useEffect, useMemo, useState } from 'react';
import { GroundTruth } from '../components/GroundTruth';
import { CuratorVideo } from '../curation/CuratorVideo';
import { useSynchronizedPlayback } from '../curation/useSynchronizedPlayback';
import { shortlistApi } from './api';
import type { ShortlistApi, ShortlistItem, ShortlistPayload } from './types';

type StatusFilter = 'all' | ShortlistItem['selection']['status'];

const STATUS_LABELS = {
  include: 'Included',
  needs_fix: 'Needs Fix',
} as const;

export function ShortlistApp({ api = shortlistApi }: { api?: ShortlistApi }) {
  const [payload, setPayload] = useState<ShortlistPayload | null>(null);
  const [currentId, setCurrentId] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [subtaskFilter, setSubtaskFilter] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.fetchShortlist()
      .then((nextPayload) => {
        if (!active) return;
        setPayload(nextPayload);
        setCurrentId(nextPayload.items[0]?.id ?? '');
      })
      .catch((loadError: Error) => active && setError(loadError.message));
    return () => { active = false; };
  }, [api]);

  const subtaskOptions = useMemo(
    () => [...new Set(payload?.items.map((item) => item.subtask) ?? [])],
    [payload],
  );
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (payload?.items ?? []).filter((item) => {
      if (statusFilter !== 'all' && item.selection.status !== statusFilter) return false;
      if (subtaskFilter !== 'all' && item.subtask !== subtaskFilter) return false;
      return !normalizedQuery
        || `${item.id} ${item.topic} ${item.videoGoal}`.toLowerCase().includes(normalizedQuery);
    });
  }, [payload, query, statusFilter, subtaskFilter]);

  useEffect(() => {
    if (visibleItems.length > 0 && !visibleItems.some((item) => item.id === currentId)) {
      setCurrentId(visibleItems[0].id);
    }
  }, [currentId, visibleItems]);

  if (error) {
    return <main className="curator-fatal"><h1>Unable to load shortlist</h1><p>{error}</p></main>;
  }
  if (!payload) return <main className="curator-loading">Loading selected ACT–MiniMax H3 pairs…</main>;

  const currentItem = payload.items.find((item) => item.id === currentId) ?? visibleItems[0] ?? null;
  if (!currentItem) {
    return <main className="curator-fatal"><h1>No selected pairs</h1><p>Adjust the filters to continue.</p></main>;
  }
  const currentVisibleIndex = visibleItems.findIndex((item) => item.id === currentItem.id);

  return (
    <div className="shortlist-shell">
      <header className="shortlist-header">
        <div>
          <span className="curator-kicker">READ-ONLY REVIEW</span>
          <strong>ACT vs. MiniMax H3</strong>
          <span>Current shortlist</span>
        </div>
        <div className="shortlist-summary" aria-label="Shortlist summary">
          <strong>{payload.total} selected</strong>
          <span>{payload.repairedCount} repaired ACT</span>
          <span>{payload.total - payload.repairedCount} original ACT</span>
        </div>
      </header>

      <div className="shortlist-workspace">
        <aside className="shortlist-sidebar">
          <div className="shortlist-filters">
            <label>
              <span>Search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ID, topic, or goal" />
            </label>
            <label>
              <span>Status</span>
              <select aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="all">All selected</option>
                <option value="include">Included</option>
                <option value="needs_fix">Needs Fix</option>
              </select>
            </label>
            <label>
              <span>Subtask</span>
              <select aria-label="Subtask" value={subtaskFilter} onChange={(event) => setSubtaskFilter(event.target.value)}>
                <option value="all">All subtasks</option>
                {subtaskOptions.map((subtask) => <option key={subtask} value={subtask}>{subtask}</option>)}
              </select>
            </label>
          </div>
          <div className="shortlist-list-heading"><span>{visibleItems.length} shown</span><span>#{currentItem.order + 1}</span></div>
          <div className="shortlist-list">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                aria-current={item.id === currentItem.id ? 'true' : undefined}
                className={`shortlist-item shortlist-item-${item.selection.status}`}
                onClick={() => setCurrentId(item.id)}
              >
                <span>{item.id}</span>
                <small>{STATUS_LABELS[item.selection.status]} · {item.actSource === 'repaired' ? 'Repaired ACT' : 'Original ACT'}</small>
              </button>
            ))}
          </div>
        </aside>

        <main className="shortlist-main">
          <div className="shortlist-heading">
            <div>
              <span className={`curator-status-badge status-${currentItem.selection.status}`}>
                {STATUS_LABELS[currentItem.selection.status]}
              </span>
              <h1>{currentItem.id}</h1>
            </div>
            <nav className="curator-nav-buttons" aria-label="Pair navigation">
              <button
                aria-label="Previous sample"
                disabled={currentVisibleIndex <= 0}
                onClick={() => setCurrentId(visibleItems[currentVisibleIndex - 1]?.id ?? currentItem.id)}
              >← Previous</button>
              <span>{currentVisibleIndex + 1} / {visibleItems.length}</span>
              <button
                aria-label="Next sample"
                disabled={currentVisibleIndex < 0 || currentVisibleIndex === visibleItems.length - 1}
                onClick={() => setCurrentId(visibleItems[currentVisibleIndex + 1]?.id ?? currentItem.id)}
              >Next →</button>
            </nav>
          </div>

          <div className="shortlist-brief">
            <p>{currentItem.topic}</p>
            <strong>{currentItem.videoGoal}</strong>
          </div>

          <Comparison item={currentItem} />

          <section className="shortlist-note" aria-label="Curator note">
            <span>Curator note</span>
            <p>{currentItem.selection.comment || 'No curator comment for this pair.'}</p>
          </section>
        </main>
      </div>
    </div>
  );
}

function Comparison({ item }: { item: ShortlistItem }) {
  const playback = useSynchronizedPlayback(item.groundTruth.durationSeconds, item.id);
  return (
    <section className="curator-comparison" aria-label="ACT and MiniMax H3 comparison">
      <div className="curator-media-grid">
        <CuratorVideo
          label={`ACT · ${item.actSource === 'repaired' ? 'Repaired' : 'Original'}`}
          source={item.media.act}
          videoRef={playback.registerVideo(0)}
          onTimeUpdate={(time) => playback.onTimeUpdate(0, time)}
        />
        <GroundTruth config={item.groundTruth} time={playback.time} />
        <CuratorVideo
          label="MiniMax H3"
          source={item.media.h3}
          videoRef={playback.registerVideo(1)}
          onTimeUpdate={(time) => playback.onTimeUpdate(1, time)}
        />
      </div>
      <div className="curator-playback">
        <button onClick={playback.toggle}>{playback.playing ? 'Pause' : 'Play both'}</button>
        <button onClick={playback.replay}>Replay</button>
        <input
          aria-label="Video time"
          type="range"
          min="0"
          max={item.groundTruth.durationSeconds}
          step="0.01"
          value={playback.time}
          onChange={(event) => playback.setTime(Number(event.target.value))}
        />
        <span>{playback.time.toFixed(1)} / {item.groundTruth.durationSeconds.toFixed(1)}s</span>
      </div>
    </section>
  );
}
