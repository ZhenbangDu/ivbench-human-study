import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GroundTruth } from './components/GroundTruth';
import { MediaPanel } from './components/MediaPanel';
import { QuestionCard } from './components/QuestionCard';
import { Welcome } from './components/Welcome';
import { flushOutbox } from './persistence/api';
import {
  StudyStore,
  type DeviceLayout,
  type StorageLike,
  type TrialResponse,
} from './persistence/store';
import { studyManifest } from './study/manifest';
import {
  createSession,
  denormalizeChoice,
  normalizeChoice,
  type ParticipantSession,
  type PhysicalChoice,
} from './study/session';

type AppProps = {
  storage?: StorageLike;
  endpoint?: string;
  uuidFactory?: () => string;
};

type QuestionKey = 'informationChoice' | 'placementChoice' | 'overallChoice';

const questions: Array<{ key: QuestionKey; heading: string; hint: string }> = [
  {
    key: 'informationChoice',
    heading: 'Which video makes the information easier to read and understand?',
    hint: 'Is the text correct, clear, and shown at the right time?',
  },
  {
    key: 'placementChoice',
    heading: 'Which video puts the text in a better place?',
    hint: 'Is the text where it should be, without covering the main subject?',
  },
  {
    key: 'overallChoice',
    heading: 'Which video looks better overall?',
    hint: 'Think about both the scene and the text.',
  },
];

export function choiceLabels(layout: DeviceLayout): readonly [string, string, string] {
  return layout === 'portrait'
    ? ['Top', 'About the same', 'Bottom']
    : ['Left', 'About the same', 'Right'];
}

function readDeviceLayout(): DeviceLayout {
  if (window.innerWidth > 700) return 'desktop';
  return window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
}

