import { atom } from 'jotai';
import type { Getter, Setter } from 'jotai';
import type {
  CuttingTasksState,
  QueuedSignOff,
} from '../types/woodworking';
import { nestingResultAtom, projectAtom } from './project';
import {
  createCuttingTask,
  createLegacyTask,
  isTaskStale,
  markContested,
  replaySignOffs,
  signOff,
  taskProgress,
} from '../utils/cuttingTask';
import type { SignOffInput } from '../utils/cuttingTask';
import {
  EMPTY_TASKS_STATE,
  isSimulatingStorageFailure,
  loadQueue,
  loadTasksState,
  recoverTasksState,
  saveQueue,
  saveTasksState,
  setSimulateStorageFailure,
} from '../utils/persistence';

export const cuttingTasksAtom = atom<CuttingTasksState>(loadTasksState());
export const signOffQueueAtom = atom<QueuedSignOff[]>(loadQueue());
export const saveStatusAtom = atom<'saved' | 'error'>('saved');
export const recoverNoticeAtom = atom<string | null>(null);
export const conflictNoticeAtom = atom<string | null>(null);
export const simulateFailureAtom = atom<boolean>(isSimulatingStorageFailure());

export const activeTaskAtom = atom((get) => {
  const state = get(cuttingTasksAtom);
  return state.activeId ? state.tasks[state.activeId] ?? null : null;
});

export const activeTaskProgressAtom = atom((get) => taskProgress(get(activeTaskAtom)));

export const activeTaskStaleAtom = atom((get) => {
  const task = get(activeTaskAtom);
  const project = get(projectAtom);
  return task ? isTaskStale(task, project) : false;
});

function persist(get: Getter, set: Setter, next: CuttingTasksState) {
  set(cuttingTasksAtom, next);
  const result = saveTasksState(next);
  set(saveStatusAtom, result.ok ? 'saved' : 'error');
  return result;
}

// 旧项目升级：没有任务记录时补成首版。
export const ensureTaskAtom = atom(null, (get, set) => {
  const state = get(cuttingTasksAtom);
  if (state.activeId) return;
  const project = get(projectAtom);
  const result = get(nestingResultAtom);
  const task = createLegacyTask(project, result);
  const next: CuttingTasksState = {
    activeId: task.id,
    tasks: { [task.id]: task },
    nextVersion: 2,
  };
  persist(get, set, next);
});

// 发起开料任务：冻结当前排料版本并登记工位；旧任务转入复核，已切记录保留。
export const initiateTaskAtom = atom(null, (get, set, workstation: string) => {
  const state = get(cuttingTasksAtom);
  const project = get(projectAtom);
  const result = get(nestingResultAtom);
  const current = state.activeId ? state.tasks[state.activeId] ?? null : null;
  const version = state.nextVersion;
  const task = createCuttingTask(project, result, workstation, version, current?.id ?? null);
  const next: CuttingTasksState = {
    activeId: task.id,
    tasks: {
      ...state.tasks,
      ...(current
        ? { [current.id]: { ...current, status: 'review' as const, supersededBy: task.id } }
        : {}),
      [task.id]: task,
    },
    nextVersion: version + 1,
  };
  const saveResult = persist(get, set, next);
  if (!saveResult.ok) {
    set(recoverNoticeAtom, '本地保存失败，任务仅保留在当前会话中；可从最近完成任务恢复。');
  } else {
    set(recoverNoticeAtom, null);
  }
});

export interface SignOffPayload extends SignOffInput {
  key: string;
}

// 按编号签收；重签只留第一次及原工位，后到者保留现场值但不改写已签结果。
export const signOffPartAtom = atom(null, (get, set, payload: SignOffPayload) => {
  const state = get(cuttingTasksAtom);
  const activeId = state.activeId;
  if (!activeId) return;
  const task = state.tasks[activeId];
  if (!task) return;
  const project = get(projectAtom);
  if (isTaskStale(task, project)) {
    set(recoverNoticeAtom, '尺寸或板材参数已变更，未完成签收已失效；已切记录保留到复核，请发起新版任务。');
    return;
  }

  const { task: updated, conflict } = signOff(task, payload.key, {
    workstation: payload.workstation,
    actualLength: payload.actualLength,
    actualWidth: payload.actualWidth,
    actualThickness: payload.actualThickness,
    note: payload.note,
  });

  let finalTask = updated;
  if (conflict) {
    finalTask = markContested(task, payload.key);
    const first = task.signOffs[payload.key];
    set(
      conflictNoticeAtom,
      `该件已由${first?.workstation ?? '其他工位'}于${first ? new Date(first.signedAt).toLocaleTimeString() : ''}签收，您的现场值已保留但未覆盖。`,
    );
  }

  const next: CuttingTasksState = {
    ...state,
    tasks: { ...state.tasks, [activeId]: finalTask },
  };
  const saveResult = persist(get, set, next);
  if (!saveResult.ok) {
    const queue = get(signOffQueueAtom) as QueuedSignOff[];
    const entry: QueuedSignOff = {
      taskId: activeId,
      key: payload.key,
      workstation: payload.workstation,
      actualLength: payload.actualLength,
      actualWidth: payload.actualWidth,
      actualThickness: payload.actualThickness,
      note: payload.note,
      at: Date.now(),
    };
    const nextQueue = [...queue, entry];
    set(signOffQueueAtom, nextQueue);
    saveQueue(nextQueue);
    set(recoverNoticeAtom, '本地保存失败，签收已暂存；恢复时将重放且不会重复入库。');
  }
});

// 从最近完成任务恢复，并重放暂存签收（按编号去重，不重复入库）。
export const recoverTasksAtom = atom(null, (get, set) => {
  const { state, source } = recoverTasksState();
  const queue = loadQueue();
  const tasks = { ...state.tasks };
  let replayed = 0;
  for (const taskId of Object.keys(tasks)) {
    const result = replaySignOffs(tasks[taskId], queue);
    tasks[taskId] = result.task;
    replayed += result.replayed;
  }
  const next: CuttingTasksState = { ...state, tasks };
  set(cuttingTasksAtom, next);
  saveTasksState(next);
  saveQueue([]);
  set(signOffQueueAtom, []);
  set(saveStatusAtom, 'saved');
  set(recoverNoticeAtom, `已从最近完成任务恢复（${source}），重放 ${replayed} 条签收，无重复入库。`);
});

export const setSimulateFailureAtom = atom(null, (get, set, value: boolean) => {
  setSimulateStorageFailure(value);
  set(simulateFailureAtom, value);
  if (!value) {
    const state = get(cuttingTasksAtom) as CuttingTasksState;
    saveTasksState(state);
    set(saveStatusAtom, 'saved');
  } else {
    set(saveStatusAtom, 'error');
  }
});

export const dismissNoticeAtom = atom(null, (get, set) => {
  set(recoverNoticeAtom, null);
  set(conflictNoticeAtom, null);
});

export { EMPTY_TASKS_STATE };
