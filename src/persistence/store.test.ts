import { beforeEach, describe, expect, it } from 'vitest';
import type { ParticipantSession } from '../study/session';
import { StudyStore, type StorageLike, type TrialResponse } from './store';

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const session: ParticipantSession = {
  sessionId: 'session-1',
  participantCode: 'Participant-000001',
  nickname: '',
  displayName: 'Participant-000001',
  studyVersion: 'act-h3-v1',
  startedAt: '2026-08-28T12:00:00.000Z',
  status: 'in_progress',
  completionCode: null,
};

const response: TrialResponse = {
  requestId: 'response:session-1:trial_001',
  sessionId: 'session-1',
  studyVersion: 'act-h3-v1',
  trialId: 'trial_001',
  itemId: 'item_001',
  trialIndex: 0,
  firstPositionVideoCode: 'v001a',
  secondPositionVideoCode: 'v001b',
  informationChoice: 'v001a',
  placementChoice: 'same',
  overallChoice: 'v001b',
  replayCount: 1,
  elapsedMs: 4500,
  deviceLayout: 'desktop',
  edited: false,
  updatedAt: '2026-08-28T12:01:00.000Z',
};

describe('StudyStore', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('persists a started session and queues it for synchronization', () => {
    const store = new StudyStore(storage, 'act-h3-v1');
    store.startSession(session);

    expect(store.snapshot().session).toEqual(session);
    expect(store.snapshot().outbox.map(({ requestId }) => requestId)).toEqual([
      'session:session-1',
    ]);
  });

  it('writes a response locally and resumes it in a reopened store', () => {
    const store = new StudyStore(storage, 'act-h3-v1');
    store.startSession(session);
    store.saveResponse(response);

    const reopened = new StudyStore(storage, 'act-h3-v1');
    expect(reopened.snapshot().responses.trial_001).toEqual(response);
    expect(reopened.snapshot().outbox.map(({ requestId }) => requestId)).toEqual([
      'session:session-1',
      'response:session-1:trial_001',
    ]);
  });

  it('upserts revised answers instead of duplicating outbox entries', () => {
    const store = new StudyStore(storage, 'act-h3-v1');
    store.saveResponse(response);
    store.saveResponse({ ...response, informationChoice: 'same', edited: true });

    expect(store.snapshot().outbox).toHaveLength(1);
    expect(store.snapshot().responses.trial_001.informationChoice).toBe('same');
    expect(store.snapshot().responses.trial_001.edited).toBe(true);
  });

  it('removes only the acknowledged request from the outbox', () => {
    const store = new StudyStore(storage, 'act-h3-v1');
    store.startSession(session);
    store.saveResponse(response);
    store.markSynced('session:session-1');

    expect(store.snapshot().outbox.map(({ requestId }) => requestId)).toEqual([
      'response:session-1:trial_001',
    ]);
  });
});
