import React, { useMemo, useState } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { apiFetch } from '../services/api';
import type { NotificationRecord } from '../types/resqnet';

export function NotificationsPage({
  notifications,
  onRefresh,
  onOpenIncidentId,
}: {
  notifications: NotificationRecord[];
  onRefresh: () => Promise<void>;
  onOpenIncidentId: (incidentId: number) => void;
}) {
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [busy, setBusy] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(notifications.map((n) => n.category))),
    [notifications]
  );

  const visible = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === 'UNREAD' && n.isRead) return false;
      if (categoryFilter !== 'ALL' && n.category !== categoryFilter) return false;
      return true;
    });
  }, [notifications, filter, categoryFilter]);

  const markRead = async (id: number) => {
    setBusy(true);
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const markAllRead = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="gold-card-surface rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#493713]">
            Intelligent Notification Center
          </h1>
          <p className="text-sm text-[#29251C]/85 mt-1">
            Role-scoped operational alerts without exposing unnecessary sensitive personal information.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void markAllRead()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D4AF37] hover:bg-[#C9A227] border border-[#493713] text-xs font-bold text-[#29251C] cursor-pointer"
        >
          <CheckCheck className="h-4 w-4" /> Mark All Read
        </button>
      </div>

      <div className="gold-card-surface rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C0C0C0] pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${
                filter === 'ALL'
                  ? 'bg-[#D4AF37] text-[#29251C] border border-[#493713]'
                  : 'bg-[#FFF2C6] text-[#493713] border border-[#C9A227]'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('UNREAD')}
              className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${
                filter === 'UNREAD'
                  ? 'bg-[#D4AF37] text-[#29251C] border border-[#493713]'
                  : 'bg-[#FFF2C6] text-[#493713] border border-[#C9A227]'
              }`}
            >
              Unread ({notifications.filter((n) => !n.isRead).length})
            </button>
          </div>

          <select
            aria-label="Filter notifications by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded border border-[#C9A227] bg-[#FFF2C6] text-xs font-bold text-[#493713]"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#493713]">
            No notifications in this view.
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((n) => (
              <div
                key={n.id}
                className={`rounded-md border p-4 flex flex-wrap items-start justify-between gap-3 ${
                  n.isRead
                    ? 'bg-[#FFFDF5] border-[#C0C0C0]'
                    : 'bg-[#F7E7A1]/60 border-[#C9A227]'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#493713]">
                    <Bell className="h-3.5 w-3.5" />
                    <span className="font-bold">{n.category}</span>
                    <span>·</span>
                    <span className="tabular-nums">{new Date(n.createdAt).toLocaleString()}</span>
                    {!n.isRead && (
                      <span className="font-bold text-[#7F1D1D]">· Unread</span>
                    )}
                  </div>
                  <p className="text-base font-bold text-[#29251C]">{n.title}</p>
                  <p className="text-sm text-[#29251C]/90">{n.message}</p>
                </div>

                <div className="flex items-center gap-2">
                  {n.relatedIncidentId && (
                    <button
                      type="button"
                      onClick={() => onOpenIncidentId(n.relatedIncidentId!)}
                      className="px-3 py-1.5 rounded border border-[#C9A227] bg-[#FFF2C6] hover:bg-[#F7E7A1] text-xs font-bold text-[#493713] cursor-pointer"
                    >
                      View Incident
                    </button>
                  )}
                  {!n.isRead && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void markRead(n.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#493713] bg-[#D4AF37] text-xs font-bold text-[#29251C] cursor-pointer"
                    >
                      <Check className="h-3.5 w-3.5" /> Mark Read
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
