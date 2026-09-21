import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

/** In-memory Prisma + Redis fakes (mirrors folders.test.ts) for the test-case flow. */
const stores = vi.hoisted(() => {
  const projects: Record<string, any>[] = [];
  const memberships: Record<string, any>[] = [];
  const folders: Record<string, any>[] = [];
  const testCases: Record<string, any>[] = []; // each carries an embedded `steps` array
  const redisMap = new Map<string, string>();
  return { projects, memberships, folders, testCases, redisMap, seq: { n: 0 } };
});

const cuid = (p: string) => `c${p}${String(++stores.seq.n).padStart(20, '0')}`;
const findCase = (id: string) => stores.testCases.find((t) => t.id === id) ?? null;

const testCaseApi = {
  findUnique: async ({ where, include }: { where: { id: string }; include?: { steps?: boolean } }) => {
    const tc = findCase(where.id);
    if (!tc) return null;
    return include?.steps ? { ...tc, steps: [...tc.steps] } : tc;
  },
  findUniqueOrThrow: async ({ where, include }: { where: { id: string }; include?: { steps?: boolean } }) => {
    const tc = findCase(where.id);
    if (!tc) throw new Error('not found');
    return include?.steps ? { ...tc, steps: [...tc.steps] } : tc;
  },
  findMany: async ({ where }: { where: Record<string, any> }) =>
    stores.testCases.filter(
      (t) =>
        (where.projectId === undefined || t.projectId === where.projectId) &&
        (where.folderId === undefined || t.folderId === where.folderId) &&
        (where.isDeleted === undefined || t.isDeleted === where.isDeleted),
    ),
  create: async ({ data, include }: { data: Record<string, any>; include?: { steps?: boolean } }) => {
    const steps = (data.steps?.create ?? []).map((s: any) => ({ id: cuid('stp'), testCaseId: '', ...s }));
    const tc = {
      id: cuid('tc'),
      description: null,
      playwrightRef: null,
      updatedBy: null,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
      steps,
    };
    delete (tc as any).steps?.create;
    tc.steps = steps;
    stores.testCases.push(tc);
    return include?.steps ? { ...tc, steps: [...tc.steps] } : tc;
  },
  update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
    const tc = findCase(where.id);
    if (!tc) throw new Error('not found');
    const { steps, ...scalar } = data;
    Object.assign(tc, scalar, { updatedAt: new Date() });
    return tc;
  },
};

const testStepApi = {
  deleteMany: async ({ where }: { where: { testCaseId: string } }) => {
    const tc = findCase(where.testCaseId);
    const count = tc ? tc.steps.length : 0;
    if (tc) tc.steps = [];
    return { count };
  },
  createMany: async ({ data }: { data: Record<string, any>[] }) => {
    for (const s of data) {
      const tc = findCase(s.testCaseId);
      if (tc) tc.steps.push({ id: cuid('stp'), ...s });
    }
    return { count: data.length };
  },
};

const prismaMock = {
  project: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      stores.projects.find((p) => p.id === where.id) ?? null,
  },
  projectMembership: {
    findUnique: async ({
      where,
    }: {
      where: { userId_projectId: { userId: string; projectId: string } };
    }) =>
      stores.memberships.find(
        (m) =>
          m.userId === where.userId_projectId.userId &&
          m.projectId === where.userId_projectId.projectId,
      ) ?? null,
  },
  folder: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      stores.folders.find((f) => f.id === where.id) ?? null,
  },
  testCase: testCaseApi,
  testStep: testStepApi,
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ testCase: testCaseApi, testStep: testStepApi }),
};

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

vi.mock('../lib/redis.js', () => ({
  redis: {
    set: async () => 'OK',
    exists: async () => 0,
    del: async () => 0,
    scan: async () => ['0', []],
    on: () => undefined,
  },
}));

