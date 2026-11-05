export interface OrderRow {
  Id: number;
  OwnNumber: string | null;
  Description: string | null;
  CompanyName: string | null;
  FormName: string | null;
  Type: number | null;
  TypeStr: string | null;
  State: number;
  OptimizeState: number | null;
  OnlineState: number | null;
  OnlineOrderId: number | null;
  DateGeneration: string | null;
  DateExecution: string | null;
  /** Ostatnia modyfikacja rekordu Orders (m.in. przyrost ProductionPrc). */
  DateMod?: string | null;
  /** GREATEST(DateMod, max Productions.DateAdd) — aktywność produkcji. */
  LastActivityAt?: string | null;
  ProductionPrc: string | number | null;
  IsGroupOrder: number | null;
  IdParent: number | null;
  PriorityStr: string | null;
  MaterialsSymbols: string | null;
  FlagState: number | null;
  /** 0 = jeszcze nie wydane/dostarczone; 1 = dostarczono / wydano. */
  FlagOut?: number | null;
  JobCutFlag: number | null;
  JobCutNumber: number | null;
  MaterialsGroupFlag: number | null;
  MaterialsGroupNumber: number | null;
  ExportCutFlag: number | null;
  ExportCutNumber: number | null;
  CNCCnt: number | null;
  '3DGenerateCNCFiles': number | null;
}

export interface ProductionSocket {
  Id: number;
  OrderId: number;
  ProductionId: number;
  OrderIndex: number;
  Symbol: string | null;
  Description: string | null;
  ProductionPercent: number | string | null;
  IncludePercentSummary: number;
  TimeStart: string | null;
  TimeStop: string | null;
}

export interface OrderDetailResponse {
  success: boolean;
  order: OrderRow;
  group: OrderRow[];
  productions: Array<Record<string, unknown>>;
  sockets: ProductionSocket[];
  error?: string;
}

export interface OrdersResponse {
  success: boolean;
  orders: OrderRow[];
  error?: string;
}

export type AppView = 1 | 2 | 3;
