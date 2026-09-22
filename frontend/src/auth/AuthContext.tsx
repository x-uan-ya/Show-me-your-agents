import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, isAbortError } from "../api/client";
import type { CurrentUser } from "../types";

interface AuthState {
  currentUser: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshCurrentUser: (signal?: AbortSignal) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function clearWorkspaceCache() {
  const keys = Array.from({ length: window.localStorage.length }, (_, index) =>
    window.localStorage.key(index),
  ).filter((key): key is string => Boolean(key?.startsWith("customer-intelligence:")));
  keys.forEach((key) => window.localStorage.removeItem(key));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCurrentUser = useCallback(async (signal?: AbortSignal) => {
    try {
      setCurrentUser(await api.currentUser(signal));
    } catch (error) {
      if (isAbortError(error)) return;
      setCurrentUser(null);
      clearWorkspaceCache();
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refreshCurrentUser(controller.signal);
    return () => controller.abort();
  }, [refreshCurrentUser]);

  const login = useCallback(async (email: string, password: string) => {
    const user = await api.login(email, password);
    setCurrentUser(user);
  }, []);

  const register = useCallback(async (
    displayName: string,
    email: string,
    password: string,
  ) => {
    await api.register(displayName, email, password);
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
    logout,
    refreshCurrentUser,
  }), [currentUser, isLoading, login, logout, refreshCurrentUser, register]);

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
