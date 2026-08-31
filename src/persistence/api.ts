import { StudyStore, type OutboxItem } from './store';

type SyncResult = {
  sent: number;
  remaining: number;
};

type ServerReply = {
  ok: boolean;
  requestId?: string;
};

const activeFlushes = new WeakMap<StudyStore, Promise<SyncResult>>();

async function postItem(
  endpoint: string,
  item: OutboxItem,
  fetcher: typeof fetch,
): Promise<boolean> {
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ payload: JSON.stringify(item) }).toString(),
  });
  if (!response.ok) return false;
  const reply = (await response.json()) as ServerReply;
  return reply.ok === true && reply.requestId === item.requestId;
}

async function drainOutbox(
  store: StudyStore,
  endpoint: string,
  fetcher: typeof fetch,
): Promise<SyncResult> {
  let sent = 0;
  while (store.snapshot().outbox.length > 0) {
    const pending = store.snapshot().outbox;
    for (const item of pending) {
      try {
        const acknowledged = await postItem(endpoint, item, fetcher);
        if (!acknowledged) return { sent, remaining: store.snapshot().outbox.length };
        store.markSynced(item);
        sent += 1;
      } catch {
        return { sent, remaining: store.snapshot().outbox.length };
      }
    }
  }

  return { sent, remaining: store.snapshot().outbox.length };
}

export function flushOutbox(
  store: StudyStore,
  endpoint: string,
  fetcher: typeof fetch = fetch,
): Promise<SyncResult> {
  if (!endpoint.trim()) {
    return Promise.resolve({ sent: 0, remaining: store.snapshot().outbox.length });
  }

  const active = activeFlushes.get(store);
  if (active) return active;

  const flush = drainOutbox(store, endpoint, fetcher);
  activeFlushes.set(store, flush);
  void flush.then(
    () => activeFlushes.delete(store),
    () => activeFlushes.delete(store),
  );
  return flush;
}