function useDeviceLayout() {
  const [layout, setLayout] = useState<DeviceLayout>(readDeviceLayout);
  useEffect(() => {
    const update = () => setLayout(readDeviceLayout());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return layout;
}

function useMasterClock(duration: number, trialId: string) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const originRef = useRef(performance.now());

  const replay = useCallback(() => {
    originRef.current = performance.now();
    setTime(0);
    setPlaying(true);
  }, []);

  useEffect(() => {
    replay();
  }, [replay, trialId]);

  useEffect(() => {
    if (!playing) return;
    originRef.current = performance.now() - time * 1000;
    const timer = window.setInterval(() => {
      const next = (performance.now() - originRef.current) / 1000;
      if (next >= duration) {
        setTime(duration);
        setPlaying(false);
      } else {
        setTime(next);
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [duration, playing]);

  const toggle = useCallback(() => {
    if (time >= duration) {
      replay();
      return;
    }
    setPlaying((value) => !value);
  }, [duration, replay, time]);

  return { time, playing, replay, toggle };
}

function isComplete(response?: TrialResponse) {
  return Boolean(
    response?.informationChoice && response.placementChoice && response.overallChoice,
  );
}

function completionCode(sessionId: string) {
  return `DONE-${sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()}`;
}

export function App({
  storage = window.localStorage,
  endpoint = import.meta.env.VITE_APPS_SCRIPT_URL ?? '',
  uuidFactory,
}: AppProps) {
  const store = useMemo(
    () => new StudyStore(storage, studyManifest.studyVersion),
    [storage],
  );
  const initial = store.snapshot();
  const [session, setSession] = useState<ParticipantSession | null>(initial.session);
  const [responses, setResponses] = useState(initial.responses);
  const [trialIndex, setTrialIndex] = useState(initial.currentTrialIndex);
  const [syncLabel, setSyncLabel] = useState(endpoint ? 'Ready to sync' : 'Saved on this device');
  const [replayCount, setReplayCount] = useState(0);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const syncRetryTimerRef = useRef<number | null>(null);
  const synchronizeRef = useRef<() => Promise<void>>(async () => undefined);
  const layout = useDeviceLayout();
  const trial = studyManifest.trials[trialIndex];
  const trialStartRef = useRef(Date.now());
  const { time, playing, replay, toggle } = useMasterClock(
    trial.groundTruth.durationSeconds,
    trial.id,
  );

  const clearSyncRetry = useCallback(() => {
    if (syncRetryTimerRef.current === null) return;
    window.clearTimeout(syncRetryTimerRef.current);
    syncRetryTimerRef.current = null;
  }, []);

  const synchronize = useCallback(async () => {
    clearSyncRetry();
    if (!endpoint) {
      setSyncLabel('Saved on this device');
      return;
    }
    setSyncLabel('Syncing…');
    const result = await flushOutbox(store, endpoint);
    if (result.remaining === 0) {
      setSyncLabel('Synced');
      return;
    }

    setSyncLabel('Sync delayed — saved locally');
    syncRetryTimerRef.current = window.setTimeout(() => {
      void synchronizeRef.current();
    }, 3000);
  }, [clearSyncRetry, endpoint, store]);
  synchronizeRef.current = synchronize;

  useEffect(() => {
    if (store.snapshot().outbox.length > 0) void synchronize();
  }, [store, synchronize]);

  useEffect(() => {
    const retry = () => void synchronize();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [synchronize]);

  useEffect(() => {
    trialStartRef.current = Date.now();
    setReplayCount(0);
  }, [trial.id]);

  useEffect(() => () => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
    }
    clearSyncRetry();
  }, [clearSyncRetry]);

  const start = (nickname: string) => {
    const nextSession = createSession(
      nickname,
      studyManifest.studyVersion,
      new Date(),
      uuidFactory,
    );
    store.startSession(nextSession);
    setSession(nextSession);
    void synchronize();
  };

  if (!session) return <Welcome onStart={start} />;

  if (session.status === 'completed') {
    const resultsSynced = !endpoint || syncLabel === 'Synced';
    return (
      <main className="completion-shell">
        <section className="completion-card">
          <div className="completion-mark">✓</div>
          <div className="eyebrow">STUDY COMPLETE</div>
          <h1>Thank you, {session.displayName}.</h1>
          <p className={resultsSynced ? 'completion-sync-ready' : 'completion-sync-waiting'}>
            {resultsSynced
              ? 'All results are synced. You can now close this page.'
              : 'Please keep this page open while your results sync.'}
          </p>
          <div className="completion-code"><span>Completion code</span><strong>{session.completionCode}</strong></div>
          <small>{syncLabel}</small>
        </section>
      </main>
    );
  }

  const currentResponse = responses[trial.id];
  const labels = choiceLabels(layout);
  const firstPositionLabel = layout === 'portrait' ? 'Top' : 'Left';
  const secondPositionLabel = layout === 'portrait' ? 'Bottom' : 'Right';

  const cancelAutoAdvance = () => {
    if (autoAdvanceTimerRef.current === null) return;
    window.clearTimeout(autoAdvanceTimerRef.current);
    autoAdvanceTimerRef.current = null;
  };

  const moveTo = (index: number) => {
    cancelAutoAdvance();
    const bounded = Math.max(0, Math.min(studyManifest.trials.length - 1, index));
    store.setCurrentTrialIndex(bounded);
    setTrialIndex(bounded);
  };

  const advance = () => {
    if (trialIndex < studyManifest.trials.length - 1) {
      moveTo(trialIndex + 1);
      return;
    }
    const code = completionCode(session.sessionId);
    store.finishSession(code);
    setSession(store.snapshot().session);
    void synchronize();
  };

  const choose = (key: QuestionKey, physicalChoice: PhysicalChoice) => {
    const normalized = normalizeChoice(physicalChoice, trial);
    const previous = responses[trial.id];
    const response: TrialResponse = {
      requestId: `response:${session.sessionId}:${trial.id}`,
      sessionId: session.sessionId,
      studyVersion: studyManifest.studyVersion,
      trialId: trial.id,
      itemId: trial.itemId,
      trialIndex,
      firstPositionVideoCode: trial.first.code,
      secondPositionVideoCode: trial.second.code,
      informationChoice: previous?.informationChoice ?? null,
      placementChoice: previous?.placementChoice ?? null,
      overallChoice: previous?.overallChoice ?? null,
      replayCount,
      elapsedMs: Date.now() - trialStartRef.current,
      deviceLayout: layout,
      edited: Boolean(previous?.edited || (previous?.[key] && previous[key] !== normalized)),
      updatedAt: new Date().toISOString(),
      [key]: normalized,
    };
    store.saveResponse(response, isComplete(response));
    setResponses(store.snapshot().responses);
    if (!isComplete(response)) {
      setSyncLabel(endpoint ? 'Saved locally' : 'Saved on this device');
      return;
    }

    void synchronize();
    if (!isComplete(previous)) {
      cancelAutoAdvance();
      autoAdvanceTimerRef.current = window.setTimeout(advance, 250);
    }
  };

  const next = () => {
    if (!isComplete(currentResponse)) return;
    advance();
  };

  const replayAll = () => {
    setReplayCount((count) => count + 1);
    replay();
  };

  const startOver = () => {
    const confirmed = window.confirm(
      'Start over? This clears the nickname and all progress saved on this device. Responses already synced to the study database will remain there.',
    );
    if (!confirmed) return;

    store.reset();
    cancelAutoAdvance();
    clearSyncRetry();
    setSession(null);
    setResponses({});
    setTrialIndex(0);
    setReplayCount(0);
    setSyncLabel(endpoint ? 'Ready to sync' : 'Saved on this device');
  };

  return (
    <main className="study-shell">
      <header className="study-header">
        <button className="icon-button" type="button" disabled={trialIndex === 0} onClick={() => moveTo(trialIndex - 1)} aria-label="Back">
          ←
        </button>
        <div className="progress-area">
          <div className="progress-track"><span style={{ width: `${((trialIndex + 1) / 30) * 100}%` }} /></div>
          <span className="progress-count">{trialIndex + 1} / 30</span>
        </div>
        <div className="header-actions">
          <span className="participant-chip">{session.displayName}</span>
          <span className="save-state">{syncLabel}</span>
          <button className="secondary-button reset-button" type="button" aria-label="Start over" onClick={startOver}>
            <span className="reset-label-full">Start over</span>
            <span className="reset-label-compact" aria-hidden="true">Reset</span>
          </button>
          <button className="secondary-button" type="button" onClick={toggle}>{playing ? 'Pause' : 'Play'}</button>
          <button className="secondary-button" type="button" onClick={replayAll}>Replay</button>
          <button className="next-button" type="button" disabled={!isComplete(currentResponse)} onClick={next}>
            {trialIndex === 29 ? 'Finish' : 'Next'} <span>→</span>
          </button>
        </div>
      </header>

      <section className="media-grid">
        <MediaPanel candidate={trial.first} label={firstPositionLabel} playing={playing} time={time} />
        <GroundTruth config={trial.groundTruth} time={time} />
        <MediaPanel candidate={trial.second} label={secondPositionLabel} playing={playing} time={time} />
      </section>

      <section className="questions" aria-label="Evaluation questions">
        {questions.map((question) => (
          <QuestionCard
            key={question.key}
            heading={question.heading}
            hint={question.hint}
            labels={labels}
            value={denormalizeChoice(currentResponse?.[question.key] ?? null, trial)}
            onChange={(choice) => choose(question.key, choice)}
          />
        ))}
      </section>
    </main>
  );
}
