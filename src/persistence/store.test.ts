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

  removeItem(key: string) {
    this.values.delete(key);
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

function responseForTrial(trialIndex: number): TrialResponse {
  const item = String(trialIndex + 1).padStart(3, '0');
  return {
    ...response,
    requestId: `response:session-1:trial_${item}`,
    trialId: `trial_${item}`,
    itemId: `item_${item}`,
    trialIndex,
    firstPositionVideoCode: `v${item}a`,
    secondPositionVideoCode: `v${item}b`,
    informationChoice: `v${item}a`,
    overallChoice: `v${item}b`,
  };
}

function legacyCompletedState() {
  return {
    studyVersion: 'act-h3-v1',
    session: {
      ...session,
      status: 'completed',
      completionCode: 'DONE-SESSION1',
    },
    currentTrialIndex: 29,
    responses: Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => {
        const savedResponse = responseForTrial(index);
        return [savedResponse.trialId, savedResponse];
      }),
    ),
    outbox: [],
  };
}

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
    store.markSynced(store.snapshot().outbox[0]);

    expect(store.snapshot().outbox.map(({ requestId }) => requestId)).toEqual([
      'response:session-1:trial_001',
    ]);
  });

  it('preserves legacy partial drafts but removes them from the upload queue', () => {
    const partial = {
      ...response,
      placementChoice: null,
      overallChoice: null,
    };
    storage.setItem('ivbench-human-study:act-h3-v1', JSON.stringify({
      studyVersion: 'act-h3-v1',
      session,
      currentTrialIndex: 0,
      responses: { trial_001: partial },
      outbox: [{
        requestId: partial.requestId,
        type: 'response',
        payload: partial,
      }],
    }));

    const reopened = new StudyStore(storage, 'act-h3-v1').snapshot();

    expect(reopened.responses.trial_001).toEqual(partial);
    expect(reopened.outbox).toHaveLength(0);
  });

  it('requeues every complete response before a legacy completed session', () => {
    storage.setItem(
      'ivbench-human-study:act-h3-v1',
      JSON.stringify(legacyCompletedState()),
    );

    const recovered = new StudyStore(storage, 'act-h3-v1').snapshot();

    expect(recovered.outbox).toHaveLength(31);
    expect(recovered.outbox.slice(0, 30).map(({ requestId }) => requestId)).toEqual(
      Array.from(
        { length: 30 },
        (_, index) => `response:session-1:trial_${String(index + 1).padStart(3, '0')}`,
      ),
    );
    expect(recovered.outbox[30]).toMatchObject({
      requestId: 'session:session-1',
      type: 'session',
      payload: { status: 'completed' },
    });
  });

  it('does not replay a repaired completed session on later reloads', () => {
    storage.setItem(
      'ivbench-human-study:act-h3-v1',
      JSON.stringify(legacyCompletedState()),
    );
    const recovered = new StudyStore(storage, 'act-h3-v1');
    for (const item of recovered.snapshot().outbox) recovered.markSynced(item);

    const reopened = new StudyStore(storage, 'act-h3-v1').snapshot();

    expect(reopened.outbox).toHaveLength(0);
  });

  it('does not replay a newly completed session after its queue is acknowledged', () => {
    const store = new StudyStore(storage, 'act-h3-v1');
    store.startSession(session);
    for (let index = 0; index < 30; index += 1) {
      store.saveResponse(responseForTrial(index));
    }
    store.finishSession('DONE-SESSION1');
    for (const item of store.snapshot().outbox) store.markSynced(item);

    const reopened = new StudyStore(storage, 'act-h3-v1').snapshot();

    expect(reopened.outbox).toHaveLength(0);
  });
});
