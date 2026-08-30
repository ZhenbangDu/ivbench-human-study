import { useEffect, useMemo, useRef, useState } from 'react';
import { GroundTruth } from '../components/GroundTruth';
import { curatorApi } from './api';
import { CuratorVideo } from './CuratorVideo';
import type {
  CuratorApi,
  CuratorItem,
  CuratorPayload,
  SelectionPatch,
  SelectionStatus,
} from './types';
import { useSynchronizedPlayback } from './useSynchronizedPlayback';

type CuratorAppProps = { api?: CuratorApi };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const STATUS_LABELS: Record<SelectionStatus, string> = {
  unreviewed: 'Unreviewed',
  include: 'Include',
  exclude: 'Exclude',
  needs_fix: 'Needs Fix',
};

function updatePayload(
  payload: CuratorPayload,
  id: string,
  selection: CuratorItem['selection'],
  summary: CuratorPayload['summary'],
) {
  return {
    ...payload,
    summary,
    items: payload.items.map((item) => item.id === id ? { ...item, selection } : item),
  };
}

export function CuratorApp({ api = curatorApi }: CuratorAppProps) {
  const [payload, setPayload] = useState<CuratorPayload | null>(null);
  const [currentId, setCurrentId] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SelectionStatus>('all');
  const [subtaskFilter, setSubtaskFilter] = useState('all');
  const [missingOnly, setMissingOnly] = useState(false);
  const [commentsOnly, setCommentsOnly] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const pendingComment = useRef<{ id: string; comment: string } | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    api.fetchItems()
      .then((nextPayload) => {
        if (!active) return;
        setPayload(nextPayload);
        setCurrentId(nextPayload.items[0]?.id ?? '');
      })
      .catch((loadError: Error) => active && setError(loadError.message));
    return () => { active = false; };
  }, [api]);

  const currentItem = payload?.items.find((item) => item.id === currentId) ?? null;
  const subtaskOptions = useMemo(
    () => [...new Set(payload?.items.map((item) => item.subtask) ?? [])],
    [payload],
  );
  const visibleItems = useMemo(() => {
    if (!payload) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return payload.items.filter((item) => {
      if (statusFilter !== 'all' && item.selection.status !== statusFilter) return false;
      if (subtaskFilter !== 'all' && item.subtask !== subtaskFilter) return false;
      if (missingOnly && item.availability.complete) return false;
      if (commentsOnly && !(drafts[item.id] ?? item.selection.comment).trim()) return false;
      if (normalizedQuery && !`${item.id} ${item.topic} ${item.videoGoal}`.toLowerCase().includes(normalizedQuery)) return false;
      return true;
    });
  }, [commentsOnly, drafts, missingOnly, payload, query, statusFilter, subtaskFilter]);

  async function persist(id: string, patch: SelectionPatch) {
    setSaveState('saving');
    setError('');
    try {
      const response = await api.saveSelection(id, patch);
      setPayload((previous) => previous
        ? updatePayload(previous, id, response.selection, response.summary)
        : previous);
      setDrafts((previous) => ({ ...previous, [id]: response.selection.comment }));
      setSaveState('saved');
      return true;
    } catch (saveError) {
      setSaveState('error');
      setError(saveError instanceof Error ? saveError.message : 'Unable to save selection');
      return false;
    }
  }

  async function flushComment() {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const pending = pendingComment.current;
    pendingComment.current = null;
    if (pending) await persist(pending.id, { comment: pending.comment });
  }

  function scheduleComment(id: string, comment: string) {
    setDrafts((previous) => ({ ...previous, [id]: comment }));
    setSaveState('saving');
    pendingComment.current = { id, comment };
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flushComment(); }, 400);
  }

  async function navigate(nextId: string | undefined) {
    if (!nextId || nextId === currentId) return;
    await flushComment();
    setCurrentId(nextId);
    setSaveState('idle');
  }

  async function chooseStatus(status: SelectionStatus) {
    if (!currentItem || !payload) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    pendingComment.current = null;
    const saved = await persist(currentItem.id, {
      status,
      comment: drafts[currentItem.id] ?? currentItem.selection.comment,
    });
    if (saved) {
      const nextItem = payload.items[currentItem.order + 1];
      if (nextItem) {
        setCurrentId(nextItem.id);
        setSaveState('idle');
      }
    }
  }

  useEffect(() => () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
  }, []);

  if (error && !payload) {
    return <main className="curator-fatal"><h1>Unable to start curator</h1><p>{error}</p></main>;
  }
  if (!payload || !currentItem) {
    return <main className="curator-loading">Loading 200 ACT–MiniMax H3 pairs…</main>;
  }

  return (
    <div className="curator-shell">
      <header className="curator-header">
        <div className="curator-brand">
          <span className="curator-kicker">LOCAL CURATION</span>
          <strong>ACT vs. MiniMax H3</strong>
        </div>
        <div className="curator-counts" aria-label="Selection counts">
          <strong>Included: {payload.summary.include} / {payload.summary.target}</strong>
          <span>{payload.summary.total} items</span>
          <span>{payload.items.filter((item) => item.availability.complete).length} complete pairs</span>
        </div>
        <nav className="curator-exports" aria-label="Export selections">
          <a href="/api/export.csv" download>Export CSV</a>
          <a href="/api/export.json" download>Export JSON</a>
        </nav>
      </header>

      <div className="curator-workspace">
        <aside className="curator-sidebar">
          <div className="curator-filters">
            <label>
              <span>Search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ID, topic, or goal" />
            </label>
            <div className="curator-filter-row">
              <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option value="all">All statuses</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select></label>
              <label><span>Subtask</span><select value={subtaskFilter} onChange={(event) => setSubtaskFilter(event.target.value)}>
                <option value="all">All subtasks</option>
                {subtaskOptions.map((subtask) => <option value={subtask} key={subtask}>{subtask}</option>)}
              </select></label>
            </div>
            <div className="curator-checks">
              <label><input type="checkbox" checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} /> Missing media</label>
              <label><input type="checkbox" checked={commentsOnly} onChange={(event) => setCommentsOnly(event.target.checked)} /> Has comment</label>
            </div>
          </div>
          <div className="curator-list-heading"><span>{visibleItems.length} shown</span><span>#{currentItem.order + 1}</span></div>
          <div className="curator-item-list">
            {visibleItems.map((item) => (
              <button
                className={`curator-item curator-item-${item.selection.status}`}
                aria-current={item.id === currentId ? 'true' : undefined}
                key={item.id}
                onClick={() => void navigate(item.id)}
              >
                <span>{item.id}</span>
                <small>{STATUS_LABELS[item.selection.status]}{item.selection.comment ? ' · Comment' : ''}</small>
              </button>
            ))}
          </div>
        </aside>

        <main className="curator-main">
          <div className="curator-sample-heading">
            <div>
              <span className={`curator-status-badge status-${currentItem.selection.status}`}>{STATUS_LABELS[currentItem.selection.status]}</span>
              <h1>{currentItem.id}</h1>
            </div>
            <div className="curator-nav-buttons">
              <button aria-label="Previous sample" disabled={currentItem.order === 0} onClick={() => void navigate(payload.items[currentItem.order - 1]?.id)}>← Previous</button>
              <span>{currentItem.order + 1} / {payload.items.length}</span>
              <button aria-label="Next sample" disabled={currentItem.order === payload.items.length - 1} onClick={() => void navigate(payload.items[currentItem.order + 1]?.id)}>Next →</button>
            </div>
          </div>
          <p className="curator-topic">{currentItem.topic}</p>
          <Comparison item={currentItem} />

          {currentItem.failure && (
            <div className="curator-failure" role="note">
              <strong>{currentItem.failure.state}</strong>
              <span>{currentItem.failure.reason}</span>
            </div>
          )}

          <section className="curator-review-panel" aria-label="Review decision">
            <div className="curator-decision-buttons">
              {(['include', 'exclude', 'needs_fix'] as const).map((status) => (
                <button
                  className={`decision-${status}`}
                  disabled={status === 'include' && !currentItem.availability.complete}
                  aria-pressed={currentItem.selection.status === status}
                  key={status}
                  onClick={() => void chooseStatus(status)}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
            <label className="curator-comment">
              <span>Comment <small>Describe what should be fixed or why this pair is useful.</small></span>
              <textarea
                aria-label="Comment"
                maxLength={10_000}
                placeholder="e.g. ACT text overlaps the subject at 2.1s"
                value={drafts[currentItem.id] ?? currentItem.selection.comment}
                onChange={(event) => scheduleComment(currentItem.id, event.target.value)}
              />
            </label>
            <div className={`curator-save-state save-${saveState}`} role="status">
              {saveState === 'saving' && 'Saving…'}
              {saveState === 'saved' && 'Saved locally'}
              {saveState === 'error' && 'Save failed'}
              {saveState === 'idle' && 'Changes are saved to this computer'}
            </div>
            {error && <div className="curator-inline-error">{error}</div>}
          </section>
        </main>
      </div>
    </div>
  );
}

function Comparison({ item }: { item: CuratorItem }) {
  const playback = useSynchronizedPlayback(item.groundTruth.durationSeconds, item.id);
  return (
    <section className="curator-comparison" aria-label="ACT and MiniMax H3 comparison">
      <div className="curator-media-grid">
        <CuratorVideo
          label="ACT"
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