const { createApp } = await import('../app.js');
const { signAccessToken } = await import('../lib/jwt.js');

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const adminToken = () => signAccessToken({ sub: 'admin_1', role: 'SUPER_ADMIN', status: 'ACTIVE' });
const userToken = (sub: string) => signAccessToken({ sub, role: 'USER', status: 'ACTIVE' });

function addProject(over: Record<string, any> = {}) {
  const p = { id: over.id ?? cuid('proj'), name: 'Proj', isDeleted: false, ...over };
  stores.projects.push(p);
  return p;
}
function addFolder(projectId: string, over: Record<string, any> = {}) {
  const f = { id: over.id ?? cuid('fld'), name: 'F', projectId, parentId: null, isDeleted: false, ...over };
  stores.folders.push(f);
  return f;
}
function addMembership(userId: string, projectId: string, role: string) {
  stores.memberships.push({ id: cuid('mem'), userId, projectId, role });
}

const tcBase = (folderId: string) => `/api/v1/folders/${folderId}/test-cases`;
const create = (folderId: string, body: Record<string, any>, token = adminToken()) =>
  request(app).post(tcBase(folderId)).set(auth(token)).send(body);

beforeEach(() => {
  stores.projects.length = 0;
  stores.memberships.length = 0;
  stores.folders.length = 0;
  stores.testCases.length = 0;
  stores.redisMap.clear();
  stores.seq.n = 0;
});

describe('test cases — auth & role gating', () => {
  it('401 unauthenticated', async () => {
    const p = addProject();
    const f = addFolder(p.id);
    expect((await request(app).get(tcBase(f.id))).status).toBe(401);
  });

  it('404 for a missing/deleted folder', async () => {
    const res = await request(app).get(tcBase('cfldmissing0000000000000')).set(auth(adminToken()));
    expect(res.status).toBe(404);
  });

  it('non-member gets 403', async () => {
    const p = addProject();
    const f = addFolder(p.id);
    const res = await request(app).get(tcBase(f.id)).set(auth(userToken('outsider')));
    expect(res.status).toBe(403);
  });

  it('view-only role (PENTESTER) can list but not create', async () => {
    const p = addProject();
    const f = addFolder(p.id);
    addMembership('pent_1', p.id, 'PENTESTER');
    expect((await request(app).get(tcBase(f.id)).set(auth(userToken('pent_1')))).status).toBe(200);
    const c = await create(f.id, { title: 'Nope' }, userToken('pent_1'));
    expect(c.status).toBe(403);
  });

  it('manage role (MANUAL_TESTER) can create', async () => {
    const p = addProject();
    const f = addFolder(p.id);
    addMembership('mt_1', p.id, 'MANUAL_TESTER');
    const res = await create(f.id, { title: 'Login works' }, userToken('mt_1'));
    expect(res.status).toBe(201);
  });
});

