import type { ShortlistApi, ShortlistItem, ShortlistPayload } from './types';

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? `Request failed with status ${response.status}`);
  return body as T;
}

export const shortlistApi: ShortlistApi = {
  async fetchShortlist() {
    return responseJson<ShortlistPayload>(await fetch('/api/shortlist', { cache: 'no-store' }));
  },

  async saveComment(id: string, comment: string) {
    const response = await responseJson<{ selection: ShortlistItem['selection'] }>(await fetch(
      `/api/items/${encodeURIComponent(id)}/selection`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ comment }),
      },
    ));
    return response.selection;
  },
};
