import { requireSupabase } from './supabaseClient';

export type TeamMember = {
  userId: string;
  username: string;
  role: 'owner' | 'editor';
  createdAt: string;
};

type TeamResponse = {
  members?: TeamMember[];
  member?: TeamMember;
  message?: string;
};

type FunctionError = Error & { context?: Response };

async function readFunctionError(error: FunctionError): Promise<string> {
  try {
    const response = error.context;
    if (!response) return error.message;
    const payload = (await response.clone().json()) as { error?: unknown };
    return typeof payload.error === 'string' ? payload.error : error.message;
  } catch {
    return error.message;
  }
}

async function invokeTeamFunction(body: Record<string, unknown>): Promise<TeamResponse> {
  const client = await requireSupabase();
  const result = await client.functions.invoke<TeamResponse>('manage-team-user', { body });
  if (result.error) {
    throw new Error(await readFunctionError(result.error as FunctionError));
  }
  return result.data ?? {};
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  const response = await invokeTeamFunction({ action: 'list' });
  return response.members ?? [];
}

export async function createTeamMember(
  username: string,
  temporaryPassword: string,
): Promise<TeamMember> {
  const response = await invokeTeamFunction({
    action: 'create',
    username,
    password: temporaryPassword,
  });
  if (!response.member) throw new Error('The coworker account was not returned after creation.');
  return response.member;
}

export async function resetTeamMemberPassword(
  userId: string,
  temporaryPassword: string,
): Promise<void> {
  await invokeTeamFunction({
    action: 'reset-password',
    userId,
    password: temporaryPassword,
  });
}

export async function deleteTeamMember(userId: string): Promise<void> {
  await invokeTeamFunction({ action: 'delete', userId });
}
