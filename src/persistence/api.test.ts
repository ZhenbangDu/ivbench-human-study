import { describe, expect, it } from 'vitest';
import type { ParticipantSession } from '../study/session';
import { flushOutbox } from './api';
import { StudyStore, type StorageLike, type TrialResponse } from './store';

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
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

describe('flushOutbox', () => {
  it('keeps data local when no endpoint is configured', async () => {
    const store = new StudyStore(new MemoryStorage(), 'act-h3-v1');
    store.startSession(session);

    const result = await flushOutbox(store, '', fetch);

    expect(result).toEqual({ sent: 0, remaining: 1 });
    expect(store.snapshot().outbox).toHaveLength(1);
  });

  it('removes an item only after the server acknowledges its request id', async () => {
    const store = new StudyStore(new MemoryStorage(), 'act-h3-v1');
    store.startSession(session);
    const fetcher: typeof fetch = async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      const payload = JSON.parse(body.get('payload') ?? '{}');
      return new Response(JSON.stringify({ ok: true, requestId: payload.requestId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    expect(await flushOutbox(store, 'https://example.test/exec', fetcher)).toEqual({
      sent: 1,
      remaining: 0,
    });
  });

  it('uses one upload loop and drains records queued while it is running', async () => {
    const store = new StudyStore(new MemoryStorage(), 'act-h3-v1');
    store.startSession(session);
    const uploaded: string[] = [];
    let releaseFirst!: () => void;
    const firstRequestBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const fetcher: typeof fetch = async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      const envelope = JSON.parse(body.get('payload') ?? '{}');
      uploaded.push(envelope.requestId);
      if (uploaded.length === 1) await firstRequestBlocked;
      return new Response(JSON.stringify({ ok: true, requestId: envelope.requestId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const firstFlush = flushOutbox(store, 'https://example.test/exec', fetcher);
    await Promise.resolve();
    store.saveResponse(response);
    const joinedFlush = flushOutbox(store, 'https://example.test/exec', fetcher);
    releaseFirst();

    await Promise.all([firstFlush, joinedFlush]);
    expect(uploaded).toEqual([
      'session:session-1',
      'response:session-1:trial_001',
    ]);
    expect(store.snapshot().outbox).toHaveLength(0);
  });

  it('uploads a revised answer saved while its previous version is in flight', async () => {
    const store = new StudyStore(new MemoryStorage(), 'act-h3-v1');
    store.saveResponse(response);
    const uploadedChoices: Array<string | null> = [];
    let releaseFirst!: () => void;
    const firstRequestBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const fetcher: typeof fetch = async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      const envelope = JSON.parse(body.get('payload') ?? '{}');
      uploadedChoices.push(envelope.payload.informationChoice);
      if (uploadedChoices.length === 1) await firstRequestBlocked;
      return new Response(JSON.stringify({ ok: true, requestId: envelope.requestId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const firstFlush = flushOutbox(store, 'https://example.test/exec', fetcher);
    await Promise.resolve();
    store.saveResponse({
      ...response,
      informationChoice: 'same',
      edited: true,
      updatedAt: '2026-08-28T12:02:00.000Z',
    });
    const joinedFlush = flushOutbox(store, 'https://example.test/exec', fetcher);
    releaseFirst();

    await Promise.all([firstFlush, joinedFlush]);
    expect(uploadedChoices).toEqual(['v001a', 'same']);
    expect(store.snapshot().outbox).toHaveLength(0);
  });
});
