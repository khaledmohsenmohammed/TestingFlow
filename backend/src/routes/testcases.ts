import { Router } from 'express';
import * as testcasesController from '../controllers/testcases.controller.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import {
  requireFolderScopedAccess,
  requireTestCaseAccess,
} from '../middleware/requireTestCaseAccess.js';
import { createTestCaseSchema, moveTestCaseSchema, updateTestCaseSchema } from './testcases.schemas.js';

// Folder-scoped: list + create. Mounted at /folders/:folderId/test-cases.
export const testCaseFolderRoutes = Router({ mergeParams: true });

testCaseFolderRoutes.get(
  '/',
  requireFolderScopedAccess(),
  asyncHandler(testcasesController.listFolderTestCases),
);
testCaseFolderRoutes.post(
  '/',
  requireFolderScopedAccess({ manage: true }),
  validateBody(createTestCaseSchema),
  asyncHandler(testcasesController.createTestCase),
);

// Id-scoped: get / update / move / delete / restore. Mounted at /test-cases.
export const testCaseRoutes = Router();

testCaseRoutes.get('/:id', requireTestCaseAccess(), asyncHandler(testcasesController.getTestCase));
testCaseRoutes.patch(
  '/:id',
  requireTestCaseAccess({ manage: true }),
  validateBody(updateTestCaseSchema),
  asyncHandler(testcasesController.updateTestCase),
);
testCaseRoutes.post(
  '/:id/move',
  requireTestCaseAccess({ manage: true }),
  validateBody(moveTestCaseSchema),
  asyncHandler(testcasesController.moveTestCase),
);
testCaseRoutes.delete(
  '/:id',
  requireTestCaseAccess({ manage: true }),
  asyncHandler(testcasesController.deleteTestCase),
);
testCaseRoutes.post(
  '/:id/restore',
  requireTestCaseAccess({ manage: true }),
  asyncHandler(testcasesController.restoreTestCase),
);
