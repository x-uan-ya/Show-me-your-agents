import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import { ClientSelector } from "./ClientSelector";

vi.mock("../api/client", () => ({
  api: {
    listClients: vi.fn(),
    createClient: vi.fn(),
  },
  isAbortError: () => false,
}));

describe("ClientSelector", () => {
  beforeEach(() => {
    vi.mocked(api.listClients).mockResolvedValue([
      {
        id: 7,
        name: "Northstar Cafe",
        industry: "F&B",
        description: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]);
  });

  it("keeps an empty selection as null", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ClientSelector selectedId={7} onSelect={onSelect} />);

    const select = await screen.findByLabelText("Client");
    await user.selectOptions(select, "");

    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("adds a client and selects the created id", async () => {
    vi.mocked(api.createClient).mockResolvedValue({
      id: 8,
      name: "Harbour Studio",
      industry: "Wellness",
      description: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ClientSelector selectedId={null} onSelect={onSelect} />);

    await screen.findByRole("option", { name: /Northstar Cafe/ });
    await user.type(screen.getByLabelText("Quick add"), "Harbour Studio");
    await user.type(screen.getByLabelText("Client industry"), "Wellness");
    await user.click(screen.getByRole("button", { name: "Add client" }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(8));
    expect(api.createClient).toHaveBeenCalledWith(
      { name: "Harbour Studio", industry: "Wellness" },
      expect.any(AbortSignal),
    );
  });
});
