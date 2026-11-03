export interface Productions_Interface {
  // Required fields (cannot be null)
  Id: number;
  DateAdd: string; // timestamp
  ProductionState: number; // smallint
  ProductionPercent: number; // decimal(6,2)

  // Nullable fields
  IdUnique: string | null;
  UserIdAdd: number | null;
  OrderId: number | null;
  OrderGroupId: number | null;
  IdMaterial: number | null;
  OperationsScheme: string | null;
  Symbol: string | null;
  Description: string | null;
  Groups: string | null;
  SubGroups: string | null;
  SubSubGroups: string | null;
  Comment: string | null;
  ProductionTimePlannedStart: string | null; // timestamp
  ProductionTimePlannedStop: string | null; // timestamp
  ProductionTimeStart: string | null; // timestamp
  ProductionTimeStop: string | null; // timestamp
  SocketOperationId: string | null;
  ProductionOperationsFlags: string | null;
  ProductionGroup: number | null;
  NotPieces: number | null; // smallint
}





export interface MaterialsSocketsInterface {
  // Required fields (cannot be null)
  Id: number;
  IdMaterial: number;
  IdMaterialSocket: number;
  OrderIndex: number;
  IncludePercentSummary: number;
  CheckListType: number;
  UseOrderSocket: number;

  // Optional fields (null is allowed)
  ConfirmMode?: number;
  SendMessageSMS?: number;
  SendMessageEmail?: number;
  SendMessageMode?: number;
}







  export interface ProductionSocketsInterface {
    Id: number;
    OrderId: number;
    ProductionId: number;
    IdMaterial: number;
    IdMachine: number;
    ProductionPercent: number;

    Symbol: string | null;
    Description: string | null;
    Groups: string | null;
    SubGroups: string | null;
    SubsubGroups: string | null;

    OrderIndex: number;
    IncludePercentSummary: number;
    CheckListType: number;
    UseOrderSocket: number;
    ConfirmMode: number;

    NormType: number;
    NormValue: number;
    NormTime: number;

    UserIdStart: number;
    UserIdStop: number;
    UserIdCheckStart: number;
    UserIdCheckStop: number;

    TimePlannedStart: string | null;
    TimePlannedStop: string | null;
    TimeStart: string | null;
    TimeStop: string | null;

    Comment: string | null;
    SocketOperationId: string | null;

    FlagRead: number | null;
    DateRead: string | null;
    UserIdRead: number | null;

    SendingState: number | null;
    ChildSocketStartType: number | null;
    ChildSocketOffset: number | null;
    SendMessageSMS: number | null;
    SendMessageEmail: number | null;
    SendMessageMode: number | null;
    SendingState1: number | null;
    CommentCL: string | null;

    CurrentStatus: number;
    CurrentOperatorId: number | null;
    CurrentMachineId: number | null;

    ActualWorkTimeMinutes: number;
    PauseTimeMinutes: number;
    PlannedWorkTimeMinutes: number;

    QuantityCompleted: number;
    QuantityScrap: number;
    PauseCount: number;

    LastEventDate: string | null;
    EfficiencyPercent: number | null;
    IsBlocked: boolean;
    BlockedReason: string | null;
  }
  
  export interface ProductionSocketEventsInterface {
    // Required fields (Null: "NO")
    Id: number;
    IdProductionSocket: number;
    EventType: number;
    EventDate: string;
  
    // Optional fields (Null: "YES")
    IdOperator?: number;
    IdMachine?: number;
    IdPauseReason?: number;
    QuantityCompleted?: number;
    QuantityScrap?: number;
    Comment?: string;
  }
  
  export interface ProductionsPauseReasonsInterface {
    // Required fields (Null: "NO")
    Id: number;
    Name: string;
  
    // Optional fields (Null: "YES")
    Color?: string;
    IsSystem?: boolean;
  }
  
  export interface ProductionSocketOperatorsInterface {
    // Required fields (Null: "NO")
    Id: number;
    IdProductionSocket: number;
    IdOperator: number;
    TimeStart: string;
  
    // Optional fields (Null: "YES")
    TimeStop?: string;
    ActualWorkTimeMinutes?: number;
  }
/**
 * A single FullPartList checklist row (`ProductionsSocketsCheckLists` table).
 * Linked to a ProductionsSockets step via ProductionSocketId.
 */
export interface ProductionsSocketsCheckListInterface {
  Id: number;
  IdOrder: number;
  IdJoin: number;

  State: number;
  Type: number;

  ProductionSocketId: number;

  X: number;
  Y: number;
  Z: number;

  Quantity: number;
  QuantityStamp: number;
  QuantityDamage: number;

  Symbol: string | null;
  Description: string | null;

  BarCode1: string | null;
  BarCode2: string | null;
  AttachFileName: string | null;

  Info1: string | null;
  Info2: string | null;
  Info3: string | null;
  Info4: string | null;
  Info5: string | null;

  Comment: string | null;
  OperationName: string | null;

  QueueEdgesSet: string | null;

  Edge1Symbol: string | null;
  Edge2Symbol: string | null;
  Edge3Symbol: string | null;
  Edge4Symbol: string | null;

  EdgeOrder: number | null;

  QueueEdge1State: number | null;
  QueueEdge2State: number | null;
  QueueEdge3State: number | null;
  QueueEdge4State: number | null;

  IdParent: number | null;

  PackageNumber: string | null;
  PackageSubNumber: string | null;
}

/** Alias matching legacy / DB naming. */
export type IProductionsSocketsCheckList = ProductionsSocketsCheckListInterface;
