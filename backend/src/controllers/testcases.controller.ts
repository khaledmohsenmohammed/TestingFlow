import type { Request, Response } from 'express';
import * as testcasesService from '../services/testcases.service.js';

export async function listFolderTestCases(req: Request, res: Response): Promise<void> {
  const testCases = await testcasesService.listFolderTestCases(
    req.projectAccess!.projectId,
    req.params.folderId!,
  );
  res.json({ testCases });
}

export async function createTestCase(req: Request, res: Response): Promise<void> {
  const testCase = await testcasesService.createTestCase(
    req.user!.sub,
    req.projectAccess!.projectId,
    req.params.folderId!,
    req.body,
  );
  res.status(201).json({ testCase });
}

export async function getTestCase(req: Request, res: Response): Promise<void> {
  const testCase = await testcasesService.getTestCase(req.projectAccess!.projectId, req.params.id!);
  res.json({ testCase });
}

export async function updateTestCase(req: Request, res: Response): Promise<void> {
  const testCase = await testcasesService.updateTestCase(
    req.user!.sub,
    req.projectAccess!.projectId,
    req.params.id!,
    req.body,
  );
  res.json({ testCase });
}

export async function moveTestCase(req: Request, res: Response): Promise<void> {
  const testCase = await testcasesService.moveTestCase(
    req.user!.sub,
    req.projectAccess!.projectId,
    req.params.id!,
    req.body.folderId,
  );
  res.json({ testCase });
}

export async function deleteTestCase(req: Request, res: Response): Promise<void> {
  await testcasesService.softDeleteTestCase(
    req.user!.sub,
    req.projectAccess!.projectId,
    req.params.id!,
  );
  res.json({ message: 'Test case deleted' });
}

export async function restoreTestCase(req: Request, res: Response): Promise<void> {
  const testCase = await testcasesService.restoreTestCase(
    req.user!.sub,
    req.projectAccess!.projectId,
    req.params.id!,
  );
  res.json({ testCase });
}

/** Project-scoped: deleted test cases for the restore view. */
export async function listDeletedTestCases(req: Request, res: Response): Promise<void> {
  const testCases = await testcasesService.listDeletedTestCases(req.projectAccess!.projectId);
  res.json({ testCases });
}
