import type { SupabaseClient } from '@supabase/supabase-js';

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ??
  '';

export const cmsConfiguration = {
  projectUrl,
  publishableKey,
  isConfigured: Boolean(projectUrl && publishableKey),
  adminUsername: (import.meta.env.VITE_ADMIN_USERNAME?.trim() || 'pelailes').toLowerCase(),
  adminAuthEmail: import.meta.env.VITE_ADMIN_AUTH_EMAIL?.trim() || 'pelailes@admin.sssb.test',
} as const;

let clientPromise: Promise<SupabaseClient> | null = null;

export async function requireSupabase(): Promise<SupabaseClient> {
  if (!cmsConfiguration.isConfigured) {
    throw new Error(
      'The content manager is not connected yet. Add the Supabase project URL and publishable key.',
    );
  }

  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(projectUrl, publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storageKey: 'sssb-admin-session',
      },
    }),
  );

  return clientPromise;
}
