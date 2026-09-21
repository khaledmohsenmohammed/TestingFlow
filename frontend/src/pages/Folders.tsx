import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  Link as MuiLink,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { z } from 'zod';
import { getApiErrorMessage } from '../api/client';
import {
  createFolder,
  deleteFolder,
  listDeletedFolders,
  listFolderTree,
  moveFolder,
  renameFolder,
  restoreFolder,
  type FolderNode,
} from '../api/folders';
import {
  deleteTestCase,
  listDeletedTestCases,
  listFolderTestCases,
  moveTestCase,
  restoreTestCase,
  type TestCase,
} from '../api/testcases';
import { TestCaseDialog } from './TestCaseDialog';

const ROOT = '__root__';
type Toast = { msg: string; severity: 'success' | 'error' };
type ContextMenu = { folder: FolderNode; x: number; y: number } | null;

const ExpandIcon = () => <Box component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>▸</Box>;
const CollapseIcon = () => <Box component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>▾</Box>;

const nameSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
});
type NameForm = z.infer<typeof nameSchema>;

interface TreeIndex {
  byId: Map<string, FolderNode>;
  parentOf: Map<string, string | null>;
}

function indexTree(tree: FolderNode[]): TreeIndex {
  const byId = new Map<string, FolderNode>();
  const parentOf = new Map<string, string | null>();
  const walk = (nodes: FolderNode[], parent: string | null) => {
    for (const n of nodes) {
      byId.set(n.id, n);
      parentOf.set(n.id, parent);
      walk(n.children, n.id);
    }
  };
  walk(tree, null);
  return { byId, parentOf };
}

/** Xray-style `direct (total-in-subtree)` count label. */
function countLabel(direct: number, total: number): string {
  return `${direct} (${total})`;
}

/** Total test cases in a folder's whole subtree (including itself). */
function subtreeTestCount(node: FolderNode): number {
  return node.testCount + node.children.reduce((a, c) => a + subtreeTestCount(c), 0);
}

function flatten(nodes: FolderNode[], excludeId?: string, depth = 0): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = [];
  for (const n of nodes) {
    if (n.id === excludeId) continue;
    out.push({ id: n.id, name: n.name, depth });
    out.push(...flatten(n.children, excludeId, depth + 1));
  }
  return out;
}

