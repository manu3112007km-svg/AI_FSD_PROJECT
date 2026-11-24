import React, { useEffect, useState } from 'react';
import { RotateCcw, Shield, UserPlus } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { VALID_ROLES } from '../server/domain/rules';
import type {
  AuditLogRecord,
  AuthUser,
  OrganizationRecord,
  UserRole,
} from '../types/resqnet';
import { StatusIndicator } from '../components/StatusBadge';

export function UserManagementPage({
  onGlobalRefresh,
}: {
  onGlobalRefresh: () => Promise<void>;
}) {
  const { user, updateSessionToken } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [orgs, setOrgs] = useState<OrganizationRecord[]>([]);
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('EMERGENCY_COORDINATOR');

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [uRes, oRes, lRes] = await Promise.all([
        apiFetch<{ users: AuthUser[] }>('/api/admin/users'),
        apiFetch<{ organizations: OrganizationRecord[] }>('/api/admin/organizations'),
        apiFetch<{ logs: AuditLogRecord[] }>('/api/admin/audit-logs'),
      ]);
      setUsers(uRes.users);
      setOrgs(oRes.organizations);
      setLogs(lRes.logs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') {
      void loadAdminData();
    }
  }, [user?.role]);

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="gold-card-surface rounded-lg p-8 text-center text-sm font-bold text-[#7F1D1D]">
        Access Denied: User Management, Organization Approvals, and Audit Logs are restricted to Super Administrators.
      </div>
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: newName,
          email: newEmail,
          password: newPassword,
          role: newRole,
        }),
      });
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setFeedback('User account created.');
      await loadAdminData();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to create user.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateUser = async (targetId: number, patch: { role?: UserRole; isActive?: boolean }) => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/users/${targetId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setFeedback('User permissions updated.');
      await loadAdminData();
    } finally {
      setBusy(false);
    }
  };

  const handleOrgStatus = async (orgId: number, approvalStatus: 'APPROVED' | 'PENDING' | 'SUSPENDED') => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/organizations/${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify({ approvalStatus }),
      });
      setFeedback('Organization approval status updated.');
      await loadAdminData();
    } finally {
      setBusy(false);
    }
  };

  const handleResetDemo = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/admin/reset-demo', {
        method: 'POST',
      });
      updateSessionToken(res.token, res.user);
      setFeedback('Demonstration dataset reset across all 17 database tables.');
      await Promise.all([loadAdminData(), onGlobalRefresh()]);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="gold-card-surface rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#493713]">
            Platform Governance &amp; User Management
          </h1>
          <p className="text-sm text-[#29251C]/85 mt-1">
            Manage user roles, approve emergency service organizations, inspect audit logs, or reset demonstration data.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleResetDemo()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-[#B91C1C] bg-[#FDECEC] hover:bg-[#FECACA] text-xs font-bold text-[#7F1D1D] cursor-pointer"
        >
          <RotateCcw className="h-4 w-4" /> Reset Demo Data
        </button>
      </div>

      {feedback && (
        <div className="rounded-md border border-[#C9A227] bg-[#F7E7A1] px-4 py-2.5 text-sm font-bold text-[#493713]">
          {feedback}
        </div>
      )}

      {/* Create User Form */}
      <form onSubmit={handleCreateUser} className="gold-card-surface rounded-lg p-5 space-y-4">
        <h2 className="text-lg font-bold text-[#493713] inline-flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Create Authorized Account
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            type="text"
            required
            placeholder="Full Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm"
          />
          <input
            type="email"
            required
            placeholder="Email Address"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="Password (min 8 chars)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as UserRole)}
            className="rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm font-bold"
          >
            {VALID_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-md bg-[#D4AF37] hover:bg-[#C9A227] border border-[#493713] text-xs font-bold text-[#29251C] cursor-pointer"
          >
            Create User Account
          </button>
        </div>
      </form>

      {/* Users Table */}
      <div className="gold-card-surface rounded-lg p-5 space-y-3 min-w-0">
        <h2 className="text-lg font-bold text-[#493713] inline-flex items-center gap-2">
          <Shield className="h-4 w-4" /> Registered User Accounts ({users.length})
        </h2>
        {loading ? (
          <p className="text-xs text-[#493713]">Loading accounts...</p>
        ) : (
          <div className="overflow-x-auto max-w-full">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#C9A227] bg-[#FFF2C6] text-xs font-bold text-[#493713]">
                  <th className="py-2 px-3">Name</th>
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">Role</th>
                  <th className="py-2 px-3">Organization</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5D399]">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2 px-3 font-bold">
                      {u.fullName} {u.isDemo ? '(Demo)' : ''}
                    </td>
                    <td className="py-2 px-3">{u.email}</td>
                    <td className="py-2 px-3">
                      <select
                        aria-label={`Change role for ${u.email}`}
                        value={u.role}
                        disabled={busy || u.id === user.id}
                        onChange={(e) =>
                          void handleUpdateUser(u.id, { role: e.target.value as UserRole })
                        }
                        className="rounded border border-[#C9A227] bg-[#FFF2C6] px-2 py-1 text-xs font-bold"
                      >
                        {VALID_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-xs">{u.organizationName || 'Independent'}</td>
                    <td className="py-2 px-3 text-xs font-bold">
                      {u.isActive ? 'Active' : 'Suspended'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {u.id !== user.id && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleUpdateUser(u.id, { isActive: !u.isActive })}
                          className="px-2.5 py-1 rounded border border-[#C9A227] bg-[#FFF2C6] hover:bg-[#F7E7A1] text-xs font-bold cursor-pointer"
                        >
                          {u.isActive ? 'Suspend' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Organization Approvals & Audit Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="gold-card-surface rounded-lg p-5 space-y-3 min-w-0">
          <h2 className="text-lg font-bold text-[#493713]">
            Emergency Service Organizations ({orgs.length})
          </h2>
          <div className="space-y-2.5">
            {orgs.map((o) => (
              <div
                key={o.id}
                className="rounded border border-[#C9A227] bg-[#FFF2C6] p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm text-[#29251C]">{o.name}</p>
                  <p className="text-[#493713]">
                    {o.orgType} · {o.jurisdiction}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusIndicator status={o.approvalStatus} />
                  {o.approvalStatus !== 'APPROVED' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleOrgStatus(o.id, 'APPROVED')}
                      className="px-2.5 py-1 rounded border border-[#15803D] bg-[#ECFDF5] font-bold text-[#14532D] cursor-pointer"
                    >
                      Approve
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="gold-card-surface rounded-lg p-5 space-y-3 min-w-0">
          <h2 className="text-lg font-bold text-[#493713]">Platform Audit Logs</h2>
          <div className="space-y-2 max-h-[340px] overflow-y-auto">
            {logs.map((l) => (
              <div
                key={l.id}
                className="rounded border border-[#C0C0C0] bg-[#FFF2C6]/65 p-2.5 text-xs"
              >
                <div className="flex justify-between font-bold text-[#493713]">
                  <span>{l.action}</span>
                  <span className="tabular-nums">{new Date(l.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-[#29251C] mt-0.5">
                  {l.actorName || 'System'} ({l.actorRole || 'SYSTEM'}) · {l.entityType}{' '}
                  {l.entityId || ''}
                </p>
                {l.details && <p className="text-[#493713]/85 mt-0.5">{l.details}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
