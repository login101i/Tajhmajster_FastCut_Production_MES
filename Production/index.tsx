import {
  MaterialsSocketsInterface,
  ProductionSocketsInterface,
  Productions_Interface,
  ProductionsSocketsCheckListInterface,
} from "@/app/Interfaces/Productions";
import { apiEndpoints, buildApiUrl } from "@/config/database";
import { fetchMaterials, unwrapMaterialsRows } from "@/utils/Functions/SQL/Materials";
import type { Materials_Interface } from "@/app/Interfaces/Materials";
import { NORM_TYPE_LABELS } from "@/app/(dashboard)/planning/utils/durationHelpers";
import {
  calculateOrderProductionPercent,
  calculateOrderProductionPrcString,
  formatProductionPercentValue,
} from "@/utils/Functions/Production";
import { updateOrderProductionPrc } from "@/utils/Functions/SQL/Orders";

export {
  calculateOrderProductionPercent,
  calculateOrderProductionPrcString,
  formatProductionPercentValue,
  parseProductionPercent,
  PRODUCTION_PERCENT_FILL_COLOR,
} from "@/utils/Functions/Production";

export const CONFIRM_MODE_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 1, label: 'One step (start - stop)' },
  { value: 2, label: 'Two steps (start and stop separately)' },
] as const;

export const CHECKLIST_TYPE_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 1, label: 'FullPartList' },
] as const;

export function getConfirmModeLabel(mode: number): string {
  return CONFIRM_MODE_OPTIONS.find((opt) => opt.value === mode)?.label ?? `Unknown (${mode})`;
}

export function getCheckListTypeLabel(type: number): string {
  if (type === 0) return 'None';
  if (type === 1) return 'FullPartList';
  return `Unknown (${type})`;
}

export function getNormTypeLabel(normType: number): string {
  return NORM_TYPE_LABELS[normType] ?? `Unknown (${normType})`;
}

export const fetchMaterialsSocketsByPathId = async (
  pathMaterialId: number,
): Promise<MaterialsSocketsInterface[] | null> => {
  try {
    const queryParams = new URLSearchParams();
    queryParams.append('IdMaterial', String(pathMaterialId));
    const url = `${apiEndpoints.materialsSockets}?${queryParams.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.error(`Failed to fetch materials sockets. Status: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data?.sockets || !Array.isArray(data.sockets)) {
      return [];
    }

    return data.sockets as MaterialsSocketsInterface[];
  } catch (error) {
    console.error('Error fetching materials sockets:', error);
    return null;
  }
};

export interface UpdateMaterialsSocketPayload {
  id: number;
  includePercentSummary?: number;
  checkListType?: number;
  useOrderSocket?: number;
  confirmMode?: number;
}

export const updateMaterialsSocket = async (
  payload: UpdateMaterialsSocketPayload,
): Promise<boolean> => {
  try {
    const url = `${apiEndpoints.materialsSockets}/${payload.id}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('updateMaterialsSocket failed:', response.statusText);
      return false;
    }

    const data = await response.json();
    return Boolean(data?.success);
  } catch (error) {
    console.error('Error updating materials socket:', error);
    return false;
  }
};
export interface ProductionSocketInterface {
  TimeStart: any;
  TimePlannedStart: any;
  Id: number;
  Symbol: string;
  Description: string;
  GroupName?: string;
  SubGroup?: string;
  SubsubGroup?: string;
  AssignedDepartment?: string;
  // Add any other fields as needed...
}

export const fetchProductionSockets = async (
  sortField: string,
  sortDirection: 'asc' | 'desc',
  nameFilter?: string
): Promise<ProductionSocketInterface[] | null> => {
  try {
    console.log(
      `Fetching production sockets with: sortField="${sortField}", sortDirection="${sortDirection}", nameFilter="${nameFilter}"`
    );

    // Construct URL query parameters
    const queryParams = new URLSearchParams();
    queryParams.append('sortField', sortField);
    queryParams.append('sortDirection', sortDirection);
    if (nameFilter && nameFilter.trim() !== '') {
      queryParams.append('nameFilter', nameFilter);
    }

    const url = `${apiEndpoints.productionSockets}?${queryParams.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      // credentials: 'include', // Uncomment if you need cookies/credentials
    });

    if (!response.ok) {
      console.error(
        `Failed to fetch production sockets. Status: ${response.status} - ${response.statusText}`
      );
      return null;
    }

    const data = await response.json();
    // Assuming your API returns an object with a property "productionSockets" that is an array:
    if (!data || !Array.isArray(data.productionSockets)) {
      console.warn('No valid production sockets data returned by server.');
      return null;
    }

    console.log('Production sockets fetched successfully:', data.productionSockets.length, 'records.');
    return data.productionSockets;
  } catch (error) {
    console.error('Error fetching production sockets:', error);
    return null;
  }
};

