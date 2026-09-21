import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authorizeProjectAccess } from './requireProjectAccess.js';

/**
 * Authorizes folder-scoped test-case routes (`/folders/:folderId/test-cases`).
 * Resolves the project from the folder so the project can't be spoofed; a
 * missing/deleted folder is 404 (decided before membership is consulted).
 */
export function requireFolderScopedAccess(opts: { manage?: boolean } = {}) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const folderId = req.params.folderId;
    if (!folderId) {
      throw ApiError.badRequest('folderId is required');
    }
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { projectId: true, isDeleted: true },
    });
    if (!folder || folder.isDeleted) {
      throw ApiError.notFound('Folder not found');
    }
    req.projectAccess = await authorizeProjectAccess(req.user!, folder.projectId, opts);
    next();
  });
}

/**
 * Authorizes test-case id routes (`/test-cases/:id...`). Resolves the project
 * from the case. Does NOT filter `isDeleted` — restore must reach a soft-deleted
 * case; per-operation active/deleted checks live in the service.
 */
export function requireTestCaseAccess(opts: { manage?: boolean } = {}) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const id = req.params.id;
    if (!id) {
      throw ApiError.badRequest('test case id is required');
    }
    const testCase = await prisma.testCase.findUnique({
      where: { id },
      select: { projectId: true },
    });
    if (!testCase) {
      throw ApiError.notFound('Test case not found');
    }
    req.projectAccess = await authorizeProjectAccess(req.user!, testCase.projectId, opts);
    next();
  });
}