export default function Folders() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();

  const [view, setView] = useState<'REPO' | 'DELETED'>('REPO');
  const [selectedId, setSelectedId] = useState<string>(ROOT);
  const [expanded, setExpanded] = useState<string[]>([ROOT]);
  const [menu, setMenu] = useState<ContextMenu>(null);
  const [overflowEl, setOverflowEl] = useState<null | HTMLElement>(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);

  const [createUnder, setCreateUnder] = useState<{ parentId: string | null } | null>(null);
  const [renameTarget, setRenameTarget] = useState<FolderNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<FolderNode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FolderNode | null>(null);

  // Test-case dialogs
  const [tcDialog, setTcDialog] = useState<
    { kind: 'create'; folderId: string } | { kind: 'edit'; id: string } | null
  >(null);
  const [tcMove, setTcMove] = useState<TestCase | null>(null);
  const [tcDelete, setTcDelete] = useState<TestCase | null>(null);

  const onError = (err: unknown) => setToast({ msg: getApiErrorMessage(err), severity: 'error' });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['folders', projectId] });
  const invalidateTestCases = () => {
    void queryClient.invalidateQueries({ queryKey: ['testcases'] });
    invalidate(); // refresh the tree's test counts
  };

  const { data: active, isLoading, isError, error } = useQuery({
    queryKey: ['folders', projectId, 'tree'],
    queryFn: () => listFolderTree(projectId!),
    enabled: !!projectId,
  });
  const { data: deletedData } = useQuery({
    queryKey: ['folders', projectId, 'deleted'],
    queryFn: () => listDeletedFolders(projectId!),
    enabled: !!projectId && view === 'DELETED',
  });

  const tree = active?.tree ?? [];
  const canManage = active?.canManage ?? false;
  const { byId, parentOf } = useMemo(() => indexTree(tree), [tree]);

  // Expand the whole tree on first load (Xray shows the hierarchy expanded).
  const didInit = useRef(false);
  useEffect(() => {
    if (!didInit.current && tree.length > 0) {
      didInit.current = true;
      setExpanded([ROOT, ...byId.keys()]);
    }
  }, [tree, byId]);

  // Selecting a folder also expands it, so its children are visible in the tree.
  const selectFolder = (id: string) => {
    setSelectedId(id);
    if (id !== ROOT) setExpanded((e) => (e.includes(id) ? e : [...e, id]));
  };

  const selectedFolder = selectedId === ROOT ? null : byId.get(selectedId) ?? null;

  // Test cases of the selected folder (none at the virtual root).
  const { data: testCases = [], isLoading: tcLoading } = useQuery({
    queryKey: ['testcases', selectedFolder?.id],
    queryFn: () => listFolderTestCases(selectedFolder!.id),
    enabled: !!selectedFolder,
  });
  const { data: deletedCases = [] } = useQuery({
    queryKey: ['testcases', 'deleted', projectId],
    queryFn: () => listDeletedTestCases(projectId!),
    enabled: !!projectId && view === 'DELETED',
  });

  const path = useMemo(() => {
    const out: { id: string; name: string }[] = [];
    let cur: string | null = selectedFolder?.id ?? null;
    while (cur) {
      const node = byId.get(cur);
      if (!node) break;
      out.unshift({ id: node.id, name: node.name });
      cur = parentOf.get(cur) ?? null;
    }
    return out;
  }, [selectedFolder, byId, parentOf]);

  const contents = selectedId === ROOT ? tree : selectedFolder?.children ?? [];
  const q = search.trim().toLowerCase();
  const filtered = contents.filter((c) => c.name.toLowerCase().includes(q));
  const filteredCases = testCases.filter((t) => t.title.toLowerCase().includes(q));

  const remove = useMutation({
    mutationFn: (id: string) => deleteFolder(projectId!, id),
    onSuccess: () => {
      invalidate();
      if (confirmDelete?.id === selectedId) setSelectedId(ROOT);
      setToast({ msg: 'Folder deleted', severity: 'success' });
    },
    onError,
  });
  const restore = useMutation({
    mutationFn: (id: string) => restoreFolder(projectId!, id),
    onSuccess: () => {
      invalidate();
      setToast({ msg: 'Folder restored', severity: 'success' });
    },
    onError,
  });
  const busy = remove.isPending || restore.isPending;

  const removeCase = useMutation({
    mutationFn: (id: string) => deleteTestCase(id),
    onSuccess: () => {
      invalidateTestCases();
      setToast({ msg: 'Test case deleted', severity: 'success' });
    },
    onError,
  });
  const restoreCase = useMutation({
    mutationFn: (id: string) => restoreTestCase(id),
    onSuccess: () => {
      invalidateTestCases();
      setToast({ msg: 'Test case restored', severity: 'success' });
    },
    onError,
  });

  const createUnderSelected = () => setCreateUnder({ parentId: selectedFolder?.id ?? null });

  function renderNode(node: FolderNode) {
    const isSel = node.id === selectedId;
    const open = expanded.includes(node.id) && node.children.length > 0;
    return (
      <TreeItem
        key={node.id}
        itemId={node.id}
        label={
          <Box
            onContextMenu={(e) => {
              if (!canManage) return;
              e.preventDefault();
              e.stopPropagation();
              setMenu({ folder: node, x: e.clientX, y: e.clientY });
            }}
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.6, pr: 1 }}
          >
            <Typography
              component="span"
              noWrap
              sx={{ color: isSel ? 'primary.main' : 'text.primary', fontWeight: isSel ? 600 : 400 }}
            >
              {open ? '📂' : '📁'} {node.name}
            </Typography>
            <Typography component="span" variant="body2" sx={{ color: 'text.secondary', ml: 1, whiteSpace: 'nowrap' }}>
              {countLabel(node.testCount, subtreeTestCount(node))}
            </Typography>
          </Box>
        }
      >
        {node.children.map(renderNode)}
      </TreeItem>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Button size="small" component={RouterLink} to="/admin/projects">
          ← Projects
        </Button>
      </Stack>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <Alert severity="error">{getApiErrorMessage(error, 'Failed to load folders')}</Alert>
      ) : (
        <Paper variant="outlined" sx={{ display: 'flex', minHeight: 520, overflow: 'hidden' }}>
          {/* ── Left: folder tree ───────────────────────────── */}
          <Box sx={{ width: 340, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
            {/* Icon toolbar */}
            <Stack
              direction="row"
              justifyContent="flex-end"
              alignItems="center"
              spacing={0.5}
              sx={{ px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', minHeight: 44 }}
            >
              {canManage && (
                <Tooltip title={selectedFolder ? 'Add subfolder' : 'Add folder'}>
                  <IconButton size="small" color="primary" onClick={createUnderSelected}>
                    <Box component="span" sx={{ fontSize: 20, lineHeight: 1, fontWeight: 600 }}>＋</Box>
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Collapse all">
                <IconButton size="small" onClick={() => setExpanded([ROOT])}>
                  <Box component="span" sx={{ fontSize: 16, lineHeight: 1 }}>⊟</Box>
                </IconButton>
              </Tooltip>
              <Tooltip title="More actions">
                <IconButton size="small" onClick={(e) => setOverflowEl(e.currentTarget)}>
                  <Box component="span" sx={{ fontSize: 18, lineHeight: 1 }}>⋮</Box>
                </IconButton>
              </Tooltip>
            </Stack>

            <Box sx={{ flex: 1, overflow: 'auto', py: 1 }}>
              <SimpleTreeView
                slots={{ expandIcon: ExpandIcon, collapseIcon: CollapseIcon }}
                expansionTrigger="iconContainer"
                selectedItems={selectedId}
                onSelectedItemsChange={(_e, id) => id && setSelectedId(id)}
                expandedItems={expanded}
                onExpandedItemsChange={(_e, ids) => setExpanded(ids)}
              >
                <TreeItem
                  itemId={ROOT}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.6, pr: 1 }}>
                      <Typography
                        component="span"
                        noWrap
                        sx={{ color: selectedId === ROOT ? 'primary.main' : 'text.primary', fontWeight: 600 }}
                      >
                        {expanded.includes(ROOT) ? '📂' : '📁'} Test Repository
                      </Typography>
                      <Typography component="span" variant="body2" sx={{ color: 'text.secondary', ml: 1, whiteSpace: 'nowrap' }}>
                        {countLabel(0, tree.reduce((a, n) => a + subtreeTestCount(n), 0))}
                      </Typography>
                    </Box>
                  }
                >
                  {tree.map(renderNode)}
                </TreeItem>
              </SimpleTreeView>
            </Box>
          </Box>

          {/* ── Right: contents view ────────────────────────── */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Header: breadcrumb/title + FOLDERS VIEW badge */}
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
            >
              <MuiLink
                component="button"
                underline="hover"
                onClick={() => setSelectedId(ROOT)}
                sx={{ color: 'primary.main', fontWeight: 600, fontSize: '1.05rem' }}
              >
                {selectedFolder ? selectedFolder.name : 'Test Repository'}
              </MuiLink>
              <Chip label="FOLDERS VIEW" size="small" variant="outlined" sx={{ fontWeight: 600, letterSpacing: 0.5 }} />
            </Stack>

            {view === 'DELETED' ? (
              <DeletedPanel
                folders={deletedData?.folders ?? []}
                cases={deletedCases}
                canManage={canManage}
                busy={busy || restoreCase.isPending}
                onBack={() => setView('REPO')}
                onRestore={(id) => restore.mutate(id)}
                onRestoreCase={(id) => restoreCase.mutate(id)}
              />
            ) : (
              <>
                {/* Search + filter bar */}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2, py: 1.5 }}>
                  <TextField
                    size="small"
                    placeholder="Search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{ width: 280 }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Box component="span" sx={{ color: 'text.secondary' }}>🔍</Box>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Button size="small" variant="outlined" color="inherit" disabled>
                    Filters ▾
                  </Button>
                  {canManage && selectedFolder && (
                    <Button size="small" variant="contained" sx={{ ml: 'auto' }} onClick={() => setTcDialog({ kind: 'create', folderId: selectedFolder.id })}>
                      + Test case
                    </Button>
                  )}
                </Stack>

                {/* Breadcrumb path (when not at root) */}
                {path.length > 0 && (
                  <Box sx={{ px: 2, pb: 1 }}>
                    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                      <MuiLink component="button" underline="hover" color="inherit" onClick={() => setSelectedId(ROOT)}>
                        Test Repository
                      </MuiLink>
                      {path.map((p, i) => (
                        <Box key={p.id} sx={{ display: 'flex', alignItems: 'center' }}>
                          <Box component="span" sx={{ mx: 0.5, color: 'text.disabled' }}>/</Box>
                          <MuiLink
                            component="button"
                            underline="hover"
                            color={i === path.length - 1 ? 'text.primary' : 'inherit'}
                            onClick={() => selectFolder(p.id)}
                          >
                            {p.name}
                          </MuiLink>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}

                {/* Subfolder quick-nav chips (when a folder with subfolders is selected) */}
                {selectedFolder && selectedFolder.children.length > 0 && (
                  <Box sx={{ px: 2, pb: 1 }}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {selectedFolder.children.map((c) => (
                        <Chip
                          key={c.id}
                          label={`📁 ${c.name}`}
                          size="small"
                          variant="outlined"
                          onClick={() => selectFolder(c.id)}
                        />
                      ))}
                    </Stack>
                  </Box>
                )}

                {!selectedFolder ? (
                  // Root: no direct test cases — show subfolders to drill into.
                  <>
                    <Stack direction="row" justifyContent="space-between" sx={{ px: 2, pb: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Showing {filtered.length} of {contents.length} {contents.length === 1 ? 'folder' : 'folders'}
                      </Typography>
                      <Typography variant="body2" color="text.disabled">
                        Select a folder to view its test cases
                      </Typography>
                    </Stack>
                    <Divider />
                    <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
                      {filtered.length === 0 ? (
                        <Box sx={{ p: 6, textAlign: 'center' }}>
                          <Typography color="text.secondary">
                            {contents.length === 0
                              ? `No folders yet.${canManage ? ' Use ＋ to add one.' : ''}`
                              : 'No folders match your search.'}
                          </Typography>
                        </Box>
                      ) : (
                        <Stack spacing={1}>
                          {filtered.map((c) => (
                            <Paper
                              key={c.id}
                              variant="outlined"
                              onClick={() => selectFolder(c.id)}
                              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, cursor: 'pointer', borderLeft: 4, borderLeftColor: 'primary.main', '&:hover': { bgcolor: 'action.hover' } }}
                            >
                              <Stack direction="row" spacing={1.5} alignItems="center">
                                <Box component="span" sx={{ fontSize: 18 }}>📁</Box>
                                <Box>
                                  <Typography fontWeight={500}>{c.name}</Typography>
                                  <Chip label="FOLDER" size="small" sx={{ height: 18, fontSize: 11, mt: 0.5 }} />
                                </Box>
                              </Stack>
                              <Typography variant="body2" color="text.secondary">
                                {countLabel(c.testCount, subtreeTestCount(c))}
                              </Typography>
                            </Paper>
                          ))}
                        </Stack>
                      )}
                    </Box>
                  </>
                ) : (
                  // Folder selected: test cases primary.
                  <>
                    <Stack direction="row" justifyContent="space-between" sx={{ px: 2, pb: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Showing {filteredCases.length} of {testCases.length} test {testCases.length === 1 ? 'case' : 'cases'}
                      </Typography>
                    </Stack>
                    <Divider />
                    <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
                      {tcLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                          <CircularProgress />
                        </Box>
                      ) : filteredCases.length === 0 ? (
                        <Box sx={{ p: 6, textAlign: 'center' }}>
                          <Typography color="text.secondary">
                            {testCases.length === 0
                              ? `No test cases in this folder.${canManage ? ' Use “+ Test case” to add one.' : ''}`
                              : 'No test cases match your search.'}
                          </Typography>
                        </Box>
                      ) : (
                        <Stack spacing={1}>
                          {filteredCases.map((tc) => (
                            <Paper
                              key={tc.id}
                              variant="outlined"
                              onClick={() => setTcDialog({ kind: 'edit', id: tc.id })}
                              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, cursor: 'pointer', borderLeft: 4, borderLeftColor: tc.type === 'AUTOMATION' ? 'success.main' : 'info.main', '&:hover': { bgcolor: 'action.hover' } }}
                            >
                              <Stack direction="row" spacing={1.5} alignItems="center">
                                <Box component="span" sx={{ fontSize: 18 }}>📄</Box>
                                <Box>
                                  <Typography fontWeight={500}>{tc.title}</Typography>
                                  <Chip label={tc.type} size="small" sx={{ height: 18, fontSize: 11, mt: 0.5 }} />
                                </Box>
                              </Stack>
                              {canManage && (
                                <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                                  <Button size="small" onClick={() => setTcMove(tc)}>Move</Button>
                                  <Button size="small" color="error" onClick={() => setTcDelete(tc)}>Delete</Button>
                                </Stack>
                              )}
                            </Paper>
                          ))}
                        </Stack>
                      )}
                    </Box>
                  </>
                )}
              </>
            )}
          </Box>
        </Paper>
      )}

      {/* Left-pane overflow (⋮) menu */}
      <Menu anchorEl={overflowEl} open={!!overflowEl} onClose={() => setOverflowEl(null)}>
        {canManage && (
          <MenuItem
            disabled={!selectedFolder}
            onClick={() => {
              if (selectedFolder) setRenameTarget(selectedFolder);
              setOverflowEl(null);
            }}
          >
            Rename folder
          </MenuItem>
        )}
        {canManage && (
          <MenuItem
            disabled={!selectedFolder}
            onClick={() => {
              if (selectedFolder) setMoveTarget(selectedFolder);
              setOverflowEl(null);
            }}
          >
            Move folder
          </MenuItem>
        )}
        {canManage && (
          <MenuItem
            disabled={!selectedFolder}
            sx={{ color: 'error.main' }}
            onClick={() => {
              if (selectedFolder) setConfirmDelete(selectedFolder);
              setOverflowEl(null);
            }}
          >
            Delete folder
          </MenuItem>
        )}
        {canManage && <Divider />}
        <MenuItem
          onClick={() => {
            setView((v) => (v === 'DELETED' ? 'REPO' : 'DELETED'));
            setOverflowEl(null);
          }}
        >
          {view === 'DELETED' ? 'Back to repository' : 'View deleted items'}
        </MenuItem>
      </Menu>

      {/* Right-click context menu */}
      <Menu
        open={!!menu}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
      >
        <MenuItem onClick={() => { setCreateUnder({ parentId: menu!.folder.id }); setMenu(null); }}>
          Add subfolder
        </MenuItem>
        <MenuItem onClick={() => { setRenameTarget(menu!.folder); setMenu(null); }}>Rename</MenuItem>
        <MenuItem onClick={() => { setMoveTarget(menu!.folder); setMenu(null); }}>Move</MenuItem>
        <Divider />
        <MenuItem sx={{ color: 'error.main' }} onClick={() => { setConfirmDelete(menu!.folder); setMenu(null); }}>
          Delete
        </MenuItem>
      </Menu>

      {createUnder && (
        <NameDialog
          title={createUnder.parentId ? 'New subfolder' : 'New folder'}
          submitLabel="Create"
          onClose={() => setCreateUnder(null)}
          onSubmit={(name) => createFolder(projectId!, { name, parentId: createUnder.parentId })}
          onSaved={() => {
            invalidate();
            if (createUnder.parentId) {
              setExpanded((e) => (e.includes(createUnder.parentId!) ? e : [...e, createUnder.parentId!]));
            }
            setCreateUnder(null);
            setToast({ msg: 'Folder created', severity: 'success' });
          }}
          onError={onError}
        />
      )}

      {renameTarget && (
        <NameDialog
          title="Rename folder"
          submitLabel="Save"
          defaultValue={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          onSubmit={(name) => renameFolder(projectId!, renameTarget.id, name)}
          onSaved={() => {
            invalidate();
            setRenameTarget(null);
            setToast({ msg: 'Folder renamed', severity: 'success' });
          }}
          onError={onError}
        />
      )}

      {moveTarget && (
        <MoveDialog
          folder={moveTarget}
          options={flatten(tree, moveTarget.id)}
          onClose={() => setMoveTarget(null)}
          onSubmit={(parentId) => moveFolder(projectId!, moveTarget.id, parentId)}
          onSaved={() => {
            invalidate();
            setMoveTarget(null);
            setToast({ msg: 'Folder moved', severity: 'success' });
          }}
          onError={onError}
        />
      )}

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        {confirmDelete && (
          <>
            <DialogTitle>Delete folder</DialogTitle>
            <DialogContent>
              <DialogContentText>
                Delete {confirmDelete.name}? Any subfolders are deleted too. They move to the
                Deleted view and can be restored.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button
                color="error"
                variant="contained"
                onClick={() => {
                  remove.mutate(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                Delete
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Test-case create / edit / view */}
      {tcDialog && (
        <TestCaseDialog
          mode={tcDialog}
          canManage={canManage}
          onClose={() => setTcDialog(null)}
          onSaved={(msg) => {
            invalidateTestCases();
            setTcDialog(null);
            setToast({ msg, severity: 'success' });
          }}
          onError={onError}
        />
      )}

      {/* Move a test case to another folder */}
      {tcMove && (
        <CaseMoveDialog
          testCase={tcMove}
          options={flatten(tree)}
          onClose={() => setTcMove(null)}
          onSubmit={(folderId) => moveTestCase(tcMove.id, folderId)}
          onSaved={() => {
            invalidateTestCases();
            setTcMove(null);
            setToast({ msg: 'Test case moved', severity: 'success' });
          }}
          onError={onError}
        />
      )}

      {/* Delete a test case */}
      <Dialog open={!!tcDelete} onClose={() => setTcDelete(null)}>
        {tcDelete && (
          <>
            <DialogTitle>Delete test case</DialogTitle>
            <DialogContent>
              <DialogContentText>
                Delete “{tcDelete.title}”? It moves to the Deleted view and can be restored.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setTcDelete(null)}>Cancel</Button>
              <Button
                color="error"
                variant="contained"
                onClick={() => {
                  removeCase.mutate(tcDelete.id);
                  setTcDelete(null);
                }}
              >
                Delete
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)}>
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

function DeletedPanel({
  folders,
  cases,
  canManage,
  busy,
  onBack,
  onRestore,
  onRestoreCase,
}: {
  folders: { id: string; name: string }[];
  cases: { id: string; title: string }[];
  canManage: boolean;
  busy: boolean;
  onBack: () => void;
  onRestore: (id: string) => void;
  onRestoreCase: (id: string) => void;
}) {
  const empty = folders.length === 0 && cases.length === 0;
  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Deleted items
        </Typography>
        <Button size="small" onClick={onBack}>
          ← Back to repository
        </Button>
      </Stack>
      <Divider sx={{ mb: 1 }} />
      {empty ? (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">Nothing deleted.</Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {folders.map((f) => (
            <Paper
              key={f.id}
              variant="outlined"
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1 }}
            >
              <Typography component="span" color="text.secondary">
                🗑 📁 {f.name}
              </Typography>
              {canManage && (
                <Button size="small" disabled={busy} onClick={() => onRestore(f.id)}>
                  Restore
                </Button>
              )}
            </Paper>
          ))}
          {cases.map((c) => (
            <Paper
              key={c.id}
              variant="outlined"
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1 }}
            >
              <Typography component="span" color="text.secondary">
                🗑 📄 {c.title}
              </Typography>
              {canManage && (
                <Button size="small" disabled={busy} onClick={() => onRestoreCase(c.id)}>
                  Restore
                </Button>
              )}
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}

/** Shared create/rename dialog (single text field + zod validation). */
function NameDialog({
  title,
  submitLabel,
  defaultValue = '',
  onClose,
  onSubmit,
  onSaved,
  onError,
}: {
  title: string;
  submitLabel: string;
  defaultValue?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<unknown>;
  onSaved: () => void;
  onError: (err: unknown) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NameForm>({ resolver: zodResolver(nameSchema), defaultValues: { name: defaultValue } });

  const mutation = useMutation({
    mutationFn: (values: NameForm) => onSubmit(values.name),
    onSuccess: onSaved,
    onError,
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <Box component="form" onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Name"
            {...register('name')}
            error={!!errors.name}
            helperText={errors.name?.message}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {submitLabel}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/** Move dialog: pick a new parent (or root) from the flattened tree. */
function MoveDialog({
  folder,
  options,
  onClose,
  onSubmit,
  onSaved,
  onError,
}: {
  folder: FolderNode;
  options: { id: string; name: string; depth: number }[];
  onClose: () => void;
  onSubmit: (parentId: string | null) => Promise<unknown>;
  onSaved: () => void;
  onError: (err: unknown) => void;
}) {
  const [parentId, setParentId] = useState<string>(folder.parentId ?? '');

  const mutation = useMutation({
    mutationFn: () => onSubmit(parentId === '' ? null : parentId),
    onSuccess: onSaved,
    onError,
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Move {folder.name}</DialogTitle>
      <DialogContent>
        <FormControl fullWidth margin="dense">
          <InputLabel id="move-parent">New parent</InputLabel>
          <Select
            labelId="move-parent"
            label="New parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <MenuItem value="">(Repository root)</MenuItem>
            {options.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                {'  '.repeat(o.depth)}
                {o.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          Move
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Move a test case to another folder (a folder is required — no root option). */
function CaseMoveDialog({
  testCase,
  options,
  onClose,
  onSubmit,
  onSaved,
  onError,
}: {
  testCase: TestCase;
  options: { id: string; name: string; depth: number }[];
  onClose: () => void;
  onSubmit: (folderId: string) => Promise<unknown>;
  onSaved: () => void;
  onError: (err: unknown) => void;
}) {
  const [folderId, setFolderId] = useState<string>(testCase.folderId);

  const mutation = useMutation({
    mutationFn: () => onSubmit(folderId),
    onSuccess: onSaved,
    onError,
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Move “{testCase.title}”</DialogTitle>
      <DialogContent>
        <FormControl fullWidth margin="dense">
          <InputLabel id="case-move-folder">Destination folder</InputLabel>
          <Select
            labelId="case-move-folder"
            label="Destination folder"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          >
            {options.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                {'  '.repeat(o.depth)}
                {o.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={mutation.isPending || folderId === testCase.folderId}
          onClick={() => mutation.mutate()}
        >
          Move
        </Button>
      </DialogActions>
    </Dialog>
  );
}
