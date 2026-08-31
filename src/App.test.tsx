import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, choiceLabels } from './App';
import { StudyStore, type StorageLike } from './persistence/store';
import type { ParticipantSession } from './study/session';

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const appProps = {
  storage: new MemoryStorage(),
  endpoint: '',
  uuidFactory: () => '123e4567-e89b-12d3-a456-426614174000',
};

const storedSession: ParticipantSession = {
  sessionId: '123e4567-e89b-12d3-a456-426614174000',
  participantCode: 'Participant-174000',
  nickname: '',
  displayName: 'Participant-174000',
  studyVersion: 'act-h3-v1',
  startedAt: '2026-08-31T12:00:00.000Z',
  status: 'in_progress',
  completionCode: null,
};

function acknowledgingFetch(uploadedTypes: string[]): typeof fetch {
  return async (_input, init) => {
    const body = new URLSearchParams(String(init?.body));
    const envelope = JSON.parse(body.get('payload') ?? '{}');
    uploadedTypes.push(envelope.type);
    return new Response(JSON.stringify({ ok: true, requestId: envelope.requestId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

async function startStudy() {
  const user = userEvent.setup();
  render(<App {...appProps} storage={new MemoryStorage()} />);
  await user.click(screen.getByRole('button', { name: /start study/i }));
  return user;
}

describe('App', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts with an optional nickname and enters the first of 30 trials', async () => {
    await startStudy();

    expect(screen.getByText('1 / 30')).toBeInTheDocument();
    expect(screen.getByText('Ground Truth')).toBeInTheDocument();
    expect(screen.getByLabelText('Left candidate video').querySelector('video')).toHaveAttribute(
      'src',
      'media/trial_001_a.mp4',
    );
    expect(screen.getByLabelText('Right candidate video').querySelector('video')).toHaveAttribute(
      'src',
      'media/trial_001_b.mp4',
    );
    expect(screen.getByText('Participant-174000')).toBeInTheDocument();
  });

  it('requires all three choices before advancing and saves each choice', async () => {
    const user = await startStudy();
    const next = screen.getByRole('button', { name: /next/i });
    expect(next).toBeDisabled();

    for (const button of screen.getAllByRole('button', { name: 'Left' })) {
      await user.click(button);
    }

    expect(next).toBeEnabled();
    await user.click(next);
    expect(screen.getByText('2 / 30')).toBeInTheDocument();
  });

  it('automatically advances after the third answer completes a new trial', async () => {
    const user = await startStudy();

    for (const button of screen.getAllByRole('button', { name: 'Left' })) {
      await user.click(button);
    }

    await waitFor(() => expect(screen.getByText('2 / 30')).toBeInTheDocument());
  });

  it('keeps the synchronized playback running after a trial duration elapses', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const store = new StudyStore(storage, 'act-h3-v1');
    store.startSession(storedSession);
    store.markSynced(store.snapshot().outbox[0]);

    render(<App {...appProps} storage={storage} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(5200); });

    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('uploads one final response only after all three questions are answered', async () => {
    const storage = new MemoryStorage();
    const uploadedTypes: string[] = [];
    vi.stubGlobal('fetch', acknowledgingFetch(uploadedTypes));
    const user = userEvent.setup();
    render(<App {...appProps} storage={storage} endpoint="https://example.test/exec" />);
    await user.click(screen.getByRole('button', { name: /start study/i }));
    await waitFor(() => expect(uploadedTypes).toEqual(['session']));

    const answers = screen.getAllByRole('button', { name: 'Left' });
    await user.click(answers[0]);
    await user.click(answers[1]);
    expect(uploadedTypes).toEqual(['session']);

    await user.click(answers[2]);
    await waitFor(() => expect(uploadedTypes).toEqual(['session', 'response']));
  });

  it('keeps incomplete answers local while an earlier upload is still running', async () => {
    const storage = new MemoryStorage();
    const uploadedTypes: string[] = [];
    let releaseSession!: () => void;
    const sessionUploadBlocked = new Promise<void>((resolve) => { releaseSession = resolve; });
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      const envelope = JSON.parse(body.get('payload') ?? '{}');
      uploadedTypes.push(envelope.type);
      if (envelope.type === 'session') await sessionUploadBlocked;
      return new Response(JSON.stringify({ ok: true, requestId: envelope.requestId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const user = userEvent.setup();
    render(<App {...appProps} storage={storage} endpoint="https://example.test/exec" />);
    await user.click(screen.getByRole('button', { name: /start study/i }));
    await waitFor(() => expect(uploadedTypes).toEqual(['session']));

    const answers = screen.getAllByRole('button', { name: 'Left' });
    await user.click(answers[0]);
    await user.click(answers[1]);
    releaseSession();
    await waitFor(() => expect(screen.getByText('Synced')).toBeInTheDocument());

    expect(uploadedTypes).toEqual(['session']);
    const saved = new StudyStore(storage, 'act-h3-v1').snapshot();
    expect(saved.responses.trial_001.informationChoice).toBe('v001a');
    expect(saved.responses.trial_001.placementChoice).toBe('v001a');
  });

  it('resumes pending uploads when a saved session is reopened', async () => {
    const storage = new MemoryStorage();
    const store = new StudyStore(storage, 'act-h3-v1');
    store.startSession(storedSession);
    const uploadedTypes: string[] = [];
    vi.stubGlobal('fetch', acknowledgingFetch(uploadedTypes));

    render(<App {...appProps} storage={storage} endpoint="https://example.test/exec" />);

    await waitFor(() => expect(uploadedTypes).toEqual(['session']));
    expect(new StudyStore(storage, 'act-h3-v1').snapshot().outbox).toHaveLength(0);
  });

  it('asks participants to keep the completion page open until syncing finishes', async () => {
    const storage = new MemoryStorage();
    const store = new StudyStore(storage, 'act-h3-v1');
    store.startSession(storedSession);
    store.finishSession('DONE-TEST1234');
    let releaseUpload!: () => void;
    const uploadBlocked = new Promise<void>((resolve) => { releaseUpload = resolve; });
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      const envelope = JSON.parse(body.get('payload') ?? '{}');
      await uploadBlocked;
      return new Response(JSON.stringify({ ok: true, requestId: envelope.requestId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    render(<App {...appProps} storage={storage} endpoint="https://example.test/exec" />);
    expect(screen.getByText(/please keep this page open/i)).toBeInTheDocument();

    releaseUpload();
    await waitFor(() => expect(screen.getByText(/results are synced.*close this page/i)).toBeInTheDocument());
  });

  it('automatically retries a pending completion upload after a temporary failure', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const store = new StudyStore(storage, 'act-h3-v1');
    store.startSession(storedSession);
    store.finishSession('DONE-TEST1234');
    let attempts = 0;
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      attempts += 1;
      if (attempts === 1) return new Response('', { status: 503 });
      const body = new URLSearchParams(String(init?.body));
      const envelope = JSON.parse(body.get('payload') ?? '{}');
      return new Response(JSON.stringify({ ok: true, requestId: envelope.requestId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    render(<App {...appProps} storage={storage} endpoint="https://example.test/exec" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(attempts).toBe(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(attempts).toBe(2);
    expect(screen.getByText(/results are synced.*close this page/i)).toBeInTheDocument();
  });

  it('reopens an already-synced completion page as safe to close', () => {
    const storage = new MemoryStorage();
    const store = new StudyStore(storage, 'act-h3-v1');
    store.startSession(storedSession);
    store.finishSession('DONE-TEST1234');
    store.markSynced(store.snapshot().outbox[0]);

    render(<App {...appProps} storage={storage} endpoint="https://example.test/exec" />);

    expect(screen.getByText(/results are synced.*close this page/i)).toBeInTheDocument();
    expect(screen.queryByText(/please keep this page open/i)).not.toBeInTheDocument();
  });

  it('starts a fresh local study after synced results are safe to retain remotely', async () => {
    const storage = new MemoryStorage();
    const store = new StudyStore(storage, 'act-h3-v1');
    store.startSession(storedSession);
    store.finishSession('DONE-TEST1234');
    store.markSynced(store.snapshot().outbox[0]);
    const user = userEvent.setup();

    render(<App {...appProps} storage={storage} endpoint="https://example.test/exec" />);
    const retake = screen.getByRole('button', { name: /take the study again/i });
    expect(retake).toBeEnabled();

    await user.click(retake);

    expect(screen.getByRole('button', { name: /start study/i })).toBeInTheDocument();
    expect(storage.getItem('ivbench-human-study:act-h3-v1')).toBeNull();
  });

  it('keeps the retake option disabled until completion results finish syncing', async () => {
    const storage = new MemoryStorage();
    const store = new StudyStore(storage, 'act-h3-v1');
    store.startSession(storedSession);
    store.finishSession('DONE-TEST1234');
    let releaseUpload!: () => void;
    const uploadBlocked = new Promise<void>((resolve) => { releaseUpload = resolve; });
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      const envelope = JSON.parse(body.get('payload') ?? '{}');
      await uploadBlocked;
      return new Response(JSON.stringify({ ok: true, requestId: envelope.requestId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    render(<App {...appProps} storage={storage} endpoint="https://example.test/exec" />);
    const retake = screen.getByRole('button', { name: /take the study again/i });
    expect(retake).toBeDisabled();

    releaseUpload();
    await waitFor(() => expect(retake).toBeEnabled());
  });

  it('describes a completed no-endpoint study as saved locally, not synced', () => {
    const storage = new MemoryStorage();
    const store = new StudyStore(storage, 'act-h3-v1');
    store.startSession(storedSession);
    store.finishSession('DONE-TEST1234');

    render(<App {...appProps} storage={storage} endpoint="" />);

    expect(screen.getByText(/results are saved on this device/i)).toBeInTheDocument();
    expect(screen.queryByText(/results are synced/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /take the study again/i })).toBeDisabled();
  });

  it('shows the approved question copy', async () => {
    await startStudy();
    expect(screen.getByText('Which video makes the information easier to read and understand?')).toBeInTheDocument();
    expect(screen.getByText('Which video puts the text in a better place?')).toBeInTheDocument();
    expect(screen.getByText('Which video looks better overall?')).toBeInTheDocument();
  });

  it('emphasizes the key criteria inside each question hint', async () => {
    await startStudy();

    for (const criterion of [
      'correct',
      'clear',
      'right time',
      'where it should be',
      'covering the main subject',
      'the scene',
      'the text',
    ]) {
      expect(screen.getByText(criterion, { selector: 'strong' })).toBeInTheDocument();
    }
  });

  it('clears local study progress and returns to the welcome screen after confirmation', async () => {
    const storage = new MemoryStorage();
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App {...appProps} storage={storage} />);

    await user.click(screen.getByRole('button', { name: /start study/i }));
    expect(storage.getItem('ivbench-human-study:act-h3-v1')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: /start over/i }));

    expect(screen.getByRole('button', { name: /start study/i })).toBeInTheDocument();
    expect(storage.getItem('ivbench-human-study:act-h3-v1')).toBeNull();
  });

  it('keeps the current study when start over is cancelled', async () => {
    const storage = new MemoryStorage();
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App {...appProps} storage={storage} />);

    await user.click(screen.getByRole('button', { name: /start study/i }));
    await user.click(screen.getByRole('button', { name: /start over/i }));

    expect(screen.getByText('1 / 30')).toBeInTheDocument();
    expect(storage.getItem('ivbench-human-study:act-h3-v1')).not.toBeNull();
  });
});

describe('choiceLabels', () => {
  it('uses Top and Bottom only in portrait mode', () => {
    expect(choiceLabels('portrait')).toEqual(['Top', 'About the same', 'Bottom']);
    expect(choiceLabels('desktop')).toEqual(['Left', 'About the same', 'Right']);
    expect(choiceLabels('landscape')).toEqual(['Left', 'About the same', 'Right']);
  });
});