export const fetchProductionsByOrderId = async (
  orderId: number,
): Promise<Productions_Interface[] | null> => {
  try {
    const url = `${buildApiUrl('/production/fetchProductions')}?OrderId=${orderId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.error(
        `Failed to fetch productions for order ${orderId}. Status: ${response.status} - ${response.statusText}`,
      );
      return null;
    }

    const data = await response.json();
    if (!data?.productions || !Array.isArray(data.productions)) {
      return [];
    }

    return data.productions as Productions_Interface[];
  } catch (error) {
    console.error(`Error fetching productions for order ${orderId}:`, error);
    return null;
  }
};

/**
 * Payload for inserting a single Productions row.
 * Mirrors the `insertProduction` controller body (and Productions_Interface).
 */
export interface InsertProductionPayload {
  IdUnique: string;
  DateAdd: string;
  UserIdAdd: number;
  OrderId: number;
  OrderGroupId?: number | null;
  IdMaterial: number;
  OperationsScheme: string;
  Symbol: string;
  Description?: string | null;
  Groups?: string | null;
  SubGroups?: string | null;
  SubSubGroups?: string | null;
  Comment?: string | null;
  ProductionState?: number;
  ProductionPercent?: number;
  ProductionTimePlannedStart?: string | null;
  ProductionTimePlannedStop?: string | null;
  ProductionTimeStart?: string | null;
  ProductionTimeStop?: string | null;
  SocketOperationId?: string | null;
  ProductionOperationsFlags?: string | null;
  ProductionGroup?: number | null;
  NotPieces?: number | null;
}

export interface InsertProductionResult {
  success: boolean;
  insertId?: number;
}

/**
 * Insert a single production path row into the Productions table.
 * Hits the `/production/insertProduction` controller.
 */
export const insertIntoProductions = async (
  payload: InsertProductionPayload,
): Promise<InsertProductionResult | null> => {
  try {
    const url = buildApiUrl('/production/insertProduction');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('insertIntoProductions failed:', data);
      return null;
    }

    return data as InsertProductionResult;
  } catch (error) {
    console.error('Error inserting production:', error);
    return null;
  }
};

/** Payload for inserting a single ProductionsSockets row (a production step). */
export interface InsertProductionSocketPayload {
  OrderId: number;
  ProductionId: number;
  /** Operation/socket Materials id (ProductionsSockets has no IdMaterialSocket column). */
  IdMaterial: number;
  /** @deprecated ProductionsSockets has no IdMaterialSocket column — use IdMaterial. */
  IdMaterialSocket?: number;
  OrderIndex: number;
  Symbol?: string | null;
  Description?: string | null;
  Groups?: string | null;
  SubGroups?: string | null;
  SubsubGroups?: string | null;
  ProductionPercent?: number;
  IncludePercentSummary?: number;
  CheckListType?: number;
  UseOrderSocket?: number;
  ConfirmMode?: number;
  NormType?: number;
  NormValue?: number;
  NormTime?: number;
  SocketOperationId?: string | null;
  IdMachine?: number;
}

export interface InsertProductionSocketResult {
  success: boolean;
  insertId?: number;
}

/**
 * Insert a single production step into the ProductionsSockets table under an
 * already-persisted Productions row. Hits `/production/insertProductionSocket`.
 */
export const insertProductionSocket = async (
  payload: InsertProductionSocketPayload,
): Promise<InsertProductionSocketResult | null> => {
  try {
    const url = buildApiUrl('/production/insertProductionSocket');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('insertProductionSocket failed:', data);
      return null;
    }

    return data as InsertProductionSocketResult;
  } catch (error) {
    console.error('Error inserting production socket:', error);
    return null;
  }
};

/** Returns the first production row for an order, if any. */
export const checkExistingProduction = async (
  orderId: number,
): Promise<Productions_Interface | null> => {
  const rows = await fetchProductionsByOrderId(orderId);
  return rows?.[0] ?? null;
};

/** Production paths configured in Materials (MatType 600). */
export const fetchProductionPathCatalog = async (): Promise<Materials_Interface[]> => {
  const data = await fetchMaterials('600');
  return (unwrapMaterialsRows(data) as unknown as Materials_Interface[]) ?? [];
};

/** Production step / socket operation resources configured in Materials (MatType 601). */
export const fetchProductionStepCatalog = async (): Promise<Materials_Interface[]> => {
  const data = await fetchMaterials('601');
  return (unwrapMaterialsRows(data) as unknown as Materials_Interface[]) ?? [];
};

export const fetchProductionSocketsByOrderId = async (
  orderId?: number
): Promise<ProductionSocketsInterface[] | null> => {
  try {
    const queryParams = new URLSearchParams();
    if (orderId != null) {
      queryParams.append('OrderId', String(orderId));
    }

    const url = `${buildApiUrl('/production/fetchProductionSockets')}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.error(
        `Failed to fetch production sockets for order ${orderId}. Status: ${response.status} - ${response.statusText}`
      );
      return null;
    }

    const data = await response.json();
    if (!data?.success || !Array.isArray(data.sockets)) {
      console.warn(`No valid production sockets returned for order ${orderId}.`);
      return null;
    }

    return data.sockets;
  } catch (error) {
    console.error(`Error fetching production sockets for order ${orderId}:`, error);
    return null;
  }
};

