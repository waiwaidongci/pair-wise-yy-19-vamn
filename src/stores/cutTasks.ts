import { atom } from 'jotai';
import type { CutSignoff, CutTaskState } from '../types/woodworking';
import {
  buildInitialState,
  loadCutTaskState,
  persistCutTaskState,
  recoverFromFailure,
  reduceCutTasks,
  taskProgress,
  type CutTaskAction,
} from '../utils/cutTasks';

const initialState = loadCutTaskState() ?? buildInitialState();
let lastPersisted: CutTaskState = initialState;

const baseAtom = atom<CutTaskState>(initialState);

export const cutTasksAtom = atom((get) => get(baseAtom));

export const activeTaskAtom = atom(
  (get) => get(baseAtom).tasks.find((task) => task.status === 'active') ?? null,
);

export const activeTaskProgressAtom = atom((get) => {
  const task = get(activeTaskAtom);
  return task ? taskProgress(task) : null;
});

export const reviewLogAtom = atom((get) => get(baseAtom).reviewLog);

export const taskHistoryAtom = atom((get) =>
  get(baseAtom)
    .tasks.filter((task) => task.status !== 'active')
    .sort((a, b) => b.seq - a.seq),
);

export const heldSignoffsAtom = atom((get) => get(baseAtom).held);

/** 保存失败待重放的签收记录，重放按记录 id 去重，不会重复入库 */
export const replayQueueAtom = atom<CutSignoff[]>([]);

export const cutTaskNoticeAtom = atom<string | null>(null);

export interface DispatchOutcome {
  accepted: CutSignoff[];
  held: CutSignoff[];
  persisted: boolean;
}

export const dispatchCutTaskAtom = atom(
  null,
  (get, set, action: CutTaskAction): DispatchOutcome => {
    const prev = get(baseAtom);
    const { next, accepted, held, changed } = reduceCutTasks(prev, action);
    if (!changed) return { accepted, held, persisted: true };

    try {
      persistCutTaskState(next);
      lastPersisted = next;
      set(baseAtom, next);
    } catch {
      const recovered = recoverFromFailure(lastPersisted);
      try {
        persistCutTaskState(recovered);
      } catch {
        /* 存储仍不可用，保留内存中的恢复结果 */
      }
      // 恢复点之后被回滚的签收连同本次失败的记录一起进入重放队列
      const recoveredIds = new Set(recovered.tasks.flatMap((task) => task.signoffs.map((s) => s.id)));
      const wiped = lastPersisted.tasks
        .flatMap((task) => task.signoffs)
        .filter((record) => !recoveredIds.has(record.id));
      const toReplay = action.type === 'sign' ? [...wiped, ...action.records] : wiped;
      lastPersisted = recovered;
      set(baseAtom, recovered);
      if (toReplay.length > 0) {
        set(replayQueueAtom, (queue) => {
          const ids = new Set(queue.map((record) => record.id));
          return [...queue, ...toReplay.filter((record) => !ids.has(record.id))];
        });
      }
      set(cutTaskNoticeAtom, '本地保存失败，已恢复到最近完成的任务；未保存的签收已放入重放队列。');
      return { accepted: [], held: [], persisted: false };
    }

    if (action.type === 'sign') {
      const active = next.tasks.find((task) => task.status === 'active');
      const stored = new Set(active?.signoffs.map((record) => record.id) ?? []);
      const heldIds = new Set(next.held.map((record) => record.id));
      set(replayQueueAtom, (queue) =>
        queue.filter((record) => !stored.has(record.id) && !heldIds.has(record.id)),
      );
    }
    if (action.type === 'initiate') set(replayQueueAtom, []);
    return { accepted, held, persisted: true };
  },
);
