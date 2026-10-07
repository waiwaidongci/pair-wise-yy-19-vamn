export type GrainDirection = 'length' | 'width' | 'none';
export type PartKind = '侧板' | '顶底板' | '门板' | '背板' | '搁板' | '桌腿' | '横撑' | '抽屉件';

export type JointType = '直榫' | '燕尾榫' | '搭槽' | '圆木榫' | '饼干榫' | '45°斜接';

export interface StockSheet {
  id: string;
  name: string;
  material: string;
  length: number;
  width: number;
  thickness: number;
  price: number;
  quantity: number;
}

export interface Part {
  id: string;
  name: string;
  kind: PartKind;
  stockId: string;
  length: number;
  width: number;
  thickness: number;
  quantity: number;
  grain: GrainDirection;
  edgeBanding: string;
  notes: string;
}

export interface Joinery {
  id: string;
  partAId: string;
  partBId: string;
  type: JointType;
  count: number;
  depth: number;
  offset: number;
  notes: string;
}

export interface WoodworkingProject {
  id: string;
  name: string;
  client: string;
  sheet: string;
  kerf: number;
  trim: number;
  stocks: StockSheet[];
  parts: Part[];
  joinery: Joinery[];
  updatedAt: number;
}

export interface Placement {
  key: string;
  partId: string;
  instance: number;
  stockId: string;
  sheetIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  manual: boolean;
}

export interface SheetLayout {
  stockId: string;
  sheetIndex: number;
  stock: StockSheet;
  placements: Placement[];
  usedArea: number;
  usableArea: number;
  wasteArea: number;
}

export interface NestingResult {
  layouts: SheetLayout[];
  placements: Placement[];
  totalParts: number;
  placedParts: number;
  unplaced: Array<{ partId: string; instance: number; reason: string }>;
  usedArea: number;
  sheetArea: number;
  utilization: number;
  wasteArea: number;
  purchaseCost: number;
  sheetCount: number;
  elapsedMs: number;
  collisions: string[];
}

export interface ManualPosition {
  sheetIndex: number;
  x: number;
  y: number;
  rotated: boolean;
}

// 开料任务：发起时冻结排料版本并登记工位，签收记录按编号留存。
export interface FrozenPart {
  id: string;
  name: string;
  stockId: string;
  length: number;
  width: number;
  thickness: number;
  quantity: number;
}

export interface FrozenStock {
  id: string;
  name: string;
  material: string;
  length: number;
  width: number;
  thickness: number;
  price: number;
}

export interface FrozenPlacement {
  key: string;
  partId: string;
  instance: number;
  partName: string;
  stockId: string;
  stockName: string;
  sheetIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  nominalLength: number;
  nominalWidth: number;
  nominalThickness: number;
}

export interface SignOffRecord {
  key: string;
  partId: string;
  instance: number;
  workstation: string;
  signedAt: number;
  actualLength: number | null;
  actualWidth: number | null;
  actualThickness: number | null;
  note: string;
  contested: boolean;
}

export type CuttingTaskStatus = 'active' | 'review' | 'closed';

export interface CuttingTask {
  id: string;
  version: number;
  projectId: string;
  workstation: string;
  createdAt: number;
  frozenAt: number;
  kerf: number;
  trim: number;
  parts: FrozenPart[];
  stocks: FrozenStock[];
  placements: FrozenPlacement[];
  signOffs: Record<string, SignOffRecord>;
  status: CuttingTaskStatus;
  supersedes: string | null;
  supersededBy: string | null;
}

export interface CuttingTasksState {
  activeId: string | null;
  tasks: Record<string, CuttingTask>;
  nextVersion: number;
}

export interface QueuedSignOff {
  taskId: string;
  key: string;
  workstation: string;
  actualLength: number | null;
  actualWidth: number | null;
  actualThickness: number | null;
  note: string;
  at: number;
}

