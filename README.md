# TestingFlow

Self-hosted, role-based **test repository management**.

- **Frontend:** React 18 + TypeScript + MUI
- **Backend:** Node.js + Express + TypeScript + Prisma
- **Data:** PostgreSQL + Redis
- **Hosting:** Self-hosted via Docker (no data leaves the company environment)

> Detailed documentation (development guide, feature references, progress logs) is kept
> locally under `docs/` and is intentionally not committed to this repo.

## Quick start

```bash
# 1. Environment
cp .env.example .env        # fill in secrets

# 2. Infra (Postgres + Redis)
docker compose up -d

# 3. Install everything (npm workspaces)
npm install

# 4. Backend
cd backend
npx prisma migrate dev      # apply schema
npm run seed                # creates first super-admin (see .env)
npm run dev                 # http://localhost:4000/api/v1
                            # API docs (Swagger UI): http://localhost:4000/api/v1/docs

# 5. Frontend (new terminal)
cd frontend
npm run dev                 # http://localhost:5173
```

## Current status

**Phase 1 (Foundation) — in progress:**

- ✅ Authentication & registration — self-register → `PENDING` → super-admin approves → `ACTIVE` (JWT access + rotating refresh)
- ✅ Super-admin user management — approve / reject / activate / deactivate / soft-delete / restore (protected admin accounts)
- ✅ API docs — Swagger UI at `/api/v1/docs`
- ✅ Persisted dark/light theme toggle
- ⬜ Next: Projects + nested folders + tree view
