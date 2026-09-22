import { useEffect, useState, type FormEvent } from "react";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export type AuthMode = "login" | "register";
type LoginFlow = "password" | "email-request" | "email-verify" | "reset-request" | "reset-verify";

interface Props {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
}

const FLOW_COPY: Record<LoginFlow, { kicker: string; title: string; description: string }> = {
  password: {
    kicker: "Welcome back",
    title: "Sign in to Campaign Intelligence",
    description: "Use your password or request a one-time code by email.",
  },
  "email-request": {
    kicker: "Passwordless sign in",
    title: "Email me a sign-in code",
    description: "We will send a six-digit code to the email linked to your account.",
  },
  "email-verify": {
    kicker: "Check your inbox",
    title: "Enter your sign-in code",
    description: "The code expires in 10 minutes and can only be used once.",
  },
  "reset-request": {
    kicker: "Account recovery",
    title: "Reset your password",
    description: "Enter your account email and we will send a verification code.",
  },
  "reset-verify": {
    kicker: "Verify and reset",
    title: "Choose a new password",
    description: "Enter the email code, then create a new password for your account.",
  },
};

export function AuthDialog({ mode, onModeChange, onClose }: Props) {
  const { login, loginWithEmailCode, register } = useAuth();
  const [loginFlow, setLoginFlow] = useState<LoginFlow>("password");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
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

  const clearSensitiveFields = () => {
    setPassword("");
    setConfirmPassword("");
    setCode("");
  };

  const selectMode = (nextMode: AuthMode) => {
    setError(null);
    setSuccess(null);
    clearSensitiveFields();
    setLoginFlow("password");
    onModeChange(nextMode);
  };

  const selectLoginFlow = (nextFlow: LoginFlow) => {
    setError(null);
    setSuccess(null);
    clearSensitiveFields();
    setLoginFlow(nextFlow);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (
      (mode === "register" || loginFlow === "reset-verify")
      && password !== confirmPassword
    ) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (mode === "register") {
        await register(displayName, email, password);
        clearSensitiveFields();
        setLoginFlow("password");
        onModeChange("login");
        setSuccess("Your workspace account is ready. Sign in to continue.");
      } else if (loginFlow === "password") {
        await login(email, password);
        window.location.hash = "#/dashboard";
      } else if (loginFlow === "email-request") {
        const result = await api.requestEmailLoginCode(email);
        setLoginFlow("email-verify");
        setSuccess(result.message);
      } else if (loginFlow === "email-verify") {
        await loginWithEmailCode(email, code);
        window.location.hash = "#/dashboard";
      } else if (loginFlow === "reset-request") {
        const result = await api.requestPasswordResetCode(email);
        setLoginFlow("reset-verify");
        setSuccess(result.message);
      } else {
        const result = await api.confirmPasswordReset(email, code, password);
        clearSensitiveFields();
        setLoginFlow("password");
        setSuccess(result.message);
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      if (mode === "register" && message.toLowerCase().includes("already exists")) {
        setError("An account with this email already exists. Try signing in instead.");
      } else if (mode === "register") {
        setError("We couldn't create your account. Please try again.");
      } else if (loginFlow === "password") {
        setError("Invalid email or password.");
      } else if (loginFlow === "email-verify" || loginFlow === "reset-verify") {
        setError("That verification code is invalid or has expired.");
      } else {
        setError("We couldn't request a verification code. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const flowCopy = FLOW_COPY[loginFlow];
  const verificationStep = loginFlow === "email-verify" || loginFlow === "reset-verify";
  const passwordResetStep = loginFlow === "reset-verify";
  const buttonLabel = mode === "register"
    ? "Create account"
    : loginFlow === "password"
      ? "Sign in to workspace"
      : loginFlow === "email-request" || loginFlow === "reset-request"
        ? "Send verification code"
        : loginFlow === "email-verify"
          ? "Verify and sign in"
          : "Reset password";

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
            <span className="landing-kicker">{mode === "register" ? "Start your workspace" : flowCopy.kicker}</span>
            <h1 id="auth-title">{mode === "register" ? "Create your agency account" : flowCopy.title}</h1>
            <p>{mode === "register" ? "Use your work email. You can add your first client after signing in." : flowCopy.description}</p>
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
              <input
                type="email"
                autoComplete="username"
                required
                readOnly={verificationStep}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@agency.com"
              />
            </label>

            {mode === "login" && verificationStep && (
              <label>
                Verification code
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                />
              </label>
            )}

            {(mode === "register" || loginFlow === "password" || passwordResetStep) && (
              <label>
                {passwordResetStep ? "New password" : "Password"}
                <input
                  type="password"
                  autoComplete={mode === "login" && loginFlow === "password" ? "current-password" : "new-password"}
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                />
              </label>
            )}
            {(mode === "register" || passwordResetStep) && (
              <label>
                Confirm {passwordResetStep ? "new " : ""}password
                <input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" />
              </label>
            )}

            {mode === "login" && loginFlow === "password" && (
              <div className="auth-inline-actions">
                <button type="button" onClick={() => selectLoginFlow("email-request")}>Email me a sign-in code</button>
                <button type="button" onClick={() => selectLoginFlow("reset-request")}>Forgot password?</button>
              </div>
            )}
            {mode === "login" && loginFlow !== "password" && (
              <div className="auth-inline-actions">
                <button type="button" onClick={() => selectLoginFlow("password")}>← Use password instead</button>
                {verificationStep && (
                  <button type="button" onClick={() => selectLoginFlow(loginFlow === "email-verify" ? "email-request" : "reset-request")}>Request another code</button>
                )}
              </div>
            )}

            {success && <p className="auth-success" role="status">{success}</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? "Please wait…" : buttonLabel}
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
