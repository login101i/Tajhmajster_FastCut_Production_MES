export interface Orders_Interface  {
    Id: number;
    Id1?: string;
    IdSession?: string;
    IdUser?: number;
    IdUserCookie?: string;
    IsError?: number;
    Type?: number;
    DateGeneration: string;
    JobCutFlag?: number;
    JobCutNumber?: number;
    ExportCutFlag?: number;
    ExportCutNumber?: number;
    MaterialsGroupFlag?: number;
    MaterialsGroupNumber?: number;
    State: number;
    OptimizeState?: number;
    OnlineState?: number;
    OnlineOrderId?: number;
    OwnNumber?: string;
    PersonelContact: string;
    DateExecution?: string;
    Priority: number;
    IsRead: number;
    PriorityStr?: string;
    Mode: number;
    Description?: string;
    ProductionTimeStart?: string;
    ProductionTimeStop?: string;
    ProductionPrc: string;
    DimensionsType: number;
    StripsType: number;
    DepartmentId?: number;
    DeliveryMethod: number;
    DeliveryMethodStr?: string;
    DocumentType: number;
    PaymentMethod: number;
    PaymentState: number;
    DiscountCoupon?: string;
    Price1?: string;
    Price2?: string;
    PriceTotal?: string;
    DeliveryCost: string;
    Quantity: string;
    Unit?: string;
    CompanyName?: string;
    CompanyName_2?: string;
    Firstname?: string;
    Firstname_2?: string;
    Lastname?: string;
    Lastname_2?: string;
    ZipCode?: string;
    ZipCode_2?: string;
    City?: string;
    City_2?: string;
    Street1?: string;
    Street1_2?: string;
    Street2?: string;
    Street2_2?: string;
    State1?: string;
    State1_2?: string;
    Country?: string;
    Country_2?: string;
    Phone?: string;
    Phone_2?: string;
    Email?: string;
    Email_2?: string;
    TaxId?: string;
    TaxId_2?: string;
    PESEL_2?: string;
    Comment?: string;
    AcceptRules?: number;
    AcceptNewsletter?: number;
    AcceptLevel1?: number;
    AcceptLevel2?: number;
    SumM2?: string;
    SumPcs?: string;
    SumCuttingM?: string;
    SumVeneeringM?: string;
    AttachFiles?: number;
    TypeStr?: string;
    DepPrice1?: string;
    DepPrice2?: string;
    DepPriceTotal?: string;
    SubId?: number;
    SubIdDepartment?: number;
    SubIdDepartmentOnlineId?: string;
    AutoOptimizeState?: number;
    EditState?: number;
    SendingState?: number;
    UpdateState?: number;
    FlagState?: number;
    ProductionTimeStartDef?: string;
    ProductionTimeStopDef?: string;
    DateDelivery?: string;
    DateInstallation?: string;
    IdCurrency?: number;
    Exchange?: string;
    IdShop?: number;
    DateExecutionCalc?: string;
    DateDeliveryCalc?: string;
    DateInstallationCalc?: string;
    ProductionTimeStartDefCalc?: string;
    ProductionTimeStopDefCalc?: string;
    FormName?: string;
    Params1?: string;
    Params2?: string;
    Params3?: string;
    Params4?: string;
    Params5?: string;
    StandardMaterialSymbol?: string;
    StandardMaterialSymbolEdge?: string;
    WSDLStatus?: number;
    UseWastes?: number;
    DateSetState_1?: string;
    ExtraService1?: string;
    ExtraService2?: string;
    ExtraService3?: string;
    ExtraService4?: string;
    ExtraService5?: string;
    ReportState?: number;
    ReportType?: number;
    DeletedFlag?: number;
    PaymentMethodStr?: string;
    MaterialsSymbols?: string;
    IdUserMod?: number;
    DateMod?: string;
    SchemaName?: string;
    IdParent?: number;
    ExtNumber?: string;
    PaymentOnlineState?: number;
    PaymentOnlineKey?: string;
    PaymentOnlineDateBegin?: string;
    PaymentOnlineDateEnd?: string;
    PaymentOnlineTotal?: string;
    PaymentOnlineTotalPercent?: string;
    IsGroupOrder?: number;
    IdUserAdd?: number;
    ConfirmState?: number;
    StateLabelsPrinted?: number;
    NewMessages?: number;
    VoucherId?: string;
    VoucherAmount?: string;
    ["3DAddAccessories"]?: number;
    ["3DGenerateCNCFiles"]?: number;
    IsSet?: number;
    SetName?: string;
    ClientTakeWastes?: number;
    NewMessagesOMAdd?: number;
    NewMessagesFCAdd?: number;
    FlagOut?: number;
    DateOut?: string;
    CommentOut?: string;
    UserIdStampOut?: number;
    BasketMode?: number;
    OnlineOrderIdCnt?: number;
    OnlineOrderIdCntMax?: number;
    OnlineOrderDepartmentId?: number;
    PackagesCreated?: number;
    PackagesShippedConfirm?: number;
    PackagesDeliveryConfirm?: number;
    CNCComment?: string;
    CNCDate?: string;
    CNCIdUser?: number;
    PackageNumberGen?: number;
    SumWeight?: string;
    DepartmentIdOld?: number;
    IsChangeDepartmentId?: number;
    JoinNumber?: string;
    FlagImosXML?: number;
    SumWeightPieceM2?: string;
    ExtId?: string;
    UrlShop?: string;
    SumSheetPcs?: string;
    SumUpdated?: number;
    IdGroupIndex?: string;
    StateAutoGroupOptimize?: number;
    IdLoggedUser?: number;
    IdShopUser?: string;
    IdLocalSession?: string;
    StoreComment?: string;
    MaxDimX?: string;
    MaxDimY?: string;
    MaxDimZ?: string;
    ClientDocumentType?: number;
    CNCCnt?: number;
    MyFavorite?: string;
    IsChanged?: number;
    ExtProjectId?: string;
    ExtProjectUser?: string;
    ExtProjectState?: number;
    ExtProjectGID?: string;
    IsErrorCalculate?: number;
    ExtProjectNumber?: number;
    SubFormName?: string;
    StockName?: string;
    PrimaryExtNumber?: string;
    ServerGID?: string;
    PaymentOnlineIdUserCancelled?: number;
    PaymentOnlineDateCancelled?: string;
    FlagBlockedMessages?: number;
    DateCalculation?: string;
    OrderGID?: string;
    ProductionSocketCnt?: number;
    PackagesStorageSpaceConfirm?: number;
    PaymentOnlineIndex?: number;
    CompetitionFlag?: number;
    OptimizeType?: number;
    IdUserEditNow?: number;
    OptimizeTypeState?: number;
    OptimizeTypeStateIndex?: number;
    ExternalOptimizeIndex?: number;
    IsExternalOptimize?: number;
    DiscountPercent?: string;
    ClientLimitState?: number;
    AssignedSupervisor?: string;
    AssignedWorker?: string;
    CalcState?: number;
    PaymentOnlineTransactionId?: string;
    OptimizeStripsType?: number;
    OptimizeTrimCutType?: number;
    CoohomDesignId?: string;
    CoohomProjectState?: number;
    AutoCalculate?: number;
    StorageSpaceSymbol?: string;
    IsDamageOrder?: number;
    ERPDocDateGen?: string;
    MaterialsStocksUpdate?: number;
    RealizationMethodStr: string;
    ClientTakesWasteStr: string;
    /** Cutting / CNC payload (sheets, pieceCncOperations, …). */
    OrderObject?: string | Record<string, any>;
  }

