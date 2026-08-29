import { StudyStore, type OutboxItem } from './store';

type SyncResult = {
  sent: number;
  remaining: number;
};

type ServerReply = {
  ok: boolean;
  requestId?: string;
};

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

export async function flushOutbox(
  store: StudyStore,
  endpoint: string,
  fetcher: typeof fetch = fetch,
): Promise<SyncResult> {
  if (!endpoint.trim()) {
    return { sent: 0, remaining: store.snapshot().outbox.length };
  }

  let sent = 0;
  for (const item of store.snapshot().outbox) {
    try {
      const acknowledged = await postItem(endpoint, item, fetcher);
      if (!acknowledged) break;
      store.markSynced(item.requestId);
      sent += 1;
    } catch {
      break;
    }
  }

  return { sent, remaining: store.snapshot().outbox.length };
}
