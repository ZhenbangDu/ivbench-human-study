import type { CuratorItem } from '../curation/types';

export type ShortlistItem = Omit<CuratorItem, 'selection'> & {
  actSource: 'repaired' | 'original';
  availability: CuratorItem['availability'] & { repairedAct: boolean };
  selection: CuratorItem['selection'] & { status: 'include' | 'needs_fix' };
};

export type ShortlistPayload = {
  items: ShortlistItem[];
  total: number;
  repairedCount: number;
  datasetFingerprint: string;
};

export type ShortlistApi = {
  fetchShortlist(): Promise<ShortlistPayload>;
};
