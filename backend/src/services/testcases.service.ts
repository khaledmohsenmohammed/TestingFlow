import type { TestCase, TestStep } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import type { CreateTestCaseInput, UpdateTestCaseInput } from '../routes/testcases.schemas.js';

export interface TestCaseStep {
  action: string;
  expected: string;
}

export interface TestCaseSummary {
  id: string;
  title: string;
  type: string;
  folderId: string;
  isDeleted: boolean;
  createdAt: Date;
}

export interface TestCaseDetail extends TestCaseSummary {
  description: string | null;
  playwrightRef: string | null;
  steps: TestCaseStep[];
  updatedAt: Date;
}

function toSummary(tc: TestCase): TestCaseSummary {
  return {
    id: tc.id,
    title: tc.title,
    type: tc.type,
    folderId: tc.folderId,
    isDeleted: tc.isDeleted,
    createdAt: tc.createdAt,
  };
}

function toDetail(tc: TestCase & { steps: TestStep[] }): TestCaseDetail {
  return {
    ...toSummary(tc),
    description: tc.description,
    playwrightRef: tc.playwrightRef,
    updatedAt: tc.updatedAt,
    steps: [...tc.steps]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ action: s.action, expected: s.expected })),
  };
}

/** Loads an active (non-deleted) test case in the project or throws 404. */
async function loadActiveTestCase(projectId: string, id: string): Promise<TestCase> {
  const tc = await prisma.testCase.findUnique({ where: { id } });
  if (!tc || tc.isDeleted || tc.projectId !== projectId) {
    throw ApiError.notFound('Test case not found');
  }
  return tc;
}

/** Validates a folder is active and belongs to the project. */
async function loadActiveFolder(projectId: string, folderId: string): Promise<void> {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.isDeleted) {
    throw ApiError.notFound('Folder not found');
  }
  if (folder.projectId !== projectId) {
    throw ApiError.badRequest('Folder belongs to a different project');
  }
}

export async function listFolderTestCases(
  projectId: string,
  folderId: string,
): Promise<TestCaseSummary[]> {
  await loadActiveFolder(projectId, folderId);
  const rows = await prisma.testCase.findMany({
    where: { projectId, folderId, isDeleted: false },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toSummary);
}

export async function getTestCase(projectId: string, id: string): Promise<TestCaseDetail> {
  const tc = await prisma.testCase.findUnique({ where: { id }, include: { steps: true } });
  if (!tc || tc.isDeleted || tc.projectId !== projectId) {
    throw ApiError.notFound('Test case not found');
  }
  return toDetail(tc);
}

export async function createTestCase(
  actingUserId: string,
  projectId: string,
  folderId: string,
  input: CreateTestCaseInput,
): Promise<TestCaseDetail> {
  await loadActiveFolder(projectId, folderId);
  const created = await prisma.testCase.create({
    data: {
      projectId,
      folderId,
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      playwrightRef: input.playwrightRef ?? null,
      createdBy: actingUserId,
      steps: {
        create: input.steps.map((s, i) => ({ order: i, action: s.action, expected: s.expected })),
      },
    },
    include: { steps: true },
  });
  audit('CREATE_TESTCASE', { type: 'TestCase', id: created.id }, { by: actingUserId, projectId, folderId });
  return toDetail(created);
}

export async function updateTestCase(
  actingUserId: string,
  projectId: string,
  id: string,
  input: UpdateTestCaseInput,
): Promise<TestCaseDetail> {
  await loadActiveTestCase(projectId, id);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.testCase.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        playwrightRef: input.playwrightRef ?? null,
        updatedBy: actingUserId,
      },
    });
    // Full replace of steps (delete-then-recreate is safe within the tx).
    await tx.testStep.deleteMany({ where: { testCaseId: id } });
    if (input.steps.length > 0) {
      await tx.testStep.createMany({
        data: input.steps.map((s, i) => ({
          testCaseId: id,
          order: i,
          action: s.action,
          expected: s.expected,
        })),
      });
    }
    return tx.testCase.findUniqueOrThrow({ where: { id }, include: { steps: true } });
  });
  audit('UPDATE_TESTCASE', { type: 'TestCase', id }, { by: actingUserId, projectId });
  return toDetail(updated);
}

export async function moveTestCase(
  actingUserId: string,
  projectId: string,
  id: string,
  destFolderId: string,
): Promise<TestCaseSummary> {
  const tc = await loadActiveTestCase(projectId, id);
  const dest = await prisma.folder.findUnique({ where: { id: destFolderId } });
  if (!dest || dest.isDeleted) {
    throw ApiError.notFound('Destination folder not found');
  }
  if (dest.projectId !== tc.projectId) {
    throw ApiError.badRequest('Destination folder belongs to a different project');
  }
  const updated = await prisma.testCase.update({
    where: { id },
    data: { folderId: destFolderId, updatedBy: actingUserId },
  });
  audit('MOVE_TESTCASE', { type: 'TestCase', id }, { by: actingUserId, projectId, from: tc.folderId, to: destFolderId });
  return toSummary(updated);
}

export async function softDeleteTestCase(
  actingUserId: string,
  projectId: string,
  id: string,
): Promise<void> {
  await loadActiveTestCase(projectId, id);
  await prisma.testCase.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: actingUserId },
  });
  audit('DELETE', { type: 'TestCase', id }, { by: actingUserId, projectId });
}

export async function restoreTestCase(
  actingUserId: string,
  projectId: string,
  id: string,
): Promise<TestCaseSummary> {
  const tc = await prisma.testCase.findUnique({ where: { id } });
  if (!tc || tc.projectId !== projectId) {
    throw ApiError.notFound('Test case not found');
  }
  if (!tc.isDeleted) {
    throw ApiError.conflict('Test case is not deleted');
  }
  const folder = await prisma.folder.findUnique({ where: { id: tc.folderId } });
  if (!folder || folder.isDeleted) {
    throw ApiError.conflict('The test case folder is deleted; restore the folder first');
  }
  const updated = await prisma.testCase.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null, deletedBy: null },
  });
  audit('RESTORE', { type: 'TestCase', id }, { by: actingUserId, projectId });
  return toSummary(updated);
}

/** Deleted test cases for a project (flat, for the restore view). */
export async function listDeletedTestCases(projectId: string): Promise<TestCaseSummary[]> {
  const rows = await prisma.testCase.findMany({
    where: { projectId, isDeleted: true },
    orderBy: { title: 'asc' },
  });
  return rows.map(toSummary);
}
