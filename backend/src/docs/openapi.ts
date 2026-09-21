/**
 * OpenAPI 3.0 specification for the KmmRepo API.
 *
 * Defined as a typed object (rather than scanned from JSDoc globs) so it is
 * type-checked and behaves identically under `tsx` (dev) and compiled `dist`
 * (prod). Extend `paths` and `components.schemas` as new endpoints land.
 */
export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'KmmRepo API',
    version: '0.1.0',
    description:
      'Self-hosted, role-based test repository management API.\n\n' +
      'Authentication uses a short-lived JWT **access token** (sent as ' +
      '`Authorization: Bearer <token>`) plus a rotating **refresh token** ' +
      'delivered in an httpOnly cookie. Registration creates a `PENDING` ' +
      'account; only `ACTIVE` users can log in.',
  },
  servers: [{ url: '/api/v1', description: 'Default base path' }],
  tags: [
    { name: 'Auth', description: 'Registration, login, and session management' },
    { name: 'Profile', description: 'Self-service profile management for the current user' },
    { name: 'Admin', description: 'Super-admin user management (requires SUPER_ADMIN)' },
    { name: 'Projects', description: 'Super-admin project configuration & user assignment (requires SUPER_ADMIN)' },
    { name: 'Folders', description: 'Nested folder tree within a project (super-admin or a project member, gated by per-project role)' },
    { name: 'Test Cases', description: 'Test cases inside folders (super-admin or a project member, gated by per-project role)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token returned by POST /auth/login.',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'BAD_REQUEST' },
              message: { type: 'string', example: 'Validation failed' },
              fields: {
                type: 'object',
                additionalProperties: { type: 'array', items: { type: 'string' } },
                example: { email: ['Enter a valid email'] },
              },
            },
            required: ['code', 'message'],
          },
        },
        required: ['error'],
      },
      AuthUser: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'cmqf42p670000100y3yhu0zf3' },
          name: { type: 'string', example: 'Super Admin' },
          email: { type: 'string', format: 'email', example: 'admin@kmmrepo.local' },
          status: { type: 'string', enum: ['PENDING', 'ACTIVE', 'DISABLED'] },
          globalRole: { type: 'string', enum: ['SUPER_ADMIN', 'USER'] },
          avatarUrl: { type: 'string', nullable: true, description: 'base64 data URL of the avatar image' },
          avatarName: { type: 'string', nullable: true },
          avatarDescription: { type: 'string', nullable: true },
          avatarRef: { type: 'string', nullable: true, example: '2026-06-17T10:22:31.000Z-48217' },
        },
        required: ['id', 'name', 'email', 'status', 'globalRole'],
      },
      UpdateProfileRequest: {
        type: 'object',
        description: 'Any subset of fields. When `avatar` is present a new `avatarRef` is generated.',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100, example: 'New Name' },
          avatarName: { type: 'string', maxLength: 100, example: 'My pic' },
          avatarDescription: { type: 'string', maxLength: 500, example: 'A photo of me' },
          avatar: {
            type: 'string',
            description: 'Image as a base64 data URL (data:image/...;base64,...)',
            example: 'data:image/png;base64,iVBORw0KGgo...',
          },
        },
      },
      ProfileResponse: {
        type: 'object',
        properties: { user: { $ref: '#/components/schemas/AuthUser' } },
        required: ['user'],
      },
      RegisterRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100, example: 'Test Tester' },
          email: { type: 'string', format: 'email', example: 'tester@example.com' },
          password: { type: 'string', minLength: 8, maxLength: 128, example: 'Password123' },
        },
        required: ['name', 'email', 'password'],
      },
      LoginRequest: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', example: 'admin@kmmrepo.local' },
          password: { type: 'string', example: 'ChangeMe!123' },
        },
        required: ['email', 'password'],
      },
      RegisterResponse: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            example: 'Registration submitted. An administrator will approve your account.',
          },
          user: { $ref: '#/components/schemas/AuthUser' },
        },
        required: ['message', 'user'],
      },
      SessionResponse: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/AuthUser' },
          accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        },
        required: ['user', 'accessToken'],
      },
      AdminUser: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          status: { type: 'string', enum: ['PENDING', 'ACTIVE', 'DISABLED'] },
          globalRole: { type: 'string', enum: ['SUPER_ADMIN', 'USER'] },
          isDeleted: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'name', 'email', 'status', 'globalRole', 'isDeleted', 'createdAt'],
      },
      UsersListResponse: {
        type: 'object',
        properties: {
          users: { type: 'array', items: { $ref: '#/components/schemas/AdminUser' } },
        },
        required: ['users'],
      },
      AdminUserResponse: {
        type: 'object',
        properties: { user: { $ref: '#/components/schemas/AdminUser' } },
        required: ['user'],
      },
      UserStatusUpdate: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] } },
        required: ['status'],
      },
      ProjectRole: {
        type: 'string',
        enum: ['TEST_LEAD', 'AUTOMATION_TESTER', 'MANUAL_TESTER', 'PENTESTER', 'PROJECT_LEAD'],
      },
      Project: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          memberCount: { type: 'integer', example: 0 },
          isDeleted: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'name', 'description', 'memberCount', 'isDeleted', 'createdAt'],
      },
      ProjectResponse: {
        type: 'object',
        properties: { project: { $ref: '#/components/schemas/Project' } },
        required: ['project'],
      },
      ProjectsListResponse: {
        type: 'object',
        properties: { projects: { type: 'array', items: { $ref: '#/components/schemas/Project' } } },
        required: ['projects'],
      },
      CreateProjectRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100, example: 'Mobile App' },
          description: { type: 'string', maxLength: 500, example: 'Regression suite for the mobile app' },
        },
        required: ['name'],
      },
      ProjectMember: {
        type: 'object',
        properties: {
          membershipId: { type: 'string' },
          userId: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { $ref: '#/components/schemas/ProjectRole' },
          grantedAt: { type: 'string', format: 'date-time' },
        },
        required: ['membershipId', 'userId', 'name', 'email', 'role', 'grantedAt'],
      },
      ProjectMembersResponse: {
        type: 'object',
        properties: { members: { type: 'array', items: { $ref: '#/components/schemas/ProjectMember' } } },
        required: ['members'],
      },
      AddMemberRequest: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          role: { $ref: '#/components/schemas/ProjectRole' },
        },
        required: ['userId', 'role'],
      },
      FolderNode: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          parentId: { type: 'string', nullable: true },
          isDeleted: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          children: {
            type: 'array',
            items: { $ref: '#/components/schemas/FolderNode' },
          },
        },
        required: ['id', 'name', 'parentId', 'isDeleted', 'createdAt', 'children'],
      },
      FolderTreeResponse: {
        type: 'object',
        properties: { tree: { type: 'array', items: { $ref: '#/components/schemas/FolderNode' } } },
        required: ['tree'],
      },
      FolderResponse: {
        type: 'object',
        properties: { folder: { $ref: '#/components/schemas/FolderNode' } },
        required: ['folder'],
      },
      CreateFolderRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100, example: 'Sprint 1' },
          parentId: { type: 'string', nullable: true, description: 'Omit or null for a root folder' },
        },
        required: ['name'],
      },
      RenameFolderRequest: {
        type: 'object',
        properties: { name: { type: 'string', minLength: 1, maxLength: 100 } },
        required: ['name'],
      },
      MoveFolderRequest: {
        type: 'object',
        properties: { parentId: { type: 'string', nullable: true, description: 'null moves to root' } },
        required: ['parentId'],
      },
      TestStep: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          expected: { type: 'string' },
        },
        required: ['action', 'expected'],
      },
      TestCase: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          type: { type: 'string', enum: ['MANUAL', 'AUTOMATION'] },
          folderId: { type: 'string' },
          description: { type: 'string', nullable: true },
          playwrightRef: { type: 'string', nullable: true },
          isDeleted: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          steps: { type: 'array', items: { $ref: '#/components/schemas/TestStep' } },
        },
        required: ['id', 'title', 'type', 'folderId', 'isDeleted', 'createdAt'],
      },
      TestCaseResponse: {
        type: 'object',
        properties: { testCase: { $ref: '#/components/schemas/TestCase' } },
        required: ['testCase'],
      },
      TestCasesListResponse: {
        type: 'object',
        properties: { testCases: { type: 'array', items: { $ref: '#/components/schemas/TestCase' } } },
        required: ['testCases'],
      },
      CreateTestCaseRequest: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200, example: 'Login with valid credentials' },
          description: { type: 'string', maxLength: 2000 },
          type: { type: 'string', enum: ['MANUAL', 'AUTOMATION'], default: 'MANUAL' },
          playwrightRef: { type: 'string', maxLength: 500 },
          steps: { type: 'array', items: { $ref: '#/components/schemas/TestStep' } },
        },
        required: ['title'],
      },
      MoveTestCaseRequest: {
        type: 'object',
        properties: { folderId: { type: 'string', description: 'Destination folder (same project)' } },
        required: ['folderId'],
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Auth'],
        summary: 'Health check',
        security: [],
        responses: {
          '200': {
            description: 'Service is up',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { status: { type: 'string', example: 'ok' } },
                },
              },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new account (created as PENDING)',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } },
          },
        },
        responses: {
          '201': {
            description: 'Account created and awaiting approval',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/RegisterResponse' } },
            },
          },
          '400': {
            description: 'Validation failed',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '409': {
            description: 'Email already registered',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in (ACTIVE users only)',
        description:
          'On success, returns an access token in the body and sets a rotating ' +
          'refresh token in an httpOnly `refreshToken` cookie.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Authenticated',
            headers: {
              'Set-Cookie': {
                description: 'httpOnly refresh token cookie',
                schema: { type: 'string', example: 'refreshToken=...; HttpOnly; Path=/api/v1/auth' },
              },
            },
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SessionResponse' } },
            },
          },
          '401': {
            description: 'Invalid email or password',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '403': {
            description: 'Account is PENDING or DISABLED',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate the refresh token and obtain a new access token',
        description: 'Requires the httpOnly `refreshToken` cookie. The presented token is rotated (invalidated) and a new pair is issued.',
        security: [],
        responses: {
          '200': {
            description: 'New access token issued',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SessionResponse' } },
            },
          },
          '401': {
            description: 'Missing, invalid, expired, or already-rotated refresh token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Log out (revoke the refresh token)',
        security: [],
        responses: {
          '200': {
            description: 'Logged out; refresh cookie cleared',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { message: { type: 'string', example: 'Logged out' } },
                },
              },
            },
          },
        },
      },
    },
    '/profile': {
      get: {
        tags: ['Profile'],
        summary: 'Get the current user\'s profile',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileResponse' } } },
          },
          '401': { description: 'Unauthenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      patch: {
        tags: ['Profile'],
        summary: 'Update the current user\'s name and/or avatar',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateProfileRequest' } } },
        },
        responses: {
          '200': { description: 'Updated user', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileResponse' } } } },
          '400': { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/admin/projects': {
      get: {
        tags: ['Projects'],
        summary: 'List projects (super-admin only)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'deleted',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['true', 'false'] },
            description: 'When true, returns soft-deleted projects instead of active ones',
          },
        ],
        responses: {
          '200': { description: 'List of projects', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectsListResponse' } } } },
          '401': { description: 'Unauthenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '403': { description: 'Not a super-admin', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      post: {
        tags: ['Projects'],
        summary: 'Create a project',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateProjectRequest' } } } },
        responses: {
          '201': { description: 'Created project', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectResponse' } } } },
          '400': { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '403': { description: 'Not a super-admin', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/admin/projects/{id}': {
      patch: {
        tags: ['Projects'],
        summary: 'Rename / edit a project',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateProjectRequest' } } } },
        responses: {
          '200': { description: 'Updated project', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectResponse' } } } },
          '400': { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Project not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      delete: {
        tags: ['Projects'],
        summary: 'Soft-delete a project',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Soft-deleted project', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectResponse' } } } },
          '404': { description: 'Project not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/admin/projects/{id}/restore': {
      post: {
        tags: ['Projects'],
        summary: 'Restore a soft-deleted project',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Restored project', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectResponse' } } } },
          '404': { description: 'Project not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/admin/projects/{id}/members': {
      get: {
        tags: ['Projects'],
        summary: 'List members of a project',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Project members', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectMembersResponse' } } } },
          '404': { description: 'Project not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      post: {
        tags: ['Projects'],
        summary: 'Assign a user to a project (or update their role)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AddMemberRequest' } } } },
        responses: {
          '201': { description: 'Member assigned', content: { 'application/json': { schema: { type: 'object', properties: { member: { $ref: '#/components/schemas/ProjectMember' } } } } } },
          '400': { description: 'Validation failed / user not active', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Project or user not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/admin/projects/{id}/members/{userId}': {
      delete: {
        tags: ['Projects'],
        summary: 'Remove a user from a project',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Member removed', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
          '404': { description: 'Membership not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/projects/{projectId}/folders': {
      get: {
        tags: ['Folders'],
        summary: 'List a project\'s folders (nested tree, or flat deleted list)',
        description: 'Any project member (or super-admin). Active folders return as a nested `tree`; `?deleted=true` returns a flat `folders` list for restore.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'deleted', in: 'query', required: false, schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          '200': { description: 'Folder tree (or flat deleted list)', content: { 'application/json': { schema: { $ref: '#/components/schemas/FolderTreeResponse' } } } },
          '401': { description: 'Unauthenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '403': { description: 'Not a project member', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Project not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      post: {
        tags: ['Folders'],
        summary: 'Create a folder (root or nested)',
        description: 'Requires a manage-capable project role (or super-admin).',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateFolderRequest' } } } },
        responses: {
          '201': { description: 'Created folder', content: { 'application/json': { schema: { $ref: '#/components/schemas/FolderResponse' } } } },
          '400': { description: 'Validation failed / parent in another project', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '403': { description: 'Role cannot manage folders', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Project or parent not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/projects/{projectId}/folders/{id}': {
      patch: {
        tags: ['Folders'],
        summary: 'Rename a folder',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RenameFolderRequest' } } } },
        responses: {
          '200': { description: 'Updated folder', content: { 'application/json': { schema: { $ref: '#/components/schemas/FolderResponse' } } } },
          '403': { description: 'Role cannot manage folders', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Folder not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      delete: {
        tags: ['Folders'],
        summary: 'Soft-delete a folder (cascades to descendants)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Deleted count', content: { 'application/json': { schema: { type: 'object', properties: { deletedCount: { type: 'integer' } } } } } },
          '403': { description: 'Role cannot manage folders', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Folder not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/projects/{projectId}/folders/{id}/move': {
      post: {
        tags: ['Folders'],
        summary: 'Move / reparent a folder',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/MoveFolderRequest' } } } },
        responses: {
          '200': { description: 'Moved folder', content: { 'application/json': { schema: { $ref: '#/components/schemas/FolderResponse' } } } },
          '400': { description: 'Self-parent / parent in another project', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '409': { description: 'Move would create a cycle', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Folder or parent not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/projects/{projectId}/folders/{id}/restore': {
      post: {
        tags: ['Folders'],
        summary: 'Restore a soft-deleted folder',
        description: 'Rejects (409) if the folder\'s parent is still deleted. `?cascade=true` restores the deleted subtree.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'cascade', in: 'query', required: false, schema: { type: 'string', enum: ['true', 'false'] } },
        ],
        responses: {
          '200': { description: 'Restored count', content: { 'application/json': { schema: { type: 'object', properties: { restoredCount: { type: 'integer' } } } } } },
          '409': { description: 'Parent still deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Folder not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/folders/{folderId}/test-cases': {
      get: {
        tags: ['Test Cases'],
        summary: "List a folder's test cases",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'folderId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Test cases in the folder', content: { 'application/json': { schema: { $ref: '#/components/schemas/TestCasesListResponse' } } } },
          '403': { description: 'Not a project member', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Folder not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      post: {
        tags: ['Test Cases'],
        summary: 'Create a test case in a folder',
        description: 'Requires a manage-capable project role (or super-admin).',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'folderId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateTestCaseRequest' } } } },
        responses: {
          '201': { description: 'Created test case', content: { 'application/json': { schema: { $ref: '#/components/schemas/TestCaseResponse' } } } },
          '400': { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '403': { description: 'Role cannot manage test cases', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Folder not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/test-cases/{id}': {
      get: {
        tags: ['Test Cases'],
        summary: 'Get a test case (with ordered steps)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Test case detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/TestCaseResponse' } } } },
          '404': { description: 'Test case not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      patch: {
        tags: ['Test Cases'],
        summary: 'Update a test case (replaces steps)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateTestCaseRequest' } } } },
        responses: {
          '200': { description: 'Updated test case', content: { 'application/json': { schema: { $ref: '#/components/schemas/TestCaseResponse' } } } },
          '403': { description: 'Role cannot manage test cases', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Test case not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      delete: {
        tags: ['Test Cases'],
        summary: 'Soft-delete a test case',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Deleted', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
          '403': { description: 'Role cannot manage test cases', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Test case not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/test-cases/{id}/move': {
      post: {
        tags: ['Test Cases'],
        summary: 'Move a test case to another folder',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/MoveTestCaseRequest' } } } },
        responses: {
          '200': { description: 'Moved test case', content: { 'application/json': { schema: { $ref: '#/components/schemas/TestCaseResponse' } } } },
          '400': { description: 'Destination in another project', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Test case or destination folder not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/test-cases/{id}/restore': {
      post: {
        tags: ['Test Cases'],
        summary: 'Restore a soft-deleted test case',
        description: 'Rejects (409) if the test case folder is still deleted.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Restored test case', content: { 'application/json': { schema: { $ref: '#/components/schemas/TestCaseResponse' } } } },
          '409': { description: 'Folder still deleted / not deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Test case not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/projects/{projectId}/deleted-test-cases': {
      get: {
        tags: ['Test Cases'],
        summary: 'List deleted test cases in a project (restore view)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Deleted test cases', content: { 'application/json': { schema: { $ref: '#/components/schemas/TestCasesListResponse' } } } },
          '404': { description: 'Project not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'List users (super-admin only)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'status',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['PENDING', 'ACTIVE', 'DISABLED'] },
            description: 'Filter by account status',
          },
          {
            name: 'deleted',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['true', 'false'] },
            description: 'When true, returns soft-deleted users instead of active ones',
          },
        ],
        responses: {
          '200': {
            description: 'List of users',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UsersListResponse' } } },
          },
          '401': { description: 'Unauthenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '403': { description: 'Not a super-admin', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/admin/users/{id}': {
      patch: {
        tags: ['Admin'],
        summary: 'Approve / reject / activate / deactivate a user',
        description: 'Sets status to ACTIVE (approve/activate) or DISABLED (reject/deactivate). Disabling also revokes the user’s refresh tokens. SUPER_ADMIN targets are protected.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UserStatusUpdate' } } },
        },
        responses: {
          '200': { description: 'Updated user', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminUserResponse' } } } },
          '400': { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '403': { description: 'Not a super-admin, or target is a protected super-admin', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'User not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      delete: {
        tags: ['Admin'],
        summary: 'Soft-delete a user',
        description: 'Marks the user as deleted (recoverable). SUPER_ADMIN targets are protected.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Soft-deleted user', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminUserResponse' } } } },
          '403': { description: 'Not a super-admin, or target is a protected super-admin', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'User not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/admin/users/{id}/restore': {
      post: {
        tags: ['Admin'],
        summary: 'Restore a soft-deleted user',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Restored user', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminUserResponse' } } } },
          '403': { description: 'Not a super-admin', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'User not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
  },
} as const;
