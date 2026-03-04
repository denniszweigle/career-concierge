export interface SyncStatus {
  isRunning: boolean;
  currentFile: string | null;
  processed: number;
  total: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export const syncStatus: SyncStatus = {
  isRunning: false,
  currentFile: null,
  processed: 0,
  total: 0,
  startedAt: null,
  finishedAt: null,
};
