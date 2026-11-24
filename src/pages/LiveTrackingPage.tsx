import React, { useState } from 'react';
import { Activity, CheckCircle2, Clock, Radio } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { INCIDENT_STATUSES, canUpdateResponderProgress } from '../server/domain/rules';
import type { IncidentRecord, IncidentStatus } from '../types/resqnet';
import { PriorityIndicator, StatusIndicator } from '../components/StatusBadge';

export function LiveTrackingPage({
  incidents,
  onRefresh,
}: {
  incidents: IncidentRecord[];
  onRefresh: () => Promise<void>;
}) {
  const { user } = useAuth();
  const { connectionState } = useRealtime();
  const [selectedId, setSelectedId] = useState<number | null>(incidents[0]?.id ?? null);
  const [busy, setBusy] = useState(false);

  const activeIncidents = incidents.filter((i) => i.status !== 'Closed');
  const selected =
    incidents.find((i) => i.id === selectedId) || activeIncidents[0] || incidents[0] || null;

  const canProgress = user ? canUpdateResponderProgress(user.role) : false;

  const handleQuickProgress = async (nextStatus: IncidentStatus) => {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/api/incidents/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          note: `Live tracking transition to ${nextStatus} logged by ${user?.fullName}.`,
        }),
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const currentStageIndex = selected ? INCIDENT_STATUSES.indexOf(selected.status) : 0;

  return (
    <div className="space-y-6">
      <div className="gold-card-surface rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#493713]">
            Live Incident Tracking
          </h1>
          <p className="text-sm text-[#29251C]/85 mt-1">
            Real-time WebSocket synchronization across all 9 emergency lifecycle stages, clearly separating simulated tracking from live GPS coordinates.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-1.5 text-xs font-bold text-[#493713]">
          <Radio className="h-4 w-4" />
          <span>WebSocket Stream: {connectionState === 'connected' ? 'Connected' : 'Reconnecting'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 gold-card-surface rounded-lg p-4 space-y-2.5 max-h-[680px] overflow-y-auto">
          <h2 className="text-lg font-bold text-[#493713] px-1">
            Tracked Incidents ({incidents.length})
          </h2>
          {incidents.map((inc) => (
            <button
              key={inc.id}
              type="button"
              onClick={() => setSelectedId(inc.id)}
              className={`w-full text-left rounded-md border p-3 transition-colors cursor-pointer ${
                selected?.id === inc.id
                  ? 'bg-[#F7E7A1] border-[#493713]'
                  : 'bg-[#FFF2C6]/65 border-[#C9A227] hover:bg-[#F7E7A1]/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs tabular-nums text-[#493713]">
                  {inc.incidentCode}
                </span>
                <PriorityIndicator priority={inc.priority} />
              </div>
              <p className="font-bold text-sm text-[#29251C] mt-1">{inc.category}</p>
              <p className="text-xs text-[#493713] truncate">{inc.locationText}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <StatusIndicator status={inc.status} />
                <span className="text-[11px] font-bold text-[#493713]">
                  {inc.locationSource === 'GPS' ? 'LIVE GPS' : inc.locationSource === 'SIMULATED_DEMO' ? 'SIMULATED' : 'MANUAL'}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-8 space-y-6">
          {selected ? (
            <div className="gold-card-surface rounded-lg p-5 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#C0C0C0] pb-4">
                <div>
                  <p className="text-xs font-bold text-[#493713] tabular-nums">
                    {selected.incidentCode} · Last Update: {new Date(selected.updatedAt).toLocaleString()}
                  </p>
                  <h2 className="text-2xl font-bold text-[#29251C] mt-0.5">{selected.title}</h2>
                  <p className="text-xs text-[#493713] mt-1">
                    Tracking Mode:{' '}
                    <strong>
                      {selected.locationSource === 'GPS'
                        ? 'Actual User-Consented GPS Coordinates'
                        : selected.locationSource === 'SIMULATED_DEMO'
                          ? 'Simulated Demonstration Tracking Data'
                          : 'Manual Address Entry'}
                    </strong>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <PriorityIndicator priority={selected.priority} />
                  <StatusIndicator status={selected.status} />
                </div>
              </div>

              {/* 9-Stage Visual Lifecycle Stepper */}
              <div>
                <h3 className="text-base font-bold text-[#493713] mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4" /> 9-Stage Operational Progress
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {INCIDENT_STATUSES.map((stage, idx) => {
                    const reached = idx <= currentStageIndex;
                    const current = idx === currentStageIndex;
                    return (
                      <div
                        key={stage}
                        className={`rounded-md border p-2.5 text-xs flex items-center gap-2 ${
                          current
                            ? 'bg-[#D4AF37] border-[#493713] font-bold text-[#29251C]'
                            : reached
                              ? 'bg-[#ECFDF5] border-[#15803D] text-[#14532D]'
                              : 'bg-[#FFF2C6]/50 border-[#C0C0C0] text-[#493713]/75'
                        }`}
                      >
                        {reached ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 shrink-0" />
                        )}
                        <span className="truncate">
                          {idx + 1}. {stage}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {canProgress && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#C0C0C0]">
                  <span className="text-xs font-bold text-[#493713] mr-2">
                    Quick Field Update:
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleQuickProgress('Response in Progress')}
                    className="px-3 py-1.5 rounded border border-[#B45309] bg-[#FEF3C7] text-xs font-bold text-[#78350F] cursor-pointer"
                  >
                    Response in Progress
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleQuickProgress('Assistance Provided')}
                    className="px-3 py-1.5 rounded border border-[#15803D] bg-[#ECFDF5] text-xs font-bold text-[#14532D] cursor-pointer"
                  >
                    Assistance Provided
                  </button>
                  {(user?.role === 'EMERGENCY_COORDINATOR' || user?.role === 'SUPER_ADMIN') && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleQuickProgress('Resolved')}
                      className="px-3 py-1.5 rounded border border-[#493713] bg-[#D4AF37] text-xs font-bold text-[#29251C] cursor-pointer"
                    >
                      Verify &amp; Resolve
                    </button>
                  )}
                </div>
              )}

              {/* Chronological Log */}
              <div className="space-y-2.5">
                <h3 className="text-base font-bold text-[#493713]">Chronological Event Log</h3>
                {(selected.updates || []).map((u) => (
                  <div
                    key={u.id}
                    className="rounded border border-[#C9A227] bg-[#FFF2C6] p-3 text-xs flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-bold text-[#493713]">{u.newStatus}</span>
                      <span className="mx-1.5">·</span>
                      <span>{u.note}</span>
                    </div>
                    <span className="tabular-nums text-[#493713]/80">
                      {new Date(u.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="gold-card-surface rounded-lg p-8 text-center text-sm text-[#493713]">
              No incidents available to track.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
