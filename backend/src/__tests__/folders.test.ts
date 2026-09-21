import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

/** In-memory Prisma + Redis fakes (mirrors projects.test.ts) for the folders flow. */
const stores = vi.hoisted(() => {
  const projects: Record<string, any>[] = [];
  const memberships: Record<string, any>[] = [];
  const folders: Record<string, any>[] = [];
  const redisMap = new Map<string, string>();
  return { projects, memberships, folders, redisMap, seq: { n: 0 } };
});

const matchFolder = (f: Record<string, any>, where: Record<string, any>): boolean => {
  if (where.projectId !== undefined && f.projectId !== where.projectId) return false;
  if (where.isDeleted !== undefined && f.isDeleted !== where.isDeleted) return false;
  if (where.parentId !== undefined) {
    if (where.parentId?.in) {
      if (!where.parentId.in.includes(f.parentId)) return false;
    } else if (f.parentId !== where.parentId) {
      return false;
    }
  }
  return true;
};

const folderApi = {
  findUnique: async ({ where }: { where: { id: string } }) =>
    stores.folders.find((f) => f.id === where.id) ?? null,
  findMany: async ({ where = {} }: { where?: Record<string, any> }) =>
    stores.folders.filter((f) => matchFolder(f, where)),
  create: async ({ data }: { data: Record<string, any> }) => {
    const folder = {
      // cuid-shaped so it passes the `parentId: z.string().cuid()` validation.
      id: `cfld${String(++stores.seq.n).padStart(20, '0')}`,
      parentId: null,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };
    stores.folders.push(folder);
    return folder;
  },
  update: async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
    const folder = stores.folders.find((f) => f.id === where.id);
    if (!folder) throw new Error('not found');
    Object.assign(folder, data);
    return folder;
  },
  updateMany: async ({
    where,
    data,
  }: {
    where: { id: { in: string[] } };
    data: Record<string, any>;
  }) => {
    let count = 0;
    for (const f of stores.folders) {
      if (where.id.in.includes(f.id)) {
        Object.assign(f, data);
        count++;
      }
    }
    return { count };
  },
};

vi.mock('../lib/prisma.js', () => ({
  prisma: {
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
    folder: folderApi,
    // listFolders aggregates per-folder test counts; no test cases in these tests.
    testCase: { groupBy: async () => [] },
    // Transactions run the callback synchronously against the same fakes.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ folder: folderApi }),
  },
}));

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
  const p = { id: over.id ?? `proj_${++stores.seq.n}`, name: 'Proj', isDeleted: false, ...over };
  stores.projects.push(p);
  return p;
}
function addMembership(userId: string, projectId: string, role: string) {
  stores.memberships.push({ id: `mem_${++stores.seq.n}`, userId, projectId, role });
}

const base = (projectId: string) => `/api/v1/projects/${projectId}/folders`;

async function createFolder(projectId: string, body: Record<string, any>) {
  const res = await request(app).post(base(projectId)).set(auth(adminToken())).send(body);
  return res;
}

beforeEach(() => {
  stores.projects.length = 0;
  stores.memberships.length = 0;
  stores.folders.length = 0;
  stores.redisMap.clear();
  stores.seq.n = 0;
});

describe('folders — auth & access gating', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const p = addProject();
    const res = await request(app).get(base(p.id));
    expect(res.status).toBe(401);
  });

  it('404 for a missing/deleted project', async () => {
    const res = await request(app).get(base('nope')).set(auth(adminToken()));
    expect(res.status).toBe(404);
  });

  it('rejects a non-member (USER, no membership) with 403', async () => {
    const p = addProject();
    const res = await request(app).get(base(p.id)).set(auth(userToken('outsider')));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('a view-only role (PENTESTER) can list but not create', async () => {
    const p = addProject();
    addMembership('pent_1', p.id, 'PENTESTER');
    const list = await request(app).get(base(p.id)).set(auth(userToken('pent_1')));
    expect(list.status).toBe(200);

    const create = await request(app)
      .post(base(p.id))
      .set(auth(userToken('pent_1')))
      .send({ name: 'Nope' });
    expect(create.status).toBe(403);
  });

  it('a manage role (MANUAL_TESTER) can create', async () => {
    const p = addProject();
    addMembership('mt_1', p.id, 'MANUAL_TESTER');
    const res = await request(app)
      .post(base(p.id))
      .set(auth(userToken('mt_1')))
      .send({ name: 'Sprint 1' });
    expect(res.status).toBe(201);
    expect(res.body.folder.name).toBe('Sprint 1');
  });
});

