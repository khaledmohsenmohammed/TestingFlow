import type { Folder, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import type { CreateFolderInput } from '../routes/folders.schemas.js';

export interface FolderSummary {
  id: string;
  name: string;
  parentId: string | null;
  isDeleted: boolean;
  createdAt: Date;
  // Direct, non-deleted test cases in this folder. The client sums over a
  // subtree to show Xray's "direct (total)" count.
  testCount: number;
}

export interface FolderNode extends FolderSummary {
  children: FolderNode[];
}

function toFolderSummary(folder: Folder, testCount = 0): FolderSummary {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    isDeleted: folder.isDeleted,
    createdAt: folder.createdAt,
    testCount,
  };
}

/** Loads an active (non-deleted) folder in the given project or throws 404. */
async function loadActiveFolder(projectId: string, id: string): Promise<Folder> {
  const folder = await prisma.folder.findUnique({ where: { id } });
  if (!folder || folder.isDeleted || folder.projectId !== projectId) {
    throw ApiError.notFound('Folder not found');
  }
  return folder;
}

/** Validates that a prospective parent is active and in the same project. */
async function loadActiveParent(projectId: string, parentId: string): Promise<Folder> {
  const parent = await prisma.folder.findUnique({ where: { id: parentId } });
  if (!parent || parent.isDeleted) {
    throw ApiError.notFound('Parent folder not found');
  }
  if (parent.projectId !== projectId) {
    throw ApiError.badRequest('Parent folder belongs to a different project');
  }
  return parent;
}

/** Builds a nested tree (roots with children[]) from a flat list of folders. */
function buildTree(rows: Folder[], testCounts: Map<string, number>): FolderNode[] {
  const byId = new Map<string, FolderNode>();
  for (const f of rows) {
    byId.set(f.id, { ...toFolderSummary(f, testCounts.get(f.id) ?? 0), children: [] });
  }
  const roots: FolderNode[] = [];
  for (const f of rows) {
    const node = byId.get(f.id)!;
    // If the parent isn't in this set (filtered out), surface the node as a root
    // so nothing silently disappears from the response.
    if (f.parentId && byId.has(f.parentId)) {
      byId.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export interface ListFoldersParams {
  deleted?: boolean;
}

/**
 * Active folders are returned as a nested `tree`. Deleted folders are returned
 * as a flat `folders` list (for the restore view), mirroring the projects page.
 */
export async function listFolders(
  projectId: string,
  params: ListFoldersParams,
): Promise<{ tree: FolderNode[] } | { folders: FolderSummary[] }> {
  const rows = await prisma.folder.findMany({
    where: { projectId, isDeleted: params.deleted ?? false },
    orderBy: [{ name: 'asc' }],
  });
  if (params.deleted) {
    return { folders: rows.map((f) => toFolderSummary(f)) };
  }
  // One aggregate query for direct, non-deleted test-case counts per folder.
  const grouped = await prisma.testCase.groupBy({
    by: ['folderId'],
    where: { projectId, isDeleted: false },
    _count: { _all: true },
  });
  const testCounts = new Map(grouped.map((g) => [g.folderId, g._count._all]));
  return { tree: buildTree(rows, testCounts) };
}

export async function createFolder(
  actingUserId: string,
  projectId: string,
  input: CreateFolderInput,
): Promise<FolderSummary> {
  if (input.parentId) {
    await loadActiveParent(projectId, input.parentId);
  }
  const folder = await prisma.folder.create({
    data: {
      name: input.name,
      projectId,
      parentId: input.parentId ?? null,
      createdBy: actingUserId,
    },
  });
  audit('CREATE_FOLDER', { type: 'Folder', id: folder.id }, { by: actingUserId, projectId });
  return toFolderSummary(folder);
}

export async function renameFolder(
  actingUserId: string,
  projectId: string,
  id: string,
  name: string,
): Promise<FolderSummary> {
  await loadActiveFolder(projectId, id);
  const updated = await prisma.folder.update({ where: { id }, data: { name } });
  audit('UPDATE_FOLDER', { type: 'Folder', id }, { by: actingUserId, projectId, fields: ['name'] });
  return toFolderSummary(updated);
}

/** Walks ancestors of `newParentId`; true if `folderId` is encountered (a cycle). */
async function wouldCreateCycle(folderId: string, newParentId: string): Promise<boolean> {
  let cursor: string | null = newParentId;
  let guard = 0;
  while (cursor) {
    if (cursor === folderId) return true;
    if (++guard > 1000) {
      throw ApiError.conflict('Folder hierarchy too deep or corrupt');
    }
    const node: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = node?.parentId ?? null;
  }
  return false;
}

export async function moveFolder(
  actingUserId: string,
  projectId: string,
  folderId: string,
  newParentId: string | null,
): Promise<FolderSummary> {
  await loadActiveFolder(projectId, folderId);

  if (newParentId !== null) {
    if (newParentId === folderId) {
      throw ApiError.badRequest('A folder cannot be its own parent');
    }
    await loadActiveParent(projectId, newParentId);
    if (await wouldCreateCycle(folderId, newParentId)) {
      throw ApiError.conflict('Cannot move a folder into its own descendant');
    }
  }

  const updated = await prisma.folder.update({
    where: { id: folderId },
    data: { parentId: newParentId },
  });
  audit('MOVE_FOLDER', { type: 'Folder', id: folderId }, { by: actingUserId, projectId, newParentId });
  return toFolderSummary(updated);
}

/**
 * Collects a folder + all its descendants by walking the tree level-by-level.
 * `activeOnly` selects which rows to traverse: true for delete (active subtree),
 * false for restore (deleted subtree).
 */
async function collectSubtreeIds(
  tx: Prisma.TransactionClient,
  projectId: string,
  rootId: string,
  activeOnly: boolean,
): Promise<string[]> {
  const ids = [rootId];
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await tx.folder.findMany({
      where: { projectId, parentId: { in: frontier }, isDeleted: !activeOnly },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
    ids.push(...frontier);
  }
  return ids;
}

export async function softDeleteFolder(
  actingUserId: string,
  projectId: string,
  folderId: string,
): Promise<{ deletedCount: number }> {
  await loadActiveFolder(projectId, folderId);
  const deletedCount = await prisma.$transaction(async (tx) => {
    const ids = await collectSubtreeIds(tx, projectId, folderId, true);
    await tx.folder.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: actingUserId },
    });
    return ids.length;
  });
  audit('DELETE', { type: 'Folder', id: folderId }, { by: actingUserId, projectId, cascadedCount: deletedCount - 1 });
  return { deletedCount };
}

export async function restoreFolder(
  actingUserId: string,
  projectId: string,
  folderId: string,
  cascade: boolean,
): Promise<{ restoredCount: number }> {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.projectId !== projectId) {
    throw ApiError.notFound('Folder not found');
  }
  // The parent it re-attaches to must be active (or it's a root).
  if (folder.parentId) {
    const parent = await prisma.folder.findUnique({ where: { id: folder.parentId } });
    if (!parent || parent.isDeleted) {
      throw ApiError.conflict('Parent folder is deleted; restore it first');
    }
  }

  const restoredCount = await prisma.$transaction(async (tx) => {
    const ids = cascade
      ? await collectSubtreeIds(tx, projectId, folderId, false)
      : [folderId];
    await tx.folder.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: false, deletedAt: null, deletedBy: null },
    });
    return ids.length;
  });
  audit('RESTORE', { type: 'Folder', id: folderId }, { by: actingUserId, projectId, cascade });
  return { restoredCount };
}
