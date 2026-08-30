import type { CuratorApi, CuratorPayload, SaveSelectionResponse, SelectionPatch } from './types';

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed with status ${response.status}`);
  }
  return body as T;
}

export const curatorApi: CuratorApi = {
  async fetchItems() {
    return responseJson<CuratorPayload>(await fetch('/api/items', { cache: 'no-store' }));
  },

  async saveSelection(id: string, patch: SelectionPatch) {
    return responseJson<SaveSelectionResponse>(await fetch(
      `/api/items/${encodeURIComponent(id)}/selection`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      },
    ));
  },
};
