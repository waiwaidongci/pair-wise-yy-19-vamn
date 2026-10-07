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

/** 开料签收记录：id 用于重放去重，pieceKey 用于同一任务内首次签收优先 */
export interface CutSignoff {
  id: string;
  pieceKey: string;
  pieceNo: string;
  partName: string;
  workstation: string;
  signedAt: number;
  stockName: string;
  sheetIndex: number;
  length: number;
  width: number;
  thickness: number;
}

/** 发起任务时冻结的排料版本 */
export interface CutTaskSnapshot {
  fingerprint: string;
  kerf: number;
  trim: number;
  parts: Part[];
  stocks: StockSheet[];
  placements: Placement[];
  unplaced: Array<{ partId: string; instance: number; reason: string }>;
}

export type CutTaskStatus = 'active' | 'completed' | 'archived';

export interface CutTask {
  id: string;
  seq: number;
  code: string;
  workstation: string;
  createdAt: number;
  completedAt: number | null;
  status: CutTaskStatus;
  snapshot: CutTaskSnapshot;
  signoffs: CutSignoff[];
}

/** 尺寸变更前的已切记录，保留到复核，不计入当前清单 */
export interface ReviewRecord extends CutSignoff {
  taskSeq: number;
  taskCode: string;
  invalidatedAt: number;
  reviewed: boolean;
}

export interface CutTaskState {
  tasks: CutTask[];
  reviewLog: ReviewRecord[];
  /** 后到提交的现场值，未入库 */
  held: CutSignoff[];
}

/** 页面与导出共用的同一份进度记录 */
export interface TaskProgress {
  required: number;
  placed: number;
  cut: number;
  pending: number;
  diff: number;
}