describe('folders — CRUD & tree', () => {
  it('creates a root folder (201)', async () => {
    const p = addProject();
    const res = await createFolder(p.id, { name: 'Root' });
    expect(res.status).toBe(201);
    expect(res.body.folder.parentId).toBeNull();
  });

  it('rejects an empty name with 400 + field error', async () => {
    const p = addProject();
    const res = await createFolder(p.id, { name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('name');
  });

  it('creates a nested folder and returns the tree shape', async () => {
    const p = addProject();
    const root = (await createFolder(p.id, { name: 'Root' })).body.folder;
    const child = (await createFolder(p.id, { name: 'Child', parentId: root.id })).body.folder;
    expect(child.parentId).toBe(root.id);

    const list = await request(app).get(base(p.id)).set(auth(adminToken()));
    expect(list.status).toBe(200);
    expect(list.body.tree).toHaveLength(1);
    expect(list.body.tree[0].id).toBe(root.id);
    expect(list.body.tree[0].children[0].id).toBe(child.id);
  });

  it('404 when creating under a non-existent parent', async () => {
    const p = addProject();
    const res = await createFolder(p.id, { name: 'X', parentId: 'cknotreal000000000000000' });
    expect(res.status).toBe(404);
  });

  it('rejects a parent from a different project with 400', async () => {
    const p1 = addProject();
    const p2 = addProject();
    const foreign = (await createFolder(p2.id, { name: 'Foreign' })).body.folder;
    const res = await createFolder(p1.id, { name: 'X', parentId: foreign.id });
    expect(res.status).toBe(400);
  });

  it('renames a folder via PATCH', async () => {
    const p = addProject();
    const f = (await createFolder(p.id, { name: 'Old' })).body.folder;
    const res = await request(app)
      .patch(`${base(p.id)}/${f.id}`)
      .set(auth(adminToken()))
      .send({ name: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.folder.name).toBe('New');
  });
});

describe('folders — move / reparent', () => {
  it('moves a folder under a new parent', async () => {
    const p = addProject();
    const a = (await createFolder(p.id, { name: 'A' })).body.folder;
    const b = (await createFolder(p.id, { name: 'B' })).body.folder;
    const res = await request(app)
      .post(`${base(p.id)}/${b.id}/move`)
      .set(auth(adminToken()))
      .send({ parentId: a.id });
    expect(res.status).toBe(200);
    expect(res.body.folder.parentId).toBe(a.id);
  });

  it('rejects making a folder its own parent (400)', async () => {
    const p = addProject();
    const a = (await createFolder(p.id, { name: 'A' })).body.folder;
    const res = await request(app)
      .post(`${base(p.id)}/${a.id}/move`)
      .set(auth(adminToken()))
      .send({ parentId: a.id });
    expect(res.status).toBe(400);
  });

  it('rejects moving a folder into its own descendant (409 cycle)', async () => {
    const p = addProject();
    const a = (await createFolder(p.id, { name: 'A' })).body.folder;
    const b = (await createFolder(p.id, { name: 'B', parentId: a.id })).body.folder;
    // Try to move A under B (B is A's child) -> cycle.
    const res = await request(app)
      .post(`${base(p.id)}/${a.id}/move`)
      .set(auth(adminToken()))
      .send({ parentId: b.id });
    expect(res.status).toBe(409);
  });

  it('moves a folder to root with parentId null', async () => {
    const p = addProject();
    const a = (await createFolder(p.id, { name: 'A' })).body.folder;
    const b = (await createFolder(p.id, { name: 'B', parentId: a.id })).body.folder;
    const res = await request(app)
      .post(`${base(p.id)}/${b.id}/move`)
      .set(auth(adminToken()))
      .send({ parentId: null });
    expect(res.status).toBe(200);
    expect(res.body.folder.parentId).toBeNull();
  });
});

describe('folders — soft-delete cascade & restore', () => {
  it('cascade soft-deletes descendants and excludes them from the tree', async () => {
    const p = addProject();
    const root = (await createFolder(p.id, { name: 'Root' })).body.folder;
    const child = (await createFolder(p.id, { name: 'Child', parentId: root.id })).body.folder;
    const grand = (await createFolder(p.id, { name: 'Grand', parentId: child.id })).body.folder;

    const del = await request(app).delete(`${base(p.id)}/${root.id}`).set(auth(adminToken()));
    expect(del.status).toBe(200);
    expect(del.body.deletedCount).toBe(3);

    const active = await request(app).get(base(p.id)).set(auth(adminToken()));
    expect(active.body.tree).toHaveLength(0);

    const deleted = await request(app).get(`${base(p.id)}?deleted=true`).set(auth(adminToken()));
    expect(deleted.body.folders.map((f: any) => f.id).sort()).toEqual(
      [root.id, child.id, grand.id].sort(),
    );
  });

  it('restores a single folder, but rejects restoring a child whose parent is still deleted', async () => {
    const p = addProject();
    const root = (await createFolder(p.id, { name: 'Root' })).body.folder;
    const child = (await createFolder(p.id, { name: 'Child', parentId: root.id })).body.folder;
    await request(app).delete(`${base(p.id)}/${root.id}`).set(auth(adminToken()));

    // Child's parent (root) is still deleted -> 409.
    const badRestore = await request(app)
      .post(`${base(p.id)}/${child.id}/restore`)
      .set(auth(adminToken()));
    expect(badRestore.status).toBe(409);

    // Restoring the root works.
    const ok = await request(app)
      .post(`${base(p.id)}/${root.id}/restore`)
      .set(auth(adminToken()));
    expect(ok.status).toBe(200);
  });
});
