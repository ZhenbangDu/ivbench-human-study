import type { GroundTruthConfig } from '../study/types';

export type SelectionStatus = 'unreviewed' | 'include' | 'exclude' | 'needs_fix';

export type SelectionRecord = {
  status: SelectionStatus;
  comment: string;
  updatedAt: string;
};

export type SelectionSummary = Record<SelectionStatus, number> & {
  total: number;
  target: number;
};

export type CuratorItem = {
  id: string;
  order: number;
  subtask: string;
  number: number;
  topic: string;
  videoGoal: string;
  groundTruth: GroundTruthConfig;
  availability: { act: boolean; h3: boolean; complete: boolean };
  failure: { state: string; reason: string } | null;
  media: { act: string | null; h3: string | null };
  selection: SelectionRecord;
};

export type CuratorPayload = {
  items: CuratorItem[];
  summary: SelectionSummary;
  datasetFingerprint: string;
};

export type SelectionPatch = Partial<Pick<SelectionRecord, 'status' | 'comment'>>;

export type SaveSelectionResponse = {
  id: string;
  selection: SelectionRecord;
  summary: SelectionSummary;
};

export type CuratorApi = {
  fetchItems(): Promise<CuratorPayload>;
  saveSelection(id: string, patch: SelectionPatch): Promise<SaveSelectionResponse>;
};
