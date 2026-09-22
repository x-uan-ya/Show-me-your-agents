import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import type { CurrentUser } from "../types";
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

  it("email registration switches back to Login after creating an account", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "currentUser").mockRejectedValue(new Error("401"));
    const register = vi.spyOn(api, "register").mockResolvedValue(userRecord);
    render(<AuthenticatedApp />);

    await user.click(await screen.findByRole("button", { name: /Start your workspace/i }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Full name"), "Sarah Tan");
    await user.type(dialog.getByLabelText("Work email"), userRecord.email);
    await user.type(dialog.getByLabelText("Password"), "ValidPassword!2026");
    await user.type(dialog.getByLabelText("Confirm password"), "ValidPassword!2026");
    await user.click(dialog.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(register).toHaveBeenCalledWith("Sarah Tan", userRecord.email, "ValidPassword!2026"));
    expect(await screen.findByText("Your workspace account is ready. Sign in to continue.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in to Campaign Intelligence" })).toBeInTheDocument();
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
