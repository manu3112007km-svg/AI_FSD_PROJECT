import React, { useState } from 'react';
import { Lock, ShieldAlert, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_NAV_ACCESS } from '../server/domain/rules';

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  if (!user) return null;

  const permissions = ROLE_NAV_ACCESS[user.role] || [];

  const handleSavePrefs = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNote('Workspace preferences updated for this session.');
  };

  return (
    <div className="space-y-6">
      <div className="gold-card-surface rounded-lg p-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#493713]">
          Account &amp; Platform Settings
        </h1>
        <p className="text-sm text-[#29251C]/85 mt-1">
          View authenticated account identity, role access permissions, and operational safety notices.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="gold-card-surface rounded-lg p-5 space-y-4">
          <h2 className="text-lg font-bold text-[#493713] inline-flex items-center gap-2">
            <User className="h-4 w-4" /> Authenticated Identity
          </h2>
          <div className="space-y-2 text-sm bg-[#FFF2C6] border border-[#C9A227] rounded-md p-4">
            <p>
              <strong>Full Name:</strong> {user.fullName}
            </p>
            <p>
              <strong>Email:</strong> {user.email}
            </p>
            <p>
              <strong>Assigned Role:</strong> {user.role}
            </p>
            <p>
              <strong>Organization:</strong> {user.organizationName || 'Public / Independent'}
            </p>
            <p>
              <strong>Account Type:</strong>{' '}
              {user.isDemo ? 'Labeled Demonstration Account' : 'Registered User Account'}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#493713] mb-1.5 inline-flex items-center gap-1.5">
              <Lock className="h-4 w-4" /> Permitted Modules
            </h3>
            <p className="text-xs text-[#29251C] leading-relaxed">
              {permissions.join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="px-4 py-2 rounded-md border border-[#B91C1C] bg-[#FDECEC] text-xs font-bold text-[#7F1D1D] cursor-pointer"
          >
            Sign Out of Current Session
          </button>
        </div>

        <form onSubmit={handleSavePrefs} className="gold-card-surface rounded-lg p-5 space-y-4">
          <h2 className="text-lg font-bold text-[#493713]">Operational Preferences</h2>
          <label className="flex items-center justify-between gap-3 rounded border border-[#C9A227] bg-[#FFF2C6] p-3 text-sm cursor-pointer">
            <span className="font-bold text-[#29251C]">Enable real-time WebSocket auto-sync</span>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded border border-[#C9A227] bg-[#FFF2C6] p-3 text-sm cursor-pointer">
            <span className="font-bold text-[#29251C]">Highlight urgent priority advisories</span>
            <input
              type="checkbox"
              checked={soundAlerts}
              onChange={(e) => setSoundAlerts(e.target.checked)}
            />
          </label>
          {savedNote && (
            <p className="text-xs font-bold text-[#14532D]">{savedNote}</p>
          )}
          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-[#D4AF37] hover:bg-[#C9A227] border border-[#493713] text-xs font-bold text-[#29251C] cursor-pointer"
          >
            Save Preferences
          </button>

          <div className="pt-3 border-t border-[#C0C0C0] text-xs text-[#7F1D1D] flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              ResQNet is an emergency coordination prototype and does not replace official public safety answering points. Always call 911, 112, or your local emergency number for immediate life-threatening emergencies.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
