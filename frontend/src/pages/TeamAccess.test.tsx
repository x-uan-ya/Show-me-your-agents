import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import { TeamAccess } from "./TeamAccess";

const admin = {
  id: 1,
  email: "admin@example.test",
  display_name: "Agency Admin",
  role: "admin" as const,
  is_active: true,
  created_at: "2026-09-22T00:00:00Z",
  workspace_id: 10,
  workspace_name: "Northstar Agency",
  workspaces: [{ id: 10, name: "Northstar Agency", role: "admin" as const }],
};

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ currentUser: admin }),
}));

vi.mock("../api/client", () => ({
  api: {
    listWorkspaceMembers: vi.fn(),
    listClients: vi.fn(),
    listClientMembers: vi.fn(),
    addWorkspaceMember: vi.fn(),
    removeWorkspaceMember: vi.fn(),
    assignClientMember: vi.fn(),
    revokeClientMember: vi.fn(),
  },
  isAbortError: () => false,
}));

describe("TeamAccess", () => {
  beforeEach(() => {
    vi.mocked(api.listWorkspaceMembers).mockResolvedValue([{
      user_id: admin.id,
      email: admin.email,
      display_name: admin.display_name,
      role: "admin",
      is_active: true,
      created_at: admin.created_at,
    }]);
    vi.mocked(api.listClients).mockResolvedValue([{
      id: 22,
      workspace_id: 10,
      name: "Harbour Cafe",
      industry: "F&B",
      description: null,
      created_at: admin.created_at,
      updated_at: admin.created_at,
    }]);
    vi.mocked(api.listClientMembers).mockResolvedValue([]);
  });

  it("adds a registered teammate and assigns client-scoped access", async () => {
    const user = userEvent.setup();
    const teammate = {
      user_id: 7,
      email: "reviewer@example.test",
      display_name: "Review Teammate",
      role: "reviewer" as const,
      is_active: true,
      created_at: admin.created_at,
    };
    vi.mocked(api.addWorkspaceMember).mockResolvedValue(teammate);
    vi.mocked(api.assignClientMember).mockResolvedValue({
      user_id: teammate.user_id,
      client_id: 22,
      role: "reviewer",
      is_active: true,
    });

    render(<TeamAccess />);
    await screen.findByText("Agency Admin");
    await user.type(screen.getByLabelText("Member email"), teammate.email);
    await user.selectOptions(screen.getByLabelText("Workspace role"), "reviewer");
    await user.click(screen.getByRole("button", { name: "Add member" }));
    await waitFor(() => expect(api.addWorkspaceMember).toHaveBeenCalledWith(
      teammate.email,
      "reviewer",
    ));

    await user.selectOptions(screen.getByLabelText("Client role"), "reviewer");
    await user.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(api.assignClientMember).toHaveBeenCalledWith(
      22,
      teammate.user_id,
      "reviewer",
    ));
    expect(await screen.findByRole("cell", { name: "Harbour Cafe" })).toBeInTheDocument();
  });
});
