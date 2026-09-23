import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ACTIVE_WORKSPACE_STORAGE_KEY, api, isAbortError } from "../api/client";
import type { CurrentUser, RegistrationPending } from "../types";

interface AuthState {
  currentUser: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  register: (
    displayName: string,
    email: string,
    password: string,
  ) => Promise<RegistrationPending>;
  login: (email: string, password: string) => Promise<void>;
  loginWithEmailCode: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  switchWorkspace: (workspaceId: number) => Promise<void>;
  refreshCurrentUser: (signal?: AbortSignal) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const AUTH_SCOPE_STORAGE_KEY = "customer-intelligence:auth:scope";

function legacyWorkspaceCacheKey(key: string): boolean {
  return /^(customer-intelligence:(selected-client(?:-name)?|brief:|analysis:))/.test(key);
}

function clearLegacyWorkspaceCache() {
  const keys = Array.from({ length: window.localStorage.length }, (_, index) =>
    window.localStorage.key(index),
  ).filter((key): key is string => Boolean(key && legacyWorkspaceCacheKey(key)));
  keys.forEach((key) => window.localStorage.removeItem(key));
}

function clearWorkspaceCache() {
  const keys = Array.from({ length: window.localStorage.length }, (_, index) =>
    window.localStorage.key(index),
  ).filter((key): key is string => Boolean(key?.startsWith("customer-intelligence:")));
  keys.forEach((key) => window.localStorage.removeItem(key));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyAuthenticatedUser = useCallback((user: CurrentUser) => {
    clearLegacyWorkspaceCache();
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, String(user.workspace_id));
    window.localStorage.setItem(
      AUTH_SCOPE_STORAGE_KEY,
      `${user.id}:${user.workspace_id}`,
    );
    setCurrentUser(user);
  }, []);

  const refreshCurrentUser = useCallback(async (signal?: AbortSignal) => {
    try {
      applyAuthenticatedUser(await api.currentUser(signal));
    } catch (error) {
      if (isAbortError(error)) return;
      setCurrentUser(null);
      clearWorkspaceCache();
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [applyAuthenticatedUser]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshCurrentUser(controller.signal);
    return () => controller.abort();
  }, [refreshCurrentUser]);

  const login = useCallback(async (email: string, password: string) => {
    const user = await api.login(email, password);
    applyAuthenticatedUser(user);
  }, [applyAuthenticatedUser]);

  const loginWithEmailCode = useCallback(async (email: string, code: string) => {
    const user = await api.loginWithEmailCode(email, code);
    applyAuthenticatedUser(user);
  }, [applyAuthenticatedUser]);

  const switchWorkspace = useCallback(async (workspaceId: number) => {
    if (currentUser?.workspace_id === workspaceId) return;
    const user = await api.switchWorkspace(workspaceId);
    applyAuthenticatedUser(user);
    window.location.hash = "#/dashboard";
  }, [applyAuthenticatedUser, currentUser?.workspace_id]);

  const register = useCallback(async (
    displayName: string,
    email: string,
    password: string,
  ) => {
    return api.register(displayName, email, password);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      clearWorkspaceCache();
      setCurrentUser(null);
      window.location.hash = "";
    }
  }, []);

  const value = useMemo<AuthState>(() => ({
    currentUser,
    isAuthenticated: currentUser !== null,
    isLoading,
    register,
    login,
    loginWithEmailCode,
    logout,
    switchWorkspace,
    refreshCurrentUser,
  }), [currentUser, isLoading, login, loginWithEmailCode, logout, refreshCurrentUser, register, switchWorkspace]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}

export function useOptionalAuth(): AuthState | null {
  return useContext(AuthContext);
}
