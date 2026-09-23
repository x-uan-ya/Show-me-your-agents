import { useEffect, useMemo, useState, type FormEvent } from "react";

import { api, isAbortError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type {
  Client,
  ClientMember,
  ClientRole,
  UserRole,
  WorkspaceMember,
} from "../types";

const CLIENT_ROLES: ClientRole[] = ["strategist", "reviewer", "viewer"];
const WORKSPACE_ROLES: UserRole[] = ["admin", "strategist", "reviewer", "viewer"];

function assignmentKey(clientId: number, userId: number): string {
  return `${clientId}:${userId}`;
}

export function TeamAccess() {
  const { currentUser } = useAuth();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [assignments, setAssignments] = useState<Map<string, ClientMember>>(new Map());
  const [email, setEmail] = useState("");
  const [workspaceRole, setWorkspaceRole] = useState<UserRole>("viewer");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientRole, setClientRole] = useState<ClientRole>("viewer");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      api.listWorkspaceMembers(controller.signal),
      api.listClients(controller.signal),
    ]).then(async ([nextMembers, nextClients]) => {
      const clientAssignments = await Promise.all(
        nextClients.map((client) => api.listClientMembers(client.id, controller.signal)),
      );
      if (controller.signal.aborted) return;
      setMembers(nextMembers);
      setClients(nextClients);
      setSelectedUserId(String(nextMembers.find((member) => member.user_id !== currentUser?.id)?.user_id ?? ""));
      setSelectedClientId(String(nextClients[0]?.id ?? ""));
      setAssignments(new Map(
        clientAssignments.flat().map((assignment) => [
          assignmentKey(assignment.client_id, assignment.user_id),
          assignment,
        ]),
      ));
    }).catch((reason) => {
      if (!isAbortError(reason)) setError("Team access could not be loaded.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [currentUser?.id, currentUser?.workspace_id]);

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.user_id, member])),
    [members],
  );

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const member = await api.addWorkspaceMember(email.trim(), workspaceRole);
      setMembers((current) => [
        ...current.filter((candidate) => candidate.user_id !== member.user_id),
        member,
      ].sort((left, right) => left.display_name.localeCompare(right.display_name)));
      setSelectedUserId(String(member.user_id));
      setEmail("");
    } catch (reason) {
      if (!isAbortError(reason)) {
        setError("No active account was found for that email, or access could not be updated.");
      }
    } finally {
      setBusy(false);
    }
  };

  const assignClient = async (event: FormEvent) => {
    event.preventDefault();
    const userId = Number(selectedUserId);
    const clientId = Number(selectedClientId);
    if (!userId || !clientId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const assignment = await api.assignClientMember(clientId, userId, clientRole);
      setAssignments((current) => {
        const next = new Map(current);
        next.set(assignmentKey(clientId, userId), assignment);
        return next;
      });
    } catch (reason) {
      if (!isAbortError(reason)) setError("Client access could not be assigned.");
    } finally {
      setBusy(false);
    }
  };

  const revokeClient = async (assignment: ClientMember) => {
    if (busy || !window.confirm("Revoke this client's access for the selected member?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.revokeClientMember(assignment.client_id, assignment.user_id);
      setAssignments((current) => {
        const next = new Map(current);
        next.delete(assignmentKey(assignment.client_id, assignment.user_id));
        return next;
      });
    } catch (reason) {
      if (!isAbortError(reason)) setError("Client access could not be revoked.");
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (member: WorkspaceMember) => {
    if (busy || member.user_id === currentUser?.id) return;
    if (!window.confirm(`Remove ${member.display_name} from ${currentUser?.workspace_name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.removeWorkspaceMember(member.user_id);
      setMembers((current) => current.filter((candidate) => candidate.user_id !== member.user_id));
      setAssignments((current) => new Map(
        [...current].filter(([, assignment]) => assignment.user_id !== member.user_id),
      ));
      if (selectedUserId === String(member.user_id)) setSelectedUserId("");
    } catch (reason) {
      if (!isAbortError(reason)) setError("Workspace access could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  if (currentUser?.role !== "admin") {
    return <main className="page-shell"><p role="alert">Workspace admin access is required.</p></main>;
  }

  return (
    <main className="page-shell">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Workspace security</p>
            <h1>Team access</h1>
            <p>Control who belongs to {currentUser.workspace_name} and which customers each person may access.</p>
          </div>
          <span className="context-pill">{members.length} active member{members.length === 1 ? "" : "s"}</span>
        </header>

        {error && <p role="alert" className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 text-sm text-amber-200">{error}</p>}
        {loading ? <p role="status" className="py-8 text-center text-slate-400">Loading team access…</p> : (
          <>
            <section className="surface-card p-5 sm:p-6">
              <p className="section-kicker">Workspace membership</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Add an existing account</h2>
              <p className="mt-2 text-sm text-slate-400">The teammate must register and verify their email first. Viewer, strategist and reviewer access remains client-specific; workspace admins can access every client in this workspace.</p>
              <form className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_auto]" onSubmit={(event) => void addMember(event)}>
                <input aria-label="Member email" type="email" required placeholder="teammate@agency.com" value={email} onChange={(event) => setEmail(event.target.value)} />
                <select aria-label="Workspace role" value={workspaceRole} onChange={(event) => setWorkspaceRole(event.target.value as UserRole)}>
                  {WORKSPACE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <button className="primary-button" type="submit" disabled={busy || !email.trim()}>Add member</button>
              </form>
              <div className="mt-5 overflow-x-auto">
                <table className="campaign-records-table">
                  <thead><tr><th>Member</th><th>Workspace role</th><th><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{members.map((member) => (
                    <tr key={member.user_id}>
                      <td><strong>{member.display_name}</strong><small>{member.email}</small></td>
                      <td className="capitalize">{member.role}</td>
                      <td className="text-right">{member.user_id !== currentUser.id && <button className="danger-button" type="button" disabled={busy} onClick={() => void removeMember(member)}>Remove</button>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>

            <section className="surface-card p-5 sm:p-6">
              <p className="section-kicker">Customer boundary</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Assign client access</h2>
              <form className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_auto]" onSubmit={(event) => void assignClient(event)}>
                <select aria-label="Team member" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} required>
                  <option value="">Select member</option>
                  {members.filter((member) => member.user_id !== currentUser.id).map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}</option>)}
                </select>
                <select aria-label="Client access" value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)} required>
                  <option value="">Select client</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
                <select aria-label="Client role" value={clientRole} onChange={(event) => setClientRole(event.target.value as ClientRole)}>
                  {CLIENT_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <button className="primary-button" type="submit" disabled={busy || !selectedUserId || !selectedClientId}>Assign</button>
              </form>

              <div className="mt-5 overflow-x-auto">
                <table className="campaign-records-table">
                  <thead><tr><th>Customer</th><th>Member</th><th>Client role</th><th><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{[...assignments.values()].map((assignment) => {
                    const client = clients.find((candidate) => candidate.id === assignment.client_id);
                    const member = memberById.get(assignment.user_id);
                    return (
                      <tr key={assignmentKey(assignment.client_id, assignment.user_id)}>
                        <td><strong>{client?.name ?? `Client #${assignment.client_id}`}</strong></td>
                        <td><strong>{member?.display_name ?? `User #${assignment.user_id}`}</strong><small>{member?.email ?? ""}</small></td>
                        <td className="capitalize">{assignment.role}</td>
                        <td className="text-right"><button className="danger-button" type="button" disabled={busy} onClick={() => void revokeClient(assignment)}>Revoke</button></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
                {assignments.size === 0 && <p className="py-8 text-center text-sm text-slate-400">No direct client assignments yet.</p>}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