export interface SendProductionStepPayload {
  idMaterialSocket: number;
  orderIndex: number;
  symbol: string;
  description: string;
  confirmMode: number;
  normType: number;
  normValue: number;
  normTime: number;
  includePercentSummary: number;
  checkListType: number;
  useOrderSocket: number;
  groups?: string | null;
  subGroups?: string | null;
  subsubGroups?: string | null;
}

export interface SendOrderToProductionPayload {
  orderId: number;
  userIdAdd: number;
  pathMaterialId: number;
  operationsScheme: string;
  productionOperationsFlags?: string;
  symbol: string;
  description: string;
  groups?: string | null;
  subGroups?: string | null;
  subSubGroups?: string | null;
  steps: SendProductionStepPayload[];
}

export interface SendOrderToProductionResult {
  success: boolean;
  productionId: number;
  idUnique: string;
  socketsInserted: number;
  orderState: number;
  orderProductionPercent?: number;
  productionPrc?: string;
}

export const sendOrderToProduction = async (
  payload: SendOrderToProductionPayload,
): Promise<SendOrderToProductionResult | null> => {
  try {
    const url = buildApiUrl('/production/sendOrderToProduction');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('sendOrderToProduction failed:', data);
      throw new Error(data?.error || `HTTP ${response.status}`);
    }

    return data as SendOrderToProductionResult;
  } catch (error) {
    console.error('Error sending order to production:', error);
    throw error;
  }
};

export const deleteProductionByIdUnique = async (idUnique: string): Promise<boolean> => {
  try {
    const url = buildApiUrl(`/production/deleteProduction/${encodeURIComponent(idUnique)}`);
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      console.error('deleteProductionByIdUnique failed:', response.statusText);
      return false;
    }
    const data = await response.json();
    return Boolean(data?.success);
  } catch (error) {
    console.error('Error deleting production:', error);
    return false;
  }
};

export const deleteProductionSocketById = async (socketId: number): Promise<boolean> => {
  try {
    const url = buildApiUrl(`/production/deleteProductionSocket/${socketId}`);
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      console.error('deleteProductionSocketById failed:', response.statusText);
      return false;
    }
    const data = await response.json();
    return Boolean(data?.success);
  } catch (error) {
    console.error('Error deleting production socket:', error);
    return false;
  }
};

export interface ConfirmSocketOperationPayload {
  socketId: number;
  userId: number;
  /** Epoch ms of first scan — required for two-step second scan interval check. */
  firstScanAt?: number;
}

export interface ConfirmSocketOperationResult {
  success: boolean;
  action: 'acknowledged' | 'completed_one_step' | 'started' | 'stopped';
  confirmMode: number;
  checkListType: number;
  socket: ProductionSocketsInterface;
  alreadyCompleted?: boolean;
  tooSoon?: boolean;
  orderProductionPercent?: number;
  productionPrc?: string;
}

export const confirmProductionSocketOperation = async (
  payload: ConfirmSocketOperationPayload,
): Promise<ConfirmSocketOperationResult> => {
  const url = buildApiUrl('/production/confirmSocketOperation');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.error || `HTTP ${response.status}`) as Error & {
      alreadyCompleted?: boolean;
      tooSoon?: boolean;
      socket?: ProductionSocketsInterface;
    };
    err.alreadyCompleted = data?.alreadyCompleted;
    err.tooSoon = data?.tooSoon;
    err.socket = data?.socket;
    (err as Error & { noPermission?: boolean }).noPermission = data?.noPermission;
    throw err;
  }

  return data as ConfirmSocketOperationResult;
};