/** Runtime list of every Orders_Interface key (for Dev-mode column catalog on Orders page). */
export const Orders_AllColumnKeys: (keyof Orders_Interface)[] = [
  'Id',
  'Id1',
  'IdSession',
  'IdUser',
  'IdUserCookie',
  'IsError',
  'Type',
  'DateGeneration',
  'JobCutFlag',
  'JobCutNumber',
  'ExportCutFlag',
  'ExportCutNumber',
  'MaterialsGroupFlag',
  'MaterialsGroupNumber',
  'State',
  'OptimizeState',
  'OnlineState',
  'OnlineOrderId',
  'OwnNumber',
  'PersonelContact',
  'DateExecution',
  'Priority',
  'IsRead',
  'PriorityStr',
  'Mode',
  'Description',
  'ProductionTimeStart',
  'ProductionTimeStop',
  'ProductionPrc',
  'DimensionsType',
  'StripsType',
  'DepartmentId',
  'DeliveryMethod',
  'DeliveryMethodStr',
  'DocumentType',
  'PaymentMethod',
  'PaymentState',
  'DiscountCoupon',
  'Price1',
  'Price2',
  'PriceTotal',
  'DeliveryCost',
  'Quantity',
  'Unit',
  'CompanyName',
  'CompanyName_2',
  'Firstname',
  'Firstname_2',
  'Lastname',
  'Lastname_2',
  'ZipCode',
  'ZipCode_2',
  'City',
  'City_2',
  'Street1',
  'Street1_2',
  'Street2',
  'Street2_2',
  'State1',
  'State1_2',
  'Country',
  'Country_2',
  'Phone',
  'Phone_2',
  'Email',
  'Email_2',
  'TaxId',
  'TaxId_2',
  'PESEL_2',
  'Comment',
  'AcceptRules',
  'AcceptNewsletter',
  'AcceptLevel1',
  'AcceptLevel2',
  'SumM2',
  'SumPcs',
  'SumCuttingM',
  'SumVeneeringM',
  'AttachFiles',
  'TypeStr',
  'DepPrice1',
  'DepPrice2',
  'DepPriceTotal',
  'SubId',
  'SubIdDepartment',
  'SubIdDepartmentOnlineId',
  'AutoOptimizeState',
  'EditState',
  'SendingState',
  'UpdateState',
  'FlagState',
  'ProductionTimeStartDef',
  'ProductionTimeStopDef',
  'DateDelivery',
  'DateInstallation',
  'IdCurrency',
  'Exchange',
  'IdShop',
  'DateExecutionCalc',
  'DateDeliveryCalc',
  'DateInstallationCalc',
  'ProductionTimeStartDefCalc',
  'ProductionTimeStopDefCalc',
  'FormName',
  'Params1',
  'Params2',
  'Params3',
  'Params4',
  'Params5',
  'StandardMaterialSymbol',
  'StandardMaterialSymbolEdge',
  'WSDLStatus',
  'UseWastes',
  'DateSetState_1',
  'ExtraService1',
  'ExtraService2',
  'ExtraService3',
  'ExtraService4',
  'ExtraService5',
  'ReportState',
  'ReportType',
  'DeletedFlag',
  'PaymentMethodStr',
  'MaterialsSymbols',
  'IdUserMod',
  'DateMod',
  'SchemaName',
  'IdParent',
  'ExtNumber',
  'PaymentOnlineState',
  'PaymentOnlineKey',
  'PaymentOnlineDateBegin',
  'PaymentOnlineDateEnd',
  'PaymentOnlineTotal',
  'PaymentOnlineTotalPercent',
  'IsGroupOrder',
  'IdUserAdd',
  'ConfirmState',
  'StateLabelsPrinted',
  'NewMessages',
  'VoucherId',
  'VoucherAmount',
  '3DAddAccessories',
  '3DGenerateCNCFiles',
  'IsSet',
  'SetName',
  'ClientTakeWastes',
  'NewMessagesOMAdd',
  'NewMessagesFCAdd',
  'FlagOut',
  'DateOut',
  'CommentOut',
  'UserIdStampOut',
  'BasketMode',
  'OnlineOrderIdCnt',
  'OnlineOrderIdCntMax',
  'OnlineOrderDepartmentId',
  'PackagesCreated',
  'PackagesShippedConfirm',
  'PackagesDeliveryConfirm',
  'CNCComment',
  'CNCDate',
  'CNCIdUser',
  'PackageNumberGen',
  'SumWeight',
  'DepartmentIdOld',
  'IsChangeDepartmentId',
  'JoinNumber',
  'FlagImosXML',
  'SumWeightPieceM2',
  'ExtId',
  'UrlShop',
  'SumSheetPcs',
  'SumUpdated',
  'IdGroupIndex',
  'StateAutoGroupOptimize',
  'IdLoggedUser',
  'IdShopUser',
  'IdLocalSession',
  'StoreComment',
  'MaxDimX',
  'MaxDimY',
  'MaxDimZ',
  'ClientDocumentType',
  'CNCCnt',
  'MyFavorite',
  'IsChanged',
  'ExtProjectId',
  'ExtProjectUser',
  'ExtProjectState',
  'ExtProjectGID',
  'IsErrorCalculate',
  'ExtProjectNumber',
  'SubFormName',
  'StockName',
  'PrimaryExtNumber',
  'ServerGID',
  'PaymentOnlineIdUserCancelled',
  'PaymentOnlineDateCancelled',
  'FlagBlockedMessages',
  'DateCalculation',
  'OrderGID',
  'ProductionSocketCnt',
  'PackagesStorageSpaceConfirm',
  'PaymentOnlineIndex',
  'CompetitionFlag',
  'OptimizeType',
  'IdUserEditNow',
  'OptimizeTypeState',
  'OptimizeTypeStateIndex',
  'ExternalOptimizeIndex',
  'IsExternalOptimize',
  'DiscountPercent',
  'ClientLimitState',
  'AssignedSupervisor',
  'AssignedWorker',
  'CalcState',
  'PaymentOnlineTransactionId',
  'OptimizeStripsType',
  'OptimizeTrimCutType',
  'CoohomDesignId',
  'CoohomProjectState',
  'AutoCalculate',
  'StorageSpaceSymbol',
  'IsDamageOrder',
  'ERPDocDateGen',
  'MaterialsStocksUpdate',
  'RealizationMethodStr',
  'ClientTakesWasteStr',
  'OrderObject',
];
  