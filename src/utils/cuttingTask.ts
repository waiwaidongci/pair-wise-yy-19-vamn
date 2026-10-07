import type {
  CuttingTask,
  FrozenPart,
  FrozenPlacement,
  FrozenStock,
  NestingResult,
  Part,
  QueuedSignOff,
  SignOffRecord,
  StockSheet,
  WoodworkingProject,
} from '../types/woodworking';
import { createId } from './project';

export const VARIANCE_TOLERANCE_MM = 0.5;

export function createTaskId() {
  return createId('task');
}

function freezeParts(parts: Part[]): FrozenPart[] {
  return parts.map((part) => ({
    id: part.id,
    name: part.name,
    stockId: part.stockId,
    length: part.length,
    width: part.width,
    thickness: part.thickness,
    quantity: part.quantity,
  }));
}

function freezeStocks(stocks: StockSheet[]): FrozenStock[] {
  return stocks.map((stock) => ({
    id: stock.id,
    name: stock.name,
    material: stock.material,
    length: stock.length,
    width: stock.width,
    thickness: stock.thickness,
    price: stock.price,
  }));
}

function freezePlacements(project: WoodworkingProject, result: NestingResult): FrozenPlacement[] {
  const partById = new Map(project.parts.map((part) => [part.id, part]));
  const stockById = new Map(project.stocks.map((stock) => [stock.id, stock]));
  return result.placements.map((placement) => {
    const part = partById.get(placement.partId);
    const stock = stockById.get(placement.stockId);
    return {
      key: placement.key,
      partId: placement.partId,
      instance: placement.instance,
      partName: part?.name ?? placement.partId,
      stockId: placement.stockId,
      stockName: stock?.name ?? placement.stockId,
      sheetIndex: placement.sheetIndex,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      rotated: placement.rotated,
      nominalLength: part?.length ?? 0,
      nominalWidth: part?.width ?? 0,
      nominalThickness: part?.thickness ?? 0,
    };
  });
}

export function createCuttingTask(
  project: WoodworkingProject,
  result: NestingResult,
  workstation: string,
  version: number,
  supersedes: string | null,
): CuttingTask {
  const now = Date.now();
  return {
    id: createTaskId(),
    version,
    projectId: project.id,
    workstation: workstation.trim() || '一工位',
    createdAt: now,
    frozenAt: now,
    kerf: project.kerf,
    trim: project.trim,
    parts: freezeParts(project.parts),
    stocks: freezeStocks(project.stocks),
    placements: freezePlacements(project, result),
    signOffs: {},
    status: 'active',
    supersedes,
    supersededBy: null,
  };
}

// 旧项目没有任务编号，升级时补成首版。
export function createLegacyTask(project: WoodworkingProject, result: NestingResult): CuttingTask {
  return createCuttingTask(project, result, '一工位', 1, null);
}

function partSignature(part: FrozenPart) {
  return [part.length, part.width, part.thickness, part.quantity, part.stockId].join('|');
}

function stockSignature(stock: FrozenStock) {
  return [stock.length, stock.width, stock.thickness].join('|');
}

// 零件尺寸或板材参数（含锯缝、修边）相对冻结版本发生变化时，任务失效。
export function isTaskStale(task: CuttingTask, project: WoodworkingProject): boolean {
  if (task.kerf !== project.kerf || task.trim !== project.trim) return true;
  const currentParts = new Map(project.parts.map((part) => [part.id, part]));
  if (task.parts.length !== project.parts.length) return true;
  for (const frozen of task.parts) {
    const current = currentParts.get(frozen.id);
    if (!current) return true;
    if (partSignature(frozen) !== partSignature({ ...frozen, ...current })) return true;
  }
  const currentStocks = new Map(project.stocks.map((stock) => [stock.id, stock]));
  if (task.stocks.length !== project.stocks.length) return true;
  for (const frozen of task.stocks) {
    const current = currentStocks.get(frozen.id);
    if (!current) return true;
    if (stockSignature(frozen) !== stockSignature({ ...frozen, ...current })) return true;
  }
  return false;
}

export interface SignOffInput {
  workstation: string;
  actualLength: number | null;
  actualWidth: number | null;
  actualThickness: number | null;
  note: string;
}

export interface SignOffResult {
  task: CuttingTask;
  conflict: boolean;
}

// 每块零件按编号签收；同一任务重签只留第一次及原工位，后到者保留现场值但不改写已签结果。
export function signOff(task: CuttingTask, key: string, input: SignOffInput): SignOffResult {
  const existing = task.signOffs[key];
  if (existing) {
    return { task, conflict: true };
  }
  const placement = task.placements.find((item) => item.key === key);
  if (!placement) {
    return { task, conflict: false };
  }
  const record: SignOffRecord = {
    key,
    partId: placement.partId,
    instance: placement.instance,
    workstation: input.workstation.trim() || task.workstation,
    signedAt: Date.now(),
    actualLength: input.actualLength,
    actualWidth: input.actualWidth,
    actualThickness: input.actualThickness,
    note: input.note.trim(),
    contested: false,
  };
  return {
    task: { ...task, signOffs: { ...task.signOffs, [key]: record } },
    conflict: false,
  };
}

// 标记某块零件曾有后续工位尝试覆盖（保留现场值但未改写）。
export function markContested(task: CuttingTask, key: string): CuttingTask {
  const existing = task.signOffs[key];
  if (!existing || existing.contested) return task;
  return {
    ...task,
    signOffs: { ...task.signOffs, [key]: { ...existing, contested: true } },
  };
}

function hasVariance(record: SignOffRecord, placement: FrozenPlacement): boolean {
  if (record.contested) return true;
  const checks: Array<[number | null, number]> = [
    [record.actualLength, placement.nominalLength],
    [record.actualWidth, placement.nominalWidth],
    [record.actualThickness, placement.nominalThickness],
  ];
  return checks.some(([actual, nominal]) => actual !== null && Math.abs(actual - nominal) > VARIANCE_TOLERANCE_MM);
}

export interface TaskProgress {
  total: number;
  cut: number;
  pending: number;
  variance: number;
  varianceKeys: string[];
}

// 页面和导出共用同一份已切、待切、差异记录。
export function taskProgress(task: CuttingTask | null | undefined): TaskProgress {
  if (!task) {
    return { total: 0, cut: 0, pending: 0, variance: 0, varianceKeys: [] };
  }
  const total = task.placements.length;
  const records = Object.values(task.signOffs);
  const varianceKeys = records
    .filter((record) => {
      const placement = task.placements.find((item) => item.key === record.key);
      return placement ? hasVariance(record, placement) : false;
    })
    .map((record) => record.key);
  return {
    total,
    cut: records.length,
    pending: Math.max(0, total - records.length),
    variance: varianceKeys.length,
    varianceKeys,
  };
}

// 重放签收队列：按编号去重，已签收的不再重复入库。
export function replaySignOffs(
  task: CuttingTask,
  queue: QueuedSignOff[],
): { task: CuttingTask; replayed: number } {
  let current = task;
  let replayed = 0;
  for (const entry of queue) {
    if (entry.taskId !== task.id) continue;
    if (current.signOffs[entry.key]) continue;
    const result = signOff(current, entry.key, {
      workstation: entry.workstation,
      actualLength: entry.actualLength,
      actualWidth: entry.actualWidth,
      actualThickness: entry.actualThickness,
      note: entry.note,
    });
    if (result.conflict) continue;
    current = result.task;
    replayed += 1;
  }
  return { task: current, replayed };
}

export function formatTaskTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
