import type {
  CutSignoff,
  CutTask,
  CutTaskState,
  ManualPosition,
  NestingResult,
  Part,
  Placement,
  ReviewRecord,
  StockSheet,
  TaskProgress,
  WoodworkingProject,
} from '../types/woodworking';
import { nestProject } from './nesting';
import { createId, createInitialProject } from './project';

export const CUT_TASK_STORAGE_KEY = 'joinery-nest:cut-tasks';
const PROJECT_STORAGE_KEY = 'joinery-nest:project';
const MANUAL_STORAGE_KEY = 'joinery-nest:manual';

export const taskCode = (seq: number) => `KL-${String(seq).padStart(3, '0')}`;

/** 仅覆盖会影响开料的参数：零件尺寸/数量/纹理/归属板材、板材规格、锯缝与修边 */
export function projectFingerprint(project: WoodworkingProject): string {
  const payload = JSON.stringify({
    kerf: project.kerf,
    trim: project.trim,
    parts: project.parts.map((part) => [
      part.id,
      part.stockId,
      part.length,
      part.width,
      part.thickness,
      part.quantity,
      part.grain,
    ]),
    stocks: project.stocks.map((stock) => [stock.id, stock.length, stock.width, stock.thickness]),
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export interface TaskPiece {
  no: string;
  key: string;
  placement: Placement;
  part: Part | undefined;
  stock: StockSheet | undefined;
}

/** 任务内零件编号：按板材、张序、坐标排序，同一冻结版本内编号稳定 */
export function taskPieces(task: CutTask): TaskPiece[] {
  const partById = new Map(task.snapshot.parts.map((part) => [part.id, part]));
  const stockById = new Map(task.snapshot.stocks.map((stock) => [stock.id, stock]));
  return [...task.snapshot.placements]
    .sort(
      (a, b) =>
        a.stockId.localeCompare(b.stockId) ||
        a.sheetIndex - b.sheetIndex ||
        a.y - b.y ||
        a.x - b.x,
    )
    .map((placement, index) => ({
      no: String(index + 1).padStart(3, '0'),
      key: placement.key,
      placement,
      part: partById.get(placement.partId),
      stock: stockById.get(placement.stockId),
    }));
}

export function buildSignoff(task: CutTask, piece: TaskPiece, workstation: string, now = Date.now()): CutSignoff {
  return {
    id: createId('cut'),
    pieceKey: piece.key,
    pieceNo: piece.no,
    partName: piece.part?.name ?? piece.key,
    workstation: workstation.trim() || task.workstation,
    signedAt: now,
    stockName: piece.stock?.name ?? '',
    sheetIndex: piece.placement.sheetIndex,
    length: piece.placement.width,
    width: piece.placement.height,
    thickness: piece.part?.thickness ?? 0,
  };
}

/**
 * 签收合并（幂等）：
 * - 记录 id 已入库 → 重放，跳过；
 * - 同一件已有签收 → 保留第一次及原工位，后到者转入现场暂存；
 * - 不属于本任务冻结版本的件 → 现场暂存，不入库。
 */
export function mergeSignoffs(
  task: CutTask,
  incoming: CutSignoff[],
): { signoffs: CutSignoff[]; accepted: CutSignoff[]; held: CutSignoff[] } {
  const validKeys = new Set(task.snapshot.placements.map((placement) => placement.key));
  const byId = new Set(task.signoffs.map((record) => record.id));
  const byKey = new Set(task.signoffs.map((record) => record.pieceKey));
  const signoffs = [...task.signoffs];
  const accepted: CutSignoff[] = [];
  const held: CutSignoff[] = [];

  for (const record of incoming) {
    if (!validKeys.has(record.pieceKey)) {
      held.push(record);
      continue;
    }
    if (byId.has(record.id)) continue;
    if (byKey.has(record.pieceKey)) {
      held.push(record);
      continue;
    }
    byId.add(record.id);
    byKey.add(record.pieceKey);
    signoffs.push(record);
    accepted.push(record);
  }
  return { signoffs, accepted, held };
}

/** 已切、待切、差异的唯一口径，页面与导出共用 */
export function taskProgress(task: CutTask): TaskProgress {
  const required = task.snapshot.parts.reduce((sum, part) => sum + Math.max(1, part.quantity), 0);
  const placed = task.snapshot.placements.length;
  const cut = task.signoffs.length;
  return {
    required,
    placed,
    cut,
    pending: placed - cut,
    diff: Math.max(0, required - placed),
  };
}

function archiveTask(task: CutTask, now: number): { task: CutTask; records: ReviewRecord[] } {
  return {
    task: { ...task, status: 'archived' },
    records: task.signoffs.map((record) => ({
      ...record,
      taskSeq: task.seq,
      taskCode: task.code,
      invalidatedAt: now,
      reviewed: false,
    })),
  };
}

export function createCutTask(
  project: WoodworkingProject,
  result: NestingResult,
  workstation: string,
  seq: number,
  now = Date.now(),
): CutTask {
  return {
    id: createId('task'),
    seq,
    code: taskCode(seq),
    workstation: workstation.trim() || '未登记工位',
    createdAt: now,
    completedAt: null,
    status: 'active',
    snapshot: {
      fingerprint: projectFingerprint(project),
      kerf: project.kerf,
      trim: project.trim,
      parts: structuredClone(project.parts),
      stocks: structuredClone(project.stocks),
      placements: structuredClone(result.placements),
      unplaced: structuredClone(result.unplaced),
    },
    signoffs: [],
  };
}

export type CutTaskAction =
  | { type: 'initiate'; project: WoodworkingProject; result: NestingResult; workstation: string }
  | { type: 'sign'; records: CutSignoff[] }
  | { type: 'complete' }
  | { type: 'sync-fingerprint'; fingerprint: string }
  | { type: 'review'; ids: string[] }
  | { type: 'clear-held' };

export interface ReduceResult {
  next: CutTaskState;
  accepted: CutSignoff[];
  held: CutSignoff[];
  changed: boolean;
}

const unchanged = (state: CutTaskState): ReduceResult => ({
  next: state,
  accepted: [],
  held: [],
  changed: false,
});

export function reduceCutTasks(state: CutTaskState, action: CutTaskAction, now = Date.now()): ReduceResult {
  switch (action.type) {
    case 'sync-fingerprint': {
      const active = state.tasks.find((task) => task.status === 'active');
      if (!active || active.snapshot.fingerprint === action.fingerprint) return unchanged(state);
      // 零件尺寸或板材参数已变化：未完成签收随任务失效，已切记录保留到复核
      const archived = archiveTask(active, now);
      return {
        next: {
          tasks: state.tasks.map((task) => (task.id === active.id ? archived.task : task)),
          reviewLog: [...state.reviewLog, ...archived.records],
          held: [],
        },
        accepted: [],
        held: [],
        changed: true,
      };
    }

    case 'initiate': {
      const fingerprint = projectFingerprint(action.project);
      let tasks = state.tasks;
      let reviewLog = state.reviewLog;
      const active = tasks.find((task) => task.status === 'active');
      if (active) {
        if (active.snapshot.fingerprint === fingerprint) return unchanged(state);
        const archived = archiveTask(active, now);
        tasks = tasks.map((task) => (task.id === active.id ? archived.task : task));
        reviewLog = [...reviewLog, ...archived.records];
      }
      const seq = Math.max(0, ...tasks.map((task) => task.seq)) + 1;
      const task = createCutTask(action.project, action.result, action.workstation, seq, now);
      return {
        next: { tasks: [...tasks, task], reviewLog, held: [] },
        accepted: [],
        held: [],
        changed: true,
      };
    }

    case 'sign': {
      const active = state.tasks.find((task) => task.status === 'active');
      if (!active) return { next: state, accepted: [], held: action.records, changed: false };
      const { signoffs, accepted, held } = mergeSignoffs(active, action.records);
      if (accepted.length === 0 && held.length === 0) return unchanged(state);
      const heldIds = new Set(state.held.map((record) => record.id));
      return {
        next: {
          ...state,
          tasks: state.tasks.map((task) => (task.id === active.id ? { ...active, signoffs } : task)),
          held: [...state.held, ...held.filter((record) => !heldIds.has(record.id))],
        },
        accepted,
        held,
        changed: true,
      };
    }

    case 'complete': {
      const active = state.tasks.find((task) => task.status === 'active');
      if (!active || taskProgress(active).pending > 0) return unchanged(state);
      return {
        next: {
          ...state,
          tasks: state.tasks.map((task) =>
            task.id === active.id ? { ...active, status: 'completed', completedAt: now } : task,
          ),
          held: [],
        },
        accepted: [],
        held: [],
        changed: true,
      };
    }

    case 'review': {
      const ids = new Set(action.ids);
      if (!state.reviewLog.some((record) => ids.has(record.id) && !record.reviewed)) {
        return unchanged(state);
      }
      return {
        next: {
          ...state,
          reviewLog: state.reviewLog.map((record) =>
            ids.has(record.id) ? { ...record, reviewed: true } : record,
          ),
        },
        accepted: [],
        held: [],
        changed: true,
      };
    }

    case 'clear-held': {
      if (state.held.length === 0) return unchanged(state);
      return { next: { ...state, held: [] }, accepted: [], held: [], changed: true };
    }

    default:
      return unchanged(state);
  }
}

/** 本地保存失败后的恢复点：回退到最近完成的任务，之后未落库的进度交给重放队列 */
export function recoverFromFailure(state: CutTaskState): CutTaskState {
  const lastCompletedIndex = state.tasks.reduce(
    (index, task, current) => (task.status === 'completed' ? current : index),
    -1,
  );
  if (lastCompletedIndex >= 0) {
    return { ...state, tasks: state.tasks.slice(0, lastCompletedIndex + 1), held: [] };
  }
  if (state.tasks.length > 0) {
    const [first] = state.tasks;
    return {
      ...state,
      tasks: [{ ...first, status: 'active', completedAt: null, signoffs: [] }],
      held: [],
    };
  }
  return state;
}

function readStoredJson<T>(key: string, validate: (value: unknown) => value is T): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const isProject = (value: unknown): value is WoodworkingProject =>
  !!value &&
  Array.isArray((value as WoodworkingProject).parts) &&
  Array.isArray((value as WoodworkingProject).stocks);

const isManualPositions = (value: unknown): value is Record<string, ManualPosition> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isCutTaskState = (value: unknown): value is CutTaskState =>
  !!value &&
  Array.isArray((value as CutTaskState).tasks) &&
  Array.isArray((value as CutTaskState).reviewLog);

export function loadCutTaskState(): CutTaskState | null {
  const state = readStoredJson(CUT_TASK_STORAGE_KEY, isCutTaskState);
  if (!state) return null;
  return { ...state, held: Array.isArray(state.held) ? state.held : [] };
}

export function persistCutTaskState(state: CutTaskState) {
  localStorage.setItem(CUT_TASK_STORAGE_KEY, JSON.stringify(state));
}

/** 旧项目没有任务编号：升级时按当前排料补录为首版任务 */
export function buildInitialState(): CutTaskState {
  const project = readStoredJson(PROJECT_STORAGE_KEY, isProject) ?? createInitialProject();
  const manual = readStoredJson(MANUAL_STORAGE_KEY, isManualPositions) ?? {};
  const result = nestProject(project, manual);
  return {
    tasks: [createCutTask(project, result, '默认工位', 1)],
    reviewLog: [],
    held: [],
  };
}
