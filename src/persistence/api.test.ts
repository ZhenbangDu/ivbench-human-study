import { describe, expect, it } from 'vitest';
import type { ParticipantSession } from '../study/session';
import { flushOutbox } from './api';
import { StudyStore, type StorageLike } from './store';

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
});
