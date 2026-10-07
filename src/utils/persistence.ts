import type { CuttingTasksState, QueuedSignOff } from '../types/woodworking';

const PRIMARY_KEY = 'joinery-nest:cutting-tasks';
const BACKUP_KEY = 'joinery-nest:cutting-tasks:backup';
const QUEUE_KEY = 'joinery-nest:cutting-tasks:queue';

export const EMPTY_TASKS_STATE: CuttingTasksState = {
  activeId: null,
  tasks: {},
  nextVersion: 1,
};

// 最近一次成功写入的内存快照，作为本地存储失败后的恢复兜底。
let lastGoodSnapshot: CuttingTasksState = EMPTY_TASKS_STATE;
// 签收队列的内存兜底：本地存储失败时仍保留待重放的签收，恢复时不丢条。
let memoryQueue: QueuedSignOff[] = [];
let simulateFailure = false;

export function setSimulateStorageFailure(value: boolean) {
  simulateFailure = value;
}

export function isSimulatingStorageFailure() {
  return simulateFailure;
}

function readStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): boolean {
  if (simulateFailure) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isValidState(value: unknown): value is CuttingTasksState {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as CuttingTasksState).nextVersion === 'number' &&
    typeof (value as CuttingTasksState).tasks === 'object' &&
    (value as CuttingTasksState).tasks !== null
  );
}

export function loadTasksState(): CuttingTasksState {
  const primary = readStorage(PRIMARY_KEY);
  if (isValidState(primary)) {
    lastGoodSnapshot = primary;
    return primary;
  }
  const backup = readStorage(BACKUP_KEY);
  if (isValidState(backup)) {
    lastGoodSnapshot = backup;
    return backup;
  }
  return EMPTY_TASKS_STATE;
}

export interface SaveResult {
  ok: boolean;
  recoveredFromBackup: boolean;
}

// 保存到主存储，同时写一份备份；任一失败都返回失败，交由上层走恢复流程。
export function saveTasksState(state: CuttingTasksState): SaveResult {
  const primaryOk = writeStorage(PRIMARY_KEY, state);
  const backupOk = writeStorage(BACKUP_KEY, state);
  if (primaryOk && backupOk) {
    lastGoodSnapshot = state;
    return { ok: true, recoveredFromBackup: false };
  }
  return { ok: false, recoveredFromBackup: false };
}

export function loadQueue(): QueuedSignOff[] {
  const raw = readStorage(QUEUE_KEY);
  const stored = Array.isArray(raw) ? (raw as QueuedSignOff[]) : [];
  // 以内存队列为主、本地存储为辅，按 (taskId, key, at) 去重，保证重放不丢条、不重复。
  const seen = new Set<string>();
  const merged: QueuedSignOff[] = [];
  for (const entry of [...memoryQueue, ...stored]) {
    const dedupeKey = `${entry.taskId}|${entry.key}|${entry.at}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    merged.push(entry);
  }
  memoryQueue = merged;
  return merged;
}

export function saveQueue(queue: QueuedSignOff[]): boolean {
  memoryQueue = queue;
  return writeStorage(QUEUE_KEY, queue);
}

// 从最近完成的任务快照恢复：优先备份键，其次内存兜底。
export function recoverTasksState(): { state: CuttingTasksState; source: 'backup' | 'memory' | 'empty' } {
  const backup = readStorage(BACKUP_KEY);
  if (isValidState(backup)) {
    lastGoodSnapshot = backup;
    return { state: backup, source: 'backup' };
  }
  if (isValidState(lastGoodSnapshot) && lastGoodSnapshot !== EMPTY_TASKS_STATE) {
    return { state: lastGoodSnapshot, source: 'memory' };
  }
  return { state: EMPTY_TASKS_STATE, source: 'empty' };
}
