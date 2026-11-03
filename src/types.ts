export interface OrderRow {
  Id: number;
  OwnNumber: string | null;
  Description: string | null;
  CompanyName: string | null;
  FormName: string | null;
  State: number;
  DateGeneration: string | null;
  DateExecution: string | null;
  ProductionPrc: string | number | null;
  IsGroupOrder: number | null;
  IdParent: number | null;
  PriorityStr: string | null;
  MaterialsSymbols: string | null;
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
