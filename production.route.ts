import express from 'express';
import { isAutheticated, authorizeRoles } from '../middleware/auth';
import {
  fetchProductions,
  insertProduction,
  insertProductionSocket,
  deleteProduction,
  deleteProductionSocket,
  fetchProductionSockets,
  sendOrderToProduction,
  startProductionSocketOperation,
  confirmProductionSocketOperation,
  fetchProductionSocketCheckLists,
  confirmProductionSocketCheckListItem,
  updateProduction,
  updateProductionSocket,
} from '../controllers/production.controller';

const productionRoute = express.Router();

// Fetch productions (optionally filtered by OrderId)
productionRoute.get('/production/fetchProductions', fetchProductions);
productionRoute.get('/production/fetchProductionSockets', fetchProductionSockets);

// Insert a new production record
productionRoute.post('/production/insertProduction', insertProduction);

// Insert a single production socket (step) under an existing production
productionRoute.post('/production/insertProductionSocket', insertProductionSocket);

// Send order to production (Productions + ProductionsSockets + order state)
productionRoute.post('/production/sendOrderToProduction', sendOrderToProduction);

// MES / integration: update Productions header (state, times, percent)
productionRoute.put('/production/updateProduction', updateProduction);

// MES / integration: push stage progress onto ProductionsSockets
productionRoute.put('/production/updateProductionSocket', updateProductionSocket);

// Delete a production record by its unique Id
productionRoute.delete('/production/deleteProduction/:IdUnique', deleteProduction);

// Delete a single production socket (step) by Id
productionRoute.delete('/production/deleteProductionSocket/:id', deleteProductionSocket);

// Start operator socket operation by IdMaterialSocket code
productionRoute.post('/production/startSocketOperation', startProductionSocketOperation);

// Confirm operator socket operation (ConfirmMode-aware)
productionRoute.post('/production/confirmSocketOperation', confirmProductionSocketOperation);

// FullPartList checklist: fetch rows for a step and confirm pieces on a row
productionRoute.get('/production/fetchProductionSocketCheckLists', fetchProductionSocketCheckLists);
productionRoute.post('/production/confirmCheckListItem', confirmProductionSocketCheckListItem);

export default productionRoute;
