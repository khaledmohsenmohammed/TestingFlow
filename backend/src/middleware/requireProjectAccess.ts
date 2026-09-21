import type { NextFunction, Request, Response } from 'express';
import type { ProjectRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { asyncHandler } from '../lib/asyncHandler.js';

/**
 * The single source of truth for which per-project roles may MANAGE folders
 * (create / rename / move / delete / restore). Any other member gets read-only
 * view access. Super-admins always have full access regardless of this set.
 *
 * Tweak this set to change the policy in one place.
 */
export const FOLDER_MANAGE_ROLES: ReadonlySet<ProjectRole> = new Set<ProjectRole>([
  'PROJECT_LEAD',
  'TEST_LEAD',
  'MANUAL_TESTER',
  'AUTOMATION_TESTER',
]);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      projectAccess?: {
        projectId: string;
        isSuperAdmin: boolean;
        // null when the caller is a super-admin who is not a project member.
        role: ProjectRole | null;
      };
    }
  }
}

/**
 * Authorizes access to a project's nested resources (folders). Must run AFTER
 * `requireAuth`. Resolves `:projectId` from the path, verifies the project is
 * active, and authorizes the caller:
 *   - super-admin  → always allowed
 *   - project member → allowed to view; allowed to manage only if their role is
 *     in `FOLDER_MANAGE_ROLES` (when `opts.manage` is set)
 *   - non-member   → 403
 * Attaches the resolved access to `req.projectAccess` for downstream handlers.
 */
type ProjectAccess = NonNullable<Request['projectAccess']>;

/**
 * Core authorization, reusable by any route that can resolve a projectId
 * (directly, or from a folder / test case). Verifies the project is active and
 * the caller may access it; throws ApiError otherwise. Returns the resolved
 * access to attach to `req.projectAccess`.
 */
export async function authorizeProjectAccess(
  user: { sub: string; role: string },
  projectId: string,
  opts: { manage?: boolean } = {},
): Promise<ProjectAccess> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.isDeleted) {
    throw ApiError.notFound('Project not found');
  }

  if (user.role === 'SUPER_ADMIN') {
    return { projectId, isSuperAdmin: true, role: null };
  }

  const membership = await prisma.projectMembership.findUnique({
    where: { userId_projectId: { userId: user.sub, projectId } },
  });
  if (!membership) {
    throw ApiError.forbidden('You are not a member of this project');
  }
  if (opts.manage && !FOLDER_MANAGE_ROLES.has(membership.role)) {
    throw ApiError.forbidden('Your project role cannot manage this resource');
  }

  return { projectId, isSuperAdmin: false, role: membership.role };
}

/** Authorizes a route that carries `:projectId` in its path (e.g. folders). */
export function requireProjectAccess(opts: { manage?: boolean } = {}) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const projectId = req.params.projectId;
    if (!projectId) {
      throw ApiError.badRequest('projectId is required');
    }
    req.projectAccess = await authorizeProjectAccess(req.user!, projectId, opts);
    next();
  });
}
