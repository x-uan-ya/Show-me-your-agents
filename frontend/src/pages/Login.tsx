import { useEffect, useState, type FormEvent } from "react";

import { useAuth } from "../auth/AuthContext";

export type AuthMode = "login" | "register";

interface Props {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
}

export function AuthDialog({ mode, onModeChange, onClose }: Props) {
  const { login, register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("auth-dialog-open");
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("auth-dialog-open");
    };
  }, [onClose]);

  const selectMode = (nextMode: AuthMode) => {
    setError(null);
    setSuccess(null);
    setPassword("");
    setConfirmPassword("");
    onModeChange(nextMode);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (mode === "register") {
        await register(displayName, email, password);
        setPassword("");
        setConfirmPassword("");
        onModeChange("login");
        setSuccess("Your workspace account is ready. Sign in to continue.");
      } else {
        await login(email, password);
        window.location.hash = "#/dashboard";
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      if (mode === "register" && message.toLowerCase().includes("already exists")) {
        setError("An account with this email already exists. Try signing in instead.");
      } else {
        setError(mode === "login" ? "Invalid email or password." : "We couldn't create your account. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-modal-backdrop" onMouseDown={onClose}>
      <section
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <aside className="auth-story">
          <a className="landing-brand" href="#" onClick={onClose}>
            <img src="/campaign-intelligence-logo.png" alt="" />
            <span>Campaign Intelligence</span>
          </a>
          <div>
            <span className="landing-kicker">Built for agency teams</span>
            <h2>Every campaign starts with customer truth.</h2>
            <p>Bring client signals, strategy and a reviewable content plan into one evidence-led workspace.</p>
          </div>
          <ul>
            <li><i>✓</i> Separate access for every client</li>
            <li><i>✓</i> Evidence linked to every insight</li>
            <li><i>✓</i> Campaign plans your team can review</li>
          </ul>
          <div className="auth-story-orbit" aria-hidden="true"><span /><span /><span /></div>
        </aside>

        <div className="auth-form-panel">
          <button className="auth-close" type="button" onClick={onClose} aria-label="Close authentication">×</button>
          <div className="auth-tabs" role="tablist" aria-label="Authentication options">
            <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => selectMode("login")}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => selectMode("register")}>Create account</button>
          </div>

          <header className="auth-heading">
            <span className="landing-kicker">{mode === "login" ? "Welcome back" : "Start your workspace"}</span>
            <h1 id="auth-title">{mode === "login" ? "Sign in to Campaign Intelligence" : "Create your agency account"}</h1>
            <p>{mode === "login" ? "Continue planning evidence-led campaigns." : "Use your work email. You can add your first client after signing in."}</p>
          </header>

          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            {mode === "register" && (
              <label>
                Full name
                <input type="text" autoComplete="name" minLength={2} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Sarah Tan" />
              </label>
            )}
            <label>
              Work email
              <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@agency.com" />
            </label>
            <label>
              Password
              <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
            </label>
            {mode === "register" && (
              <label>
                Confirm password
                <input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" />
              </label>
            )}
            {success && <p className="auth-success" role="status">{success}</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? "Please wait…" : mode === "login" ? "Sign in to workspace" : "Create account"}
              {!submitting && <span aria-hidden="true">→</span>}
            </button>
          </form>

          <p className="auth-switch">
            {mode === "login" ? "New to Campaign Intelligence?" : "Already have an account?"}{" "}
            <button type="button" onClick={() => selectMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