export const fetchProductionSocketById = async (
  socketId: number,
): Promise<ProductionSocketsInterface | null> => {
  try {
    const url = `${buildApiUrl('/production/fetchProductionSockets')}?Id=${socketId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.success || !Array.isArray(data.sockets)) return null;

    const match = (data.sockets as ProductionSocketsInterface[]).find((s) => s.Id === socketId);
    return match ?? null;
  } catch (error) {
    console.error(`Error fetching production socket ${socketId}:`, error);
    return null;
  }
};

export interface StartSocketOperationPayload {
  socketId: number;
  userId: number;
}

export interface StartSocketOperationResult {
  success: boolean;
  alreadyStarted?: boolean;
  socket: ProductionSocketsInterface;
}

export const startProductionSocketOperation = async (
  payload: StartSocketOperationPayload,
): Promise<StartSocketOperationResult> => {
  const url = buildApiUrl('/production/startSocketOperation');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data as StartSocketOperationResult;
};

export const fetchProductionSocketCheckLists = async (
  productionSocketId: number,
): Promise<ProductionsSocketsCheckListInterface[] | null> => {
  try {
    const url = `${buildApiUrl('/production/fetchProductionSocketCheckLists')}?ProductionSocketId=${productionSocketId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) {
      console.error(
        `Failed to fetch checklists for socket ${productionSocketId}. Status: ${response.status} - ${response.statusText}`,
      );
      return null;
    }

    const data = await response.json();
    if (!data?.success || !Array.isArray(data.checkLists)) {
      return [];
    }

    return data.checkLists as ProductionsSocketsCheckListInterface[];
  } catch (error) {
    console.error(`Error fetching checklists for socket ${productionSocketId}:`, error);
    return null;
  }
};

export interface ConfirmCheckListItemPayload {
  checkListId: number;
  quantity: number;
  userId: number;
}

export interface ConfirmCheckListItemResult {
  success: boolean;
  checkLists: ProductionsSocketsCheckListInterface[];
  socket: ProductionSocketsInterface;
  socketPercent: number;
  completed: boolean;
  orderProductionPercent?: number;
}

export const confirmProductionSocketCheckListItem = async (
  payload: ConfirmCheckListItemPayload,
): Promise<ConfirmCheckListItemResult> => {
  const url = buildApiUrl('/production/confirmCheckListItem');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data as ConfirmCheckListItemResult;
};

/** MES / integration: update Productions header (state, times, percent). */
export interface UpdateProductionPayload {
  id: number;
  ProductionState?: number;
  ProductionPercent?: number;
  ProductionTimePlannedStart?: string | null;
  ProductionTimePlannedStop?: string | null;
  ProductionTimeStart?: string | null;
  ProductionTimeStop?: string | null;
  Comment?: string | null;
  Description?: string | null;
  SocketOperationId?: string | null;
  ProductionOperationsFlags?: string | null;
}

export interface UpdateProductionResult {
  success: boolean;
  production: Productions_Interface;
  updatedFields: string[];
}

export const updateProduction = async (
  payload: UpdateProductionPayload,
): Promise<UpdateProductionResult> => {
  const url = buildApiUrl('/production/updateProduction');
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data as UpdateProductionResult;
};

/** MES / integration: push stage progress onto ProductionsSockets. */
export interface UpdateProductionSocketPayload {
  id: number;
  TimeStart?: string | null;
  TimeStop?: string | null;
  TimePlannedStart?: string | null;
  TimePlannedStop?: string | null;
  ProductionPercent?: number;
  UserIdStart?: number;
  UserIdStop?: number;
  UserIdCheckStart?: number;
  UserIdCheckStop?: number;
  CurrentStatus?: number;
  CurrentOperatorId?: number | null;
  CurrentMachineId?: number | null;
  ActualWorkTimeMinutes?: number;
  PauseTimeMinutes?: number;
  PlannedWorkTimeMinutes?: number;
  QuantityCompleted?: number;
  QuantityScrap?: number;
  Comment?: string | null;
  IdMachine?: number;
  /** When true (default if ProductionPercent set), recalculate Orders.ProductionPrc */
  recalcOrderPercent?: boolean;
}

export interface UpdateProductionSocketResult {
  success: boolean;
  socket: ProductionSocketsInterface;
  updatedFields: string[];
  orderProductionPercent?: number;
  productionPrc?: string;
}

export const updateProductionSocket = async (
  payload: UpdateProductionSocketPayload,
): Promise<UpdateProductionSocketResult> => {
  const url = buildApiUrl('/production/updateProductionSocket');
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data as UpdateProductionSocketResult;
};

/** Recompute order % from production sockets and persist to Orders.ProductionPrc. */
export const syncOrderProductionPercent = async (orderId: number): Promise<string | null> => {
  const sockets = await fetchProductionSocketsByOrderId(orderId);
  if (!sockets || sockets.length === 0) return null;

  const productionPrc = calculateOrderProductionPrcString(sockets);
  const ok = await updateOrderProductionPrc(orderId, productionPrc);
  return ok ? productionPrc : null;
};
