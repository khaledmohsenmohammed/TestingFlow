import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  createTestCase,
  getTestCase,
  updateTestCase,
  type TestCaseInput,
  type TestCaseType,
  type TestStep,
} from '../api/testcases';

type Mode = { kind: 'create'; folderId: string } | { kind: 'edit'; id: string };

/**
 * Create / edit a test case: title, description, type, playwrightRef (when
 * AUTOMATION), and an ordered steps editor (add / remove / reorder).
 * `canManage === false` renders a read-only view.
 */
export function TestCaseDialog({
  mode,
  canManage,
  onClose,
  onSaved,
  onError,
}: {
  mode: Mode;
  canManage: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (err: unknown) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TestCaseType>('MANUAL');
  const [playwrightRef, setPlaywrightRef] = useState('');
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [loading, setLoading] = useState(mode.kind === 'edit');
  const [titleError, setTitleError] = useState(false);
  const readOnly = !canManage;

  useEffect(() => {
    if (mode.kind === 'edit') {
      getTestCase(mode.id)
        .then((tc) => {
          setTitle(tc.title);
          setDescription(tc.description ?? '');
          setType(tc.type);
          setPlaywrightRef(tc.playwrightRef ?? '');
          setSteps(tc.steps);
        })
        .catch(onError)
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useMutation({
    mutationFn: () => {
      const input: TestCaseInput = {
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        playwrightRef: playwrightRef.trim() || undefined,
        steps: steps
          .map((s) => ({ action: s.action.trim(), expected: s.expected.trim() }))
          .filter((s) => s.action && s.expected),
      };
      return mode.kind === 'create' ? createTestCase(mode.folderId, input) : updateTestCase(mode.id, input);
    },
    onSuccess: () => onSaved(mode.kind === 'create' ? 'Test case created' : 'Test case saved'),
    onError,
  });

  const submit = () => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    save.mutate();
  };

  const setStep = (i: number, patch: Partial<TestStep>) =>
    setSteps((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const removeStep = (i: number) => setSteps((arr) => arr.filter((_, idx) => idx !== i));
  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps((arr) => {
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {mode.kind === 'create' ? 'New test case' : readOnly ? 'Test case' : 'Edit test case'}
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Typography color="text.secondary">Loading…</Typography>
        ) : (
          <Stack spacing={2}>
            <TextField
              label="Title"
              required
              fullWidth
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleError(false);
              }}
              error={titleError}
              helperText={titleError ? 'Title is required' : undefined}
              InputProps={{ readOnly }}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              minRows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              InputProps={{ readOnly }}
            />
            <Stack direction="row" spacing={2}>
              <FormControl sx={{ minWidth: 180 }}>
                <InputLabel id="tc-type">Type</InputLabel>
                <Select
                  labelId="tc-type"
                  label="Type"
                  value={type}
                  onChange={(e) => setType(e.target.value as TestCaseType)}
                  readOnly={readOnly}
                >
                  <MenuItem value="MANUAL">Manual</MenuItem>
                  <MenuItem value="AUTOMATION">Automation</MenuItem>
                </Select>
              </FormControl>
              {type === 'AUTOMATION' && (
                <TextField
                  label="Playwright reference"
                  fullWidth
                  value={playwrightRef}
                  onChange={(e) => setPlaywrightRef(e.target.value)}
                  placeholder="e.g. tests/login.spec.ts:42"
                  InputProps={{ readOnly }}
                />
              )}
            </Stack>

            <Divider textAlign="left">
              <Typography variant="overline" color="text.secondary">
                Steps
              </Typography>
            </Divider>
            {steps.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No steps{readOnly ? '.' : ' yet — add one below.'}
              </Typography>
            )}
            {steps.map((s, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                <Typography sx={{ mt: 1.5, width: 20, color: 'text.secondary' }}>{i + 1}.</Typography>
                <TextField
                  label="Action"
                  fullWidth
                  size="small"
                  value={s.action}
                  onChange={(e) => setStep(i, { action: e.target.value })}
                  InputProps={{ readOnly }}
                />
                <TextField
                  label="Expected"
                  fullWidth
                  size="small"
                  value={s.expected}
                  onChange={(e) => setStep(i, { expected: e.target.value })}
                  InputProps={{ readOnly }}
                />
                {!readOnly && (
                  <Stack>
                    <IconButton size="small" onClick={() => moveStep(i, -1)} disabled={i === 0}>
                      <Box component="span" sx={{ fontSize: 12 }}>▲</Box>
                    </IconButton>
                    <IconButton size="small" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}>
                      <Box component="span" sx={{ fontSize: 12 }}>▼</Box>
                    </IconButton>
                  </Stack>
                )}
                {!readOnly && (
                  <IconButton size="small" color="error" onClick={() => removeStep(i)} sx={{ mt: 0.5 }}>
                    <Box component="span">✕</Box>
                  </IconButton>
                )}
              </Stack>
            ))}
            {!readOnly && (
              <Button
                size="small"
                onClick={() => setSteps((arr) => [...arr, { action: '', expected: '' }])}
                sx={{ alignSelf: 'flex-start' }}
              >
                + Add step
              </Button>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
        {!readOnly && (
          <Button variant="contained" onClick={submit} disabled={save.isPending || loading}>
            {mode.kind === 'create' ? 'Create' : 'Save'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
