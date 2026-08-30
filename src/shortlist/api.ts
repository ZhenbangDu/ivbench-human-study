import type { ShortlistApi, ShortlistPayload } from './types';

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? `Request failed with status ${response.status}`);
  return body as T;
}

export const shortlistApi: ShortlistApi = {
  async fetchShortlist() {
    return responseJson<ShortlistPayload>(await fetch('/api/shortlist', { cache: 'no-store' }));
  },
};