describe('test cases — CRUD & steps', () => {
  it('creates a case with ordered steps and returns them on GET', async () => {
    const p = addProject();
    const f = addFolder(p.id);
    const created = await create(f.id, {
      title: 'Checkout',
      type: 'MANUAL',
      steps: [
        { action: 'Open cart', expected: 'Cart shown' },
        { action: 'Pay', expected: 'Receipt shown' },
      ],
    });
    expect(created.status).toBe(201);
    const id = created.body.testCase.id;

    const got = await request(app).get(`/api/v1/test-cases/${id}`).set(auth(adminToken()));
    expect(got.status).toBe(200);
    expect(got.body.testCase.steps.map((s: any) => s.action)).toEqual(['Open cart', 'Pay']);
  });

  it('rejects an empty title with 400', async () => {
    const p = addProject();
    const f = addFolder(p.id);
    const res = await create(f.id, { title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('title');
  });

  it('lists a folder\'s active cases', async () => {
    const p = addProject();
    const f = addFolder(p.id);
    await create(f.id, { title: 'A' });
    await create(f.id, { title: 'B' });
    const list = await request(app).get(tcBase(f.id)).set(auth(adminToken()));
    expect(list.body.testCases.map((t: any) => t.title).sort()).toEqual(['A', 'B']);
  });

  it('update replaces the steps', async () => {
    const p = addProject();
    const f = addFolder(p.id);
    const id = (await create(f.id, { title: 'X', steps: [{ action: 'a', expected: 'b' }] })).body.testCase.id;
    const upd = await request(app)
      .patch(`/api/v1/test-cases/${id}`)
      .set(auth(adminToken()))
      .send({ title: 'X2', type: 'AUTOMATION', steps: [{ action: 'c', expected: 'd' }, { action: 'e', expected: 'f' }] });
    expect(upd.status).toBe(200);
    expect(upd.body.testCase.title).toBe('X2');
    expect(upd.body.testCase.steps.map((s: any) => s.action)).toEqual(['c', 'e']);
  });
});

describe('test cases — move', () => {
  it('moves a case to another folder in the same project', async () => {
    const p = addProject();
    const f1 = addFolder(p.id);
    const f2 = addFolder(p.id);
    const id = (await create(f1.id, { title: 'M' })).body.testCase.id;
    const res = await request(app).post(`/api/v1/test-cases/${id}/move`).set(auth(adminToken())).send({ folderId: f2.id });
    expect(res.status).toBe(200);
    expect(res.body.testCase.folderId).toBe(f2.id);
  });

  it('rejects a destination in a different project (400)', async () => {
    const p1 = addProject();
    const p2 = addProject();
    const f1 = addFolder(p1.id);
    const f2 = addFolder(p2.id);
    const id = (await create(f1.id, { title: 'M' })).body.testCase.id;
    const res = await request(app).post(`/api/v1/test-cases/${id}/move`).set(auth(adminToken())).send({ folderId: f2.id });
    expect(res.status).toBe(400);
  });

  it('rejects a deleted destination folder (404)', async () => {
    const p = addProject();
    const f1 = addFolder(p.id);
    const fDel = addFolder(p.id, { isDeleted: true });
    const id = (await create(f1.id, { title: 'M' })).body.testCase.id;
    const res = await request(app).post(`/api/v1/test-cases/${id}/move`).set(auth(adminToken())).send({ folderId: fDel.id });
    expect(res.status).toBe(404);
  });
});

describe('test cases — soft-delete & restore', () => {
  it('soft-deletes (leaves the list), lists in deleted view, and restores', async () => {
    const p = addProject();
    const f = addFolder(p.id);
    const id = (await create(f.id, { title: 'Temp' })).body.testCase.id;

    expect((await request(app).delete(`/api/v1/test-cases/${id}`).set(auth(adminToken()))).status).toBe(200);
    const list = await request(app).get(tcBase(f.id)).set(auth(adminToken()));
    expect(list.body.testCases).toHaveLength(0);

    const del = await request(app).get(`/api/v1/projects/${p.id}/deleted-test-cases`).set(auth(adminToken()));
    expect(del.body.testCases.map((t: any) => t.id)).toContain(id);

    const restore = await request(app).post(`/api/v1/test-cases/${id}/restore`).set(auth(adminToken()));
    expect(restore.status).toBe(200);
    expect((await request(app).get(tcBase(f.id)).set(auth(adminToken()))).body.testCases).toHaveLength(1);
  });

  it('rejects restoring a case whose folder is still deleted (409)', async () => {
    const p = addProject();
    const f = addFolder(p.id);
    const id = (await create(f.id, { title: 'Temp' })).body.testCase.id;
    await request(app).delete(`/api/v1/test-cases/${id}`).set(auth(adminToken()));
    // Mark the folder deleted directly.
    stores.folders.find((x) => x.id === f.id)!.isDeleted = true;
    const res = await request(app).post(`/api/v1/test-cases/${id}/restore`).set(auth(adminToken()));
    expect(res.status).toBe(409);
  });
});
