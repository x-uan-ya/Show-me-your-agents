import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, api } from "../api/client";
import type { CurrentUser, RegistrationPending } from "../types";
import { AuthenticatedApp } from "./AuthenticatedApp";

const userRecord: CurrentUser = {
  id: 4,
  email: "strategist@example.test",
  display_name: "Sarah Tan",
  role: "strategist",
  is_active: true,
  created_at: "2026-09-22T00:00:00Z",
  workspace_id: 3,
  workspace_name: "Northstar Agency",
  workspaces: [{ id: 3, name: "Northstar Agency", role: "strategist" }],
};

const pendingRegistration: RegistrationPending = {
  verification_required: true,
  email: userRecord.email,
  verification_token: "registration-browser-token-1234567890",
  resend_after_seconds: 60,
  message: "Check your email for a verification code to finish registration.",
};

function mockWorkspaceApis() {
  vi.spyOn(api, "health").mockResolvedValue({ status: "ok" });
  vi.spyOn(api, "taxonomy").mockResolvedValue([]);
  vi.spyOn(api, "listCalendarItems").mockResolvedValue([]);
  vi.spyOn(api, "listClients").mockResolvedValue([]);
}

describe("AuthenticatedApp", () => {
  beforeEach(() => {
    window.location.hash = "";
    mockWorkspaceApis();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.location.hash = "";
  });

  it("shows the product homepage before authentication", async () => {
    vi.spyOn(api, "currentUser").mockRejectedValue(new Error("401"));
    render(<AuthenticatedApp />);

    expect(await screen.findByRole("heading", { name: /Turn customer evidence/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start your workspace/i })).toBeInTheDocument();
  });

  it("opens Login for a directly requested protected view", async () => {
    window.location.hash = "#/campaign-plan";
    vi.spyOn(api, "currentUser").mockRejectedValue(new Error("401"));
    render(<AuthenticatedApp />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in to Campaign Intelligence" })).toBeInTheDocument();
  });

  it("successful login opens the protected workspace", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("customer-intelligence:selected-client", "999");
    vi.spyOn(api, "currentUser").mockRejectedValue(new Error("401"));
    const login = vi.spyOn(api, "login").mockResolvedValue(userRecord);
    render(<AuthenticatedApp />);

    const signInButtons = await screen.findAllByRole("button", { name: "Sign in" });
    await user.click(signInButtons[0]);
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Work email"), userRecord.email);
    await user.type(dialog.getByLabelText("Password"), "ValidPassword!2026");
    await user.click(dialog.getByRole("button", { name: "Sign in to workspace" }));

    await screen.findByText("Sarah Tan");
    expect(login).toHaveBeenCalledWith(userRecord.email, "ValidPassword!2026");
    expect(window.location.hash).toBe("#/dashboard");
    expect(window.localStorage.getItem("customer-intelligence:selected-client")).toBeNull();
    expect(window.localStorage.getItem("customer-intelligence:auth:workspace-id")).toBe("3");
  });

  it("registers in two steps and does not authenticate before email verification", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "currentUser").mockRejectedValue(new Error("401"));
    const register = vi.spyOn(api, "register").mockResolvedValue(pendingRegistration);
    const verifyRegistration = vi.spyOn(api, "verifyRegistrationEmail").mockResolvedValue({
      message: "Email verified. Sign in to continue.",
    });
    render(<AuthenticatedApp />);

    await user.click(await screen.findByRole("button", { name: /Start your workspace/i }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Full name"), "Sarah Tan");
    await user.type(dialog.getByLabelText("Work email"), userRecord.email);
    await user.type(dialog.getByLabelText("Password"), "ValidPassword!2026");
    await user.type(dialog.getByLabelText("Confirm password"), "ValidPassword!2026");
    await user.click(dialog.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(register).toHaveBeenCalledWith("Sarah Tan", userRecord.email, "ValidPassword!2026"));
    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(screen.queryByText("Sarah Tan")).not.toBeInTheDocument();
    expect(dialog.queryByLabelText("Password")).not.toBeInTheDocument();
    const stored = window.sessionStorage.getItem("campaign-intelligence:pending-registration");
    expect(stored).toContain(pendingRegistration.verification_token);
    expect(stored).not.toContain("ValidPassword!2026");

    await user.type(dialog.getByLabelText("Verification code"), "123456");
    await user.click(dialog.getByRole("button", { name: "Verify email" }));

    await waitFor(() => expect(verifyRegistration).toHaveBeenCalledWith(
      userRecord.email,
      "123456",
      pendingRegistration.verification_token,
    ));
    expect(await screen.findByText("Email verified. Sign in to continue.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in to Campaign Intelligence" })).toBeInTheDocument();
    expect(window.sessionStorage.getItem("campaign-intelligence:pending-registration")).toBeNull();
  });

  it("shows a safe error for an invalid or expired registration code", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "currentUser").mockRejectedValue(new Error("401"));
    vi.spyOn(api, "register").mockResolvedValue(pendingRegistration);
    const verifyRegistration = vi.spyOn(api, "verifyRegistrationEmail").mockRejectedValue(
      new Error("backend verification details"),
    );
    render(<AuthenticatedApp />);

    await user.click(await screen.findByRole("button", { name: /Start your workspace/i }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Full name"), "Sarah Tan");
    await user.type(dialog.getByLabelText("Work email"), userRecord.email);
    await user.type(dialog.getByLabelText("Password"), "ValidPassword!2026");
    await user.type(dialog.getByLabelText("Confirm password"), "ValidPassword!2026");
    await user.click(dialog.getByRole("button", { name: "Continue" }));
    await user.type(await dialog.findByLabelText("Verification code"), "999999");
    await user.click(dialog.getByRole("button", { name: "Verify email" }));

    await waitFor(() => expect(verifyRegistration).toHaveBeenCalled());
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "That verification code is invalid or has expired.",
    );
    expect(dialog.queryByText("backend verification details")).not.toBeInTheDocument();
    expect(dialog.getByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
  });

  it("enforces the registration resend cooldown in the UI", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "currentUser").mockRejectedValue(new Error("401"));
    vi.spyOn(api, "register").mockResolvedValue({
      ...pendingRegistration,
      resend_after_seconds: 0,
    });
    const resend = vi.spyOn(api, "resendRegistrationOtp").mockResolvedValue({
      message: "If a pending registration matches those details, a verification code has been sent.",
      resend_after_seconds: 60,
    });
    render(<AuthenticatedApp />);

    await user.click(await screen.findByRole("button", { name: /Start your workspace/i }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Full name"), "Sarah Tan");
    await user.type(dialog.getByLabelText("Work email"), userRecord.email);
    await user.type(dialog.getByLabelText("Password"), "ValidPassword!2026");
    await user.type(dialog.getByLabelText("Confirm password"), "ValidPassword!2026");
    await user.click(dialog.getByRole("button", { name: "Continue" }));

    await user.click(await dialog.findByRole("button", { name: "Resend verification code" }));
    await waitFor(() => expect(resend).toHaveBeenCalledWith(
      userRecord.email,
      pendingRegistration.verification_token,
    ));
    expect(dialog.getByRole("button", { name: "Resend code in 60s" })).toBeDisabled();
  });

  it("restores only safe pending-registration state after a refresh", async () => {
    const safePendingState = {
      email: userRecord.email,
      verificationToken: pendingRegistration.verification_token,
      resendAvailableAt: Date.now() + 60_000,
    };
    window.sessionStorage.setItem(
      "campaign-intelligence:pending-registration",
      JSON.stringify(safePendingState),
    );
    vi.spyOn(api, "currentUser").mockRejectedValue(new Error("401"));
    render(<AuthenticatedApp />);

    await userEvent.click(await screen.findByRole("button", { name: /Start your workspace/i }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(await dialog.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(dialog.getByLabelText("Work email")).toHaveValue(userRecord.email);
    expect(dialog.getByRole("button", { name: /Resend code in/ })).toBeDisabled();
    expect(dialog.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(dialog.getByLabelText("Verification code")).toHaveValue("");

    const persisted = window.sessionStorage.getItem("campaign-intelligence:pending-registration") ?? "";
    expect(persisted).not.toMatch(/password|otp|code/i);
  });

  it("failed login shows a safe error", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/login";
    vi.spyOn(api, "currentUser").mockRejectedValue(new Error("401"));
    vi.spyOn(api, "login").mockRejectedValue(new Error("backend detail"));
    render(<AuthenticatedApp />);

    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Work email"), userRecord.email);
    await user.type(dialog.getByLabelText("Password"), "WrongPassword!2026");
    await user.click(dialog.getByRole("button", { name: "Sign in to workspace" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(screen.queryByText("backend detail")).not.toBeInTheDocument();
  });

  it("shows a useful message when password login is rate-limited", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/login";
    vi.spyOn(api, "currentUser").mockRejectedValue(new Error("401"));
    vi.spyOn(api, "login").mockRejectedValue(
      new ApiError("Too many requests. Please try again later.", 429, 60),
    );
    render(<AuthenticatedApp />);

    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Work email"), userRecord.email);
    await user.type(dialog.getByLabelText("Password"), "WrongPassword!2026");
    await user.click(dialog.getByRole("button", { name: "Sign in to workspace" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Too many sign-in attempts. Please wait a few minutes and try again.",
    );
  });

  it("shows a useful message when an OTP request is rate-limited", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "currentUser").mockRejectedValue(new Error("401"));
    vi.spyOn(api, "requestEmailLoginCode").mockRejectedValue(
      new ApiError("Too many requests. Please try again later.", 429, 600),
    );
    render(<AuthenticatedApp />);

    const signInButtons = await screen.findAllByRole("button", { name: "Sign in" });
    await user.click(signInButtons[0]);
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Email me a sign-in code" }));
    await user.type(dialog.getByLabelText("Work email"), userRecord.email);
    await user.click(dialog.getByRole("button", { name: "Send verification code" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Too many verification code requests. Please try again later.",
    );
  });

  it("shows a useful message when registration is rate-limited", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "currentUser").mockRejectedValue(new Error("401"));
    vi.spyOn(api, "register").mockRejectedValue(
      new ApiError("Too many requests. Please try again later.", 429, 3600),
    );
    render(<AuthenticatedApp />);

    await user.click(await screen.findByRole("button", { name: /Start your workspace/i }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Full name"), "Sarah Tan");
    await user.type(dialog.getByLabelText("Work email"), userRecord.email);
    await user.type(dialog.getByLabelText("Password"), "ValidPassword!2026");
    await user.type(dialog.getByLabelText("Confirm password"), "ValidPassword!2026");
    await user.click(dialog.getByRole("button", { name: "Continue" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Too many registration attempts. Please try again later.",
    );
  });

  it("signs in with a single-use email code", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "currentUser").mockRejectedValue(new Error("401"));
    const requestCode = vi.spyOn(api, "requestEmailLoginCode").mockResolvedValue({
      message: "If an active account exists for that email, a verification code has been sent.",
    });
    const verifyCode = vi.spyOn(api, "loginWithEmailCode").mockResolvedValue(userRecord);
    render(<AuthenticatedApp />);

    const signInButtons = await screen.findAllByRole("button", { name: "Sign in" });
    await user.click(signInButtons[0]);
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Email me a sign-in code" }));
    await user.type(dialog.getByLabelText("Work email"), userRecord.email);
    await user.click(dialog.getByRole("button", { name: "Send verification code" }));
    await waitFor(() => expect(requestCode).toHaveBeenCalledWith(userRecord.email));

    await user.type(dialog.getByLabelText("Verification code"), "123456");
    await user.click(dialog.getByRole("button", { name: "Verify and sign in" }));
    await screen.findByText("Sarah Tan");
    expect(verifyCode).toHaveBeenCalledWith(userRecord.email, "123456");
  });

  it("resets a password after email-code verification", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "currentUser").mockRejectedValue(new Error("401"));
    const requestReset = vi.spyOn(api, "requestPasswordResetCode").mockResolvedValue({
      message: "If an active account exists for that email, a verification code has been sent.",
    });
    const confirmReset = vi.spyOn(api, "confirmPasswordReset").mockResolvedValue({
      message: "Password reset successfully. Sign in with your new password.",
    });
    render(<AuthenticatedApp />);

    const signInButtons = await screen.findAllByRole("button", { name: "Sign in" });
    await user.click(signInButtons[0]);
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Forgot password?" }));
    await user.type(dialog.getByLabelText("Work email"), userRecord.email);
    await user.click(dialog.getByRole("button", { name: "Send verification code" }));
    await waitFor(() => expect(requestReset).toHaveBeenCalledWith(userRecord.email));

    await user.type(dialog.getByLabelText("Verification code"), "654321");
    await user.type(dialog.getByLabelText("New password"), "ChangedPassword!2026");
    await user.type(dialog.getByLabelText("Confirm new password"), "ChangedPassword!2026");
    await user.click(dialog.getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(confirmReset).toHaveBeenCalledWith(
      userRecord.email,
      "654321",
      "ChangedPassword!2026",
    ));
    expect(await screen.findByText("Password reset successfully. Sign in with your new password.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in to workspace" })).toBeInTheDocument();
  });

  it("restores the current user through auth/me", async () => {
    const currentUser = vi.spyOn(api, "currentUser").mockResolvedValue(userRecord);
    render(<AuthenticatedApp />);

    expect(await screen.findByText("Sarah Tan")).toBeInTheDocument();
    expect(currentUser).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("switches workspace context and updates the request scope", async () => {
    const user = userEvent.setup();
    const multiWorkspaceUser: CurrentUser = {
      ...userRecord,
      workspaces: [
        ...userRecord.workspaces,
        { id: 9, name: "Second Agency", role: "reviewer" },
      ],
    };
    const switchedUser: CurrentUser = {
      ...multiWorkspaceUser,
      role: "reviewer",
      workspace_id: 9,
      workspace_name: "Second Agency",
    };
    vi.spyOn(api, "currentUser").mockResolvedValue(multiWorkspaceUser);
    const switchWorkspace = vi.spyOn(api, "switchWorkspace").mockResolvedValue(switchedUser);
    render(<AuthenticatedApp />);

    await user.selectOptions(await screen.findByLabelText("Workspace"), "9");

    await waitFor(() => expect(switchWorkspace).toHaveBeenCalledWith(9));
    expect(window.localStorage.getItem("customer-intelligence:auth:workspace-id")).toBe("9");
    expect(await screen.findByText("Second Agency · reviewer")).toBeInTheDocument();
  });

  it("logout clears auth state and returns to the homepage", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "currentUser").mockResolvedValue(userRecord);
    const logout = vi.spyOn(api, "logout").mockResolvedValue(undefined);
    render(<AuthenticatedApp />);

    const buttons = await screen.findAllByRole("button", { name: "Logout" });
    await user.click(buttons[0]);

    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: /Turn customer evidence/i })).toBeInTheDocument();
  });
});
