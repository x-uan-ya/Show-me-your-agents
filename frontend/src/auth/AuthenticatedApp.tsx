import { useCallback, useEffect, useState } from "react";

import App from "../App";
import { Landing } from "../pages/Landing";
import { AuthDialog, type AuthMode } from "../pages/Login";
import { AuthProvider, useAuth } from "./AuthContext";

function modeFromHash(): AuthMode | null {
  if (window.location.hash === "#/login") return "login";
  if (window.location.hash === "#/register") return "register";
  if (window.location.hash.startsWith("#/")) return "login";
  return null;
}

function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const [authMode, setAuthMode] = useState<AuthMode | null>(modeFromHash);

  useEffect(() => {
    const syncAuthRoute = () => setAuthMode(modeFromHash());
    window.addEventListener("hashchange", syncAuthRoute);
    return () => window.removeEventListener("hashchange", syncAuthRoute);
  }, []);

  const openAuth = useCallback((mode: AuthMode) => {
    setAuthMode(mode);
    window.location.hash = mode === "login" ? "#/login" : "#/register";
  }, []);

  const closeAuth = useCallback(() => {
    setAuthMode(null);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, []);

  if (isLoading) {
    return (
      <main className="session-restore" role="status">
        <section>
          <img src="/campaign-intelligence-logo.png" alt="" />
          <span className="analysis-pulse" aria-hidden />
          <p>Restoring your secure session…</p>
        </section>
      </main>
    );
  }

  if (isAuthenticated) return <App />;

  return (
    <>
      <Landing onLogin={() => openAuth("login")} onRegister={() => openAuth("register")} />
      {authMode && (
        <AuthDialog mode={authMode} onModeChange={openAuth} onClose={closeAuth} />
      )}
    </>
  );
}

export function AuthenticatedApp() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
