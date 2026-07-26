/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { getAdminProfile, type AdminProfile } from './contentRepository';
import {
  authEmailForUsername,
  cmsConfiguration,
  isValidAdminUsername,
  requireSupabase,
} from './supabaseClient';

type AuthStatus = 'unconfigured' | 'checking' | 'signed-out' | 'authorized';

type AdminContextValue = {
  status: AuthStatus;
  profile: AdminProfile | null;
  isAdmin: boolean;
  isBusy: boolean;
  error: string | null;
  loginOpen: boolean;
  dashboardOpen: boolean;
  openAdmin: () => void;
  closeLogin: () => void;
  closeDashboard: () => void;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  changePassword: (password: string) => Promise<void>;
  clearError: () => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);

const friendlyAuthError = (error: unknown) => {
  if (isErrorWithStatus(error, 429)) {
    return 'Too many login attempts. Please wait briefly before trying again.';
  }
  return 'Invalid administrator username or password.';
};

const isErrorWithStatus = (error: unknown, status: number) =>
  typeof error === 'object' && error !== null && 'status' in error && error.status === status;

export function AdminProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    cmsConfiguration.isConfigured ? 'checking' : 'unconfigured',
  );
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);

  const applySession = useCallback(async (session: Session | null) => {
    if (!session) {
      setProfile(null);
      setStatus(cmsConfiguration.isConfigured ? 'signed-out' : 'unconfigured');
      return;
    }

    try {
      const nextProfile = await getAdminProfile(session.user.id);
      if (!nextProfile) {
        const client = await requireSupabase();
        await client.auth.signOut();
        setProfile(null);
        setStatus('signed-out');
        setError('This authenticated account is not authorized as a website administrator.');
        return;
      }

      setProfile(nextProfile);
      setStatus('authorized');
      setError(null);
    } catch {
      setProfile(null);
      setStatus('signed-out');
      setError('Administrator access is not fully configured in the database yet.');
    }
  }, []);

  useEffect(() => {
    if (!cmsConfiguration.isConfigured) return undefined;
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void requireSupabase().then(async (client) => {
      if (!active) return;
      const { data: sessionData } = await client.auth.getSession();
      if (active) void applySession(sessionData.session);

      const { data } = client.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(() => {
          if (active) void applySession(session);
        }, 0);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [applySession]);

  const openAdmin = useCallback(() => {
    setError(null);
    if (profile) setDashboardOpen(true);
    else setLoginOpen(true);
  }, [profile]);

  const login = useCallback(async (username: string, password: string) => {
    if (!cmsConfiguration.isConfigured) {
      setError('Connect the Supabase project before administrator login can be used.');
      return false;
    }

    setIsBusy(true);
    setError(null);
    try {
      const client = await requireSupabase();
      if (!isValidAdminUsername(username)) {
        setError('Invalid administrator username or password.');
        return false;
      }

      const result = await client.auth.signInWithPassword({
        email: authEmailForUsername(username),
        password,
      });
      if (result.error || !result.data.session) {
        setError(friendlyAuthError(result.error));
        return false;
      }

      const nextProfile = await getAdminProfile(result.data.session.user.id);
      if (!nextProfile) {
        await client.auth.signOut();
        setError('This account is not authorized as a website administrator.');
        return false;
      }

      setProfile(nextProfile);
      setStatus('authorized');
      setLoginOpen(false);
      setDashboardOpen(true);
      return true;
    } catch (loginError) {
      setError(friendlyAuthError(loginError));
      return false;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsBusy(true);
    try {
      if (cmsConfiguration.isConfigured) {
        const client = await requireSupabase();
        await client.auth.signOut();
      }
      setProfile(null);
      setStatus(cmsConfiguration.isConfigured ? 'signed-out' : 'unconfigured');
      setDashboardOpen(false);
    } finally {
      setIsBusy(false);
    }
  }, []);

  const changePassword = useCallback(async (password: string) => {
    const client = await requireSupabase();
    const result = await client.auth.updateUser({ password });
    if (result.error) throw result.error;
  }, []);

  const closeLogin = useCallback(() => setLoginOpen(false), []);
  const closeDashboard = useCallback(() => setDashboardOpen(false), []);
  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AdminContextValue>(
    () => ({
      status,
      profile,
      isAdmin: Boolean(profile),
      isBusy,
      error,
      loginOpen,
      dashboardOpen,
      openAdmin,
      closeLogin,
      closeDashboard,
      login,
      logout,
      changePassword,
      clearError,
    }),
    [
      changePassword,
      clearError,
      closeDashboard,
      closeLogin,
      dashboardOpen,
      error,
      isBusy,
      login,
      loginOpen,
      logout,
      openAdmin,
      profile,
      status,
    ],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error('useAdmin must be used inside AdminProvider.');
  return value;
}
