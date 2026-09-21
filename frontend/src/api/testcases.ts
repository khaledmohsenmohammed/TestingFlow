import { api } from './client';

export type TestCaseType = 'MANUAL' | 'AUTOMATION';

export interface TestStep {
  action: string;
  expected: string;
}

export interface TestCase {
  id: string;
  title: string;
  type: TestCaseType;
  folderId: string;
  isDeleted: boolean;
  createdAt: string;
}

export interface TestCaseDetail extends TestCase {
  description: string | null;
  playwrightRef: string | null;
  steps: TestStep[];
  updatedAt: string;
}

export interface TestCaseInput {
  title: string;
  description?: string;
  type: TestCaseType;
  playwrightRef?: string;
  steps: TestStep[];
}

export async function listFolderTestCases(folderId: string): Promise<TestCase[]> {
  const res = await api.get(`/folders/${folderId}/test-cases`);
  return res.data.testCases;
}

export async function getTestCase(id: string): Promise<TestCaseDetail> {
  const res = await api.get(`/test-cases/${id}`);
  return res.data.testCase;
}

export async function createTestCase(folderId: string, input: TestCaseInput): Promise<TestCaseDetail> {
  const res = await api.post(`/folders/${folderId}/test-cases`, input);
  return res.data.testCase;
}

export async function updateTestCase(id: string, input: TestCaseInput): Promise<TestCaseDetail> {
  const res = await api.patch(`/test-cases/${id}`, input);
  return res.data.testCase;
}

export async function moveTestCase(id: string, folderId: string): Promise<TestCase> {
  const res = await api.post(`/test-cases/${id}/move`, { folderId });
  return res.data.testCase;
}

export async function deleteTestCase(id: string): Promise<void> {
  await api.delete(`/test-cases/${id}`);
}

export async function restoreTestCase(id: string): Promise<TestCase> {
  const res = await api.post(`/test-cases/${id}/restore`);
  return res.data.testCase;
}

export async function listDeletedTestCases(projectId: string): Promise<TestCase[]> {
  const res = await api.get(`/projects/${projectId}/deleted-test-cases`);
  return res.data.testCases;
}
