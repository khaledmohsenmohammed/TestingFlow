import { api } from './client';

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  isDeleted: boolean;
  createdAt: string;
  // Direct, non-deleted test cases in this folder (subtree total computed client-side).
  testCount: number;
  children: FolderNode[];
}

/** A soft-deleted folder (flat, for the restore view). */
export interface DeletedFolder {
  id: string;
  name: string;
  parentId: string | null;
  isDeleted: boolean;
  createdAt: string;
}

export interface FolderTreeResult {
  tree: FolderNode[];
  canManage: boolean;
}

export interface DeletedFoldersResult {
  folders: DeletedFolder[];
  canManage: boolean;
}

export async function listFolderTree(projectId: string): Promise<FolderTreeResult> {
  const res = await api.get(`/projects/${projectId}/folders`);
  return { tree: res.data.tree, canManage: res.data.canManage };
}

export async function listDeletedFolders(projectId: string): Promise<DeletedFoldersResult> {
  const res = await api.get(`/projects/${projectId}/folders`, { params: { deleted: 'true' } });
  return { folders: res.data.folders, canManage: res.data.canManage };
}

export async function createFolder(
  projectId: string,
  input: { name: string; parentId?: string | null },
): Promise<FolderNode> {
  const res = await api.post(`/projects/${projectId}/folders`, input);
  return res.data.folder;
}

export async function renameFolder(
  projectId: string,
  id: string,
  name: string,
): Promise<FolderNode> {
  const res = await api.patch(`/projects/${projectId}/folders/${id}`, { name });
  return res.data.folder;
}

export async function moveFolder(
  projectId: string,
  id: string,
  parentId: string | null,
): Promise<FolderNode> {
  const res = await api.post(`/projects/${projectId}/folders/${id}/move`, { parentId });
  return res.data.folder;
}

export async function deleteFolder(projectId: string, id: string): Promise<{ deletedCount: number }> {
  const res = await api.delete(`/projects/${projectId}/folders/${id}`);
  return res.data;
}

export async function restoreFolder(
  projectId: string,
  id: string,
  cascade = false,
): Promise<{ restoredCount: number }> {
  const res = await api.post(`/projects/${projectId}/folders/${id}/restore`, null, {
    params: cascade ? { cascade: 'true' } : {},
  });
  return res.data;
}
