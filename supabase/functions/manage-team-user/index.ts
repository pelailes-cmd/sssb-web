import { createClient } from 'npm:@supabase/supabase-js@2.110.8';

const allowedOrigins = new Set([
  'https://pelailes-cmd.github.io',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);

type AdminRow = {
  user_id: string;
  username: string;
  role: 'owner' | 'editor';
  created_at: string;
};

const usernamePattern = /^[a-z][a-z0-9._-]{2,39}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function jsonResponse(origin: string | null, payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function toTeamMember(row: AdminRow) {
  return {
    userId: row.user_id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
  };
}

function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse(null, { error: 'This website origin is not allowed.' }, 403);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') {
    return jsonResponse(origin, { error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authDomain = Deno.env.get('ADMIN_AUTH_DOMAIN')?.trim().toLowerCase() || 'admin.sssb.test';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(origin, { error: 'Team management is not configured.' }, 500);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '');
  if (!accessToken || accessToken === authorization) {
    return jsonResponse(origin, { error: 'Authentication is required.' }, 401);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userResult = await service.auth.getUser(accessToken);
  if (userResult.error || !userResult.data.user) {
    return jsonResponse(origin, { error: 'The administrator session is invalid.' }, 401);
  }

  const callerResult = await service
    .from('admin_users')
    .select('user_id, username, role, created_at')
    .eq('user_id', userResult.data.user.id)
    .maybeSingle<AdminRow>();
  if (callerResult.error || callerResult.data?.role !== 'owner') {
    return jsonResponse(origin, { error: 'Owner access is required.' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse(origin, { error: 'A valid JSON request is required.' }, 400);
  }

  if (body.action === 'list') {
    const listResult = await service
      .from('admin_users')
      .select('user_id, username, role, created_at')
      .order('created_at');
    if (listResult.error) {
      return jsonResponse(origin, { error: 'Team accounts could not be loaded.' }, 500);
    }
    const members = ((listResult.data ?? []) as AdminRow[])
      .sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner'))
      .map(toTeamMember);
    return jsonResponse(origin, { members });
  }

  if (body.action === 'create') {
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    if (!usernamePattern.test(username)) {
      return jsonResponse(
        origin,
        {
          error:
            'Use 3-40 lowercase letters, numbers, dots, hyphens, or underscores, beginning with a letter.',
        },
        400,
      );
    }
    if (!validPassword(body.password)) {
      return jsonResponse(
        origin,
        { error: 'Temporary passwords must contain 12-128 characters.' },
        400,
      );
    }

    const existingResult = await service
      .from('admin_users')
      .select('user_id')
      .eq('username', username)
      .maybeSingle();
    if (existingResult.error) {
      return jsonResponse(origin, { error: 'The username could not be checked.' }, 500);
    }
    if (existingResult.data) {
      return jsonResponse(origin, { error: 'That username is already in use.' }, 409);
    }

    const internalEmail = `${username}@${authDomain}`;
    const createResult = await service.auth.admin.createUser({
      email: internalEmail,
      password: body.password,
      email_confirm: true,
      user_metadata: { username, account_type: 'website-editor' },
    });
    if (createResult.error || !createResult.data.user) {
      return jsonResponse(
        origin,
        { error: 'The coworker account could not be created. The username may already be in use.' },
        409,
      );
    }

    const insertResult = await service
      .from('admin_users')
      .insert({ user_id: createResult.data.user.id, username, role: 'editor' })
      .select('user_id, username, role, created_at')
      .single<AdminRow>();
    if (insertResult.error || !insertResult.data) {
      await service.auth.admin.deleteUser(createResult.data.user.id);
      return jsonResponse(origin, { error: 'The coworker role could not be assigned.' }, 500);
    }

    return jsonResponse(origin, { member: toTeamMember(insertResult.data) }, 201);
  }

  if (body.action === 'reset-password' || body.action === 'delete') {
    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (!uuidPattern.test(userId) || userId === userResult.data.user.id) {
      return jsonResponse(origin, { error: 'Select a valid coworker account.' }, 400);
    }

    const targetResult = await service
      .from('admin_users')
      .select('user_id, username, role, created_at')
      .eq('user_id', userId)
      .maybeSingle<AdminRow>();
    if (targetResult.error || !targetResult.data) {
      return jsonResponse(origin, { error: 'The coworker account was not found.' }, 404);
    }
    if (targetResult.data.role === 'owner') {
      return jsonResponse(origin, { error: 'The owner account cannot be changed here.' }, 403);
    }

    if (body.action === 'reset-password') {
      if (!validPassword(body.password)) {
        return jsonResponse(
          origin,
          { error: 'Temporary passwords must contain 12-128 characters.' },
          400,
        );
      }
      const updateResult = await service.auth.admin.updateUserById(userId, {
        password: body.password,
      });
      if (updateResult.error) {
        return jsonResponse(origin, { error: 'The temporary password was not updated.' }, 500);
      }
      return jsonResponse(origin, { message: 'Temporary password updated.' });
    }

    const deleteResult = await service.auth.admin.deleteUser(userId);
    if (deleteResult.error) {
      return jsonResponse(origin, { error: 'The coworker account was not removed.' }, 500);
    }
    return jsonResponse(origin, { message: 'Coworker account removed.' });
  }

  return jsonResponse(origin, { error: 'Unknown team-management action.' }, 400);
});
