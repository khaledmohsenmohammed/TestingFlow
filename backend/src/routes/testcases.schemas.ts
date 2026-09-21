import { z } from 'zod';
import { TestCaseType } from '@prisma/client';

const stepSchema = z.object({
  action: z.string().trim().min(1, 'Action is required').max(1000),
  expected: z.string().trim().min(1, 'Expected result is required').max(1000),
});

export const createTestCaseSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
  description: z.string().trim().max(2000, 'Description is too long').optional(),
  type: z.nativeEnum(TestCaseType).default(TestCaseType.MANUAL),
  playwrightRef: z.string().trim().max(500).optional(),
  // Empty allowed: AUTOMATION cases may carry only a playwrightRef.
  steps: z.array(stepSchema).default([]),
});

// Same shape for a full update (replaces scalar fields + steps).
export const updateTestCaseSchema = createTestCaseSchema;

export const moveTestCaseSchema = z.object({
  folderId: z.string().cuid(),
});

export type CreateTestCaseInput = z.infer<typeof createTestCaseSchema>;
export type UpdateTestCaseInput = z.infer<typeof updateTestCaseSchema>;
