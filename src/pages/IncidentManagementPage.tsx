import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Search,
  ShieldAlert,
  Sparkles,
  Truck,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import {
  INCIDENT_STATUSES,
  canAssignResources,
  canUpdateResponderProgress,
  canVerifyIncident,
} from '../server/domain/rules';
import type {
  IncidentPriority,
  IncidentRecord,
  IncidentStatus,
  ResourceRecommendation,
  ResponseTeamRecord,
} from '../types/resqnet';
import { PriorityIndicator, StatusIndicator } from '../components/StatusBadge';

export function IncidentManagementPage({
  incidents,
  teams,
  selectedIncidentId,
  onSelectIncidentId,
  onRefresh,
}: {
  incidents: IncidentRecord[];
  teams: ResponseTeamRecord[];
  selectedIncidentId: number | null;
  onSelectIncidentId: (id: number | null) => void;
  onRefresh: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [recommendations, setRecommendations] = useState<ResourceRecommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [updateNote, setUpdateNote] = useState('');
  const [overridePriority, setOverridePriority] = useState<IncidentPriority>('High');
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return incidents.filter((inc) => {
      if (priorityFilter !== 'ALL' && inc.priority !== priorityFilter) return false;
      if (statusFilter !== 'ALL' && inc.status !== statusFilter) return false;
      if (!q) return true;
      return (
        inc.incidentCode.toLowerCase().includes(q) ||
        inc.title.toLowerCase().includes(q) ||
        inc.category.toLowerCase().includes(q) ||
        inc.locationText.toLowerCase().includes(q)
      );
    });
  }, [incidents, search, priorityFilter, statusFilter]);

  const activeIncident =
    incidents.find((i) => i.id === selectedIncidentId) || filtered[0] || incidents[0] || null;

  useEffect(() => {
    if (!activeIncident) return;
    setOverridePriority(activeIncident.priority);
    setSelectedTeamId(activeIncident.assignedTeamId ? String(activeIncident.assignedTeamId) : '');
    if (user && (canAssignResources(user.role) || user.role === 'EMERGENCY_RESPONDER')) {
      setLoadingRecs(true);
      apiFetch<{ recommendations: ResourceRecommendation[] }>(
        `/api/resources/recommendations/${activeIncident.id}`
      )
        .then((res) => setRecommendations(res.recommendations))
        .catch(() => setRecommendations([]))
        .finally(() => setLoadingRecs(false));
    }
  }, [activeIncident?.id, user]);

  const handleTransitionStatus = async (nextStatus: IncidentStatus, customNote?: string) => {
    if (!activeIncident) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      await apiFetch(`/api/incidents/${activeIncident.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          priority: canVerifyIncident(user!.role) ? overridePriority : undefined,
          assignedTeamId:
            canAssignResources(user!.role) && selectedTeamId ? Number(selectedTeamId) : undefined,
          note: customNote || updateNote || undefined,
        }),
      });
      setUpdateNote('');
      setFeedback({ type: 'ok', text: `Incident ${activeIncident.incidentCode} updated to ${nextStatus}.` });
      await onRefresh();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Update failed.' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleApproveAllocation = async (rec: ResourceRecommendation) => {
    if (!activeIncident) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      await apiFetch('/api/resources/allocate', {
        method: 'POST',
        body: JSON.stringify({
          resourceId: rec.resourceId,
          incidentId: activeIncident.id,
          teamId: selectedTeamId ? Number(selectedTeamId) : undefined,
          rationale: `Coordinator approved (${rec.suitabilityScore}% suitability): ${rec.reasons.join('; ')}`,
        }),
      });
      setFeedback({
        type: 'ok',
        text: `Approved dispatch of ${rec.name} (${rec.resourceCode}) to ${activeIncident.incidentCode}.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Allocation failed.' });
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="gold-card-surface rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#493713]">Incident Management</h1>
          <p className="text-sm text-[#29251C]/85 mt-1">
            Verify incoming reports, review AI priority recommendations, approve resource dispatch, and manage field status updates.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-[#493713] absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter incidents..."
              aria-label="Search incidents"
              className="pl-8 pr-3 py-1.5 rounded-md border border-[#C9A227] bg-[#FFF2C6] text-xs"
            />
          </div>
          <select
            aria-label="Filter by priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-md border border-[#C9A227] bg-[#FFF2C6] text-xs font-bold text-[#493713]"
          >
            <option value="ALL">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-md border border-[#C9A227] bg-[#FFF2C6] text-xs font-bold text-[#493713]"
          >
            <option value="ALL">All Statuses</option>
            {INCIDENT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-md border px-4 py-3 text-sm font-bold ${
            feedback.type === 'ok'
              ? 'border-[#15803D] bg-[#ECFDF5] text-[#14532D]'
              : 'border-[#B91C1C] bg-[#FDECEC] text-[#7F1D1D]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Queue */}
        <div className="xl:col-span-5 gold-card-surface rounded-lg p-4 space-y-2.5 max-h-[760px] overflow-y-auto">
          <h2 className="text-lg font-bold text-[#493713] px-1">
            Incident Queue ({filtered.length})
          </h2>
          {filtered.length === 0 ? (
            <p className="text-sm text-[#493713] p-4 text-center">No incidents match your filter.</p>
          ) : (
            filtered.map((inc) => {
              const selected = activeIncident?.id === inc.id;
              return (
                <button
                  key={inc.id}
                  type="button"
                  onClick={() => onSelectIncidentId(inc.id)}
                  className={`w-full text-left rounded-md border p-3.5 transition-colors cursor-pointer ${
                    selected
                      ? 'bg-[#F7E7A1] border-[#493713]'
                      : 'bg-[#FFF2C6]/65 border-[#C9A227] hover:bg-[#F7E7A1]/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm tabular-nums text-[#493713]">
                      {inc.incidentCode}
                    </span>
                    <PriorityIndicator priority={inc.priority} />
                  </div>
                  <p className="font-bold text-sm text-[#29251C] mt-1">{inc.title}</p>
                  <p className="text-xs text-[#493713] mt-0.5">
                    {inc.category} · {inc.locationText}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <StatusIndicator status={inc.status} />
                    <span className="text-xs text-[#493713] tabular-nums">
                      {inc.isDemo ? 'Demo' : 'Live'} · {new Date(inc.reportedAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Detail & Coordinator/Responder Controls */}
        <div className="xl:col-span-7 space-y-6">
          {!activeIncident ? (
            <div className="gold-card-surface rounded-lg p-8 text-center text-sm text-[#493713]">
              Select an incident from the queue to inspect operational details.
            </div>
          ) : (
            <>
              <div className="gold-card-surface rounded-lg p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#C0C0C0] pb-4">
                  <div>
                    <p className="text-xs font-bold text-[#493713] tabular-nums">
                      {activeIncident.incidentCode} · {activeIncident.category} ·{' '}
                      {activeIncident.isDemo ? 'Demonstration Record' : 'Live Submission'}
                    </p>
                    <h2 className="text-2xl font-bold text-[#29251C] mt-0.5">
                      {activeIncident.title}
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityIndicator priority={activeIncident.priority} />
                    <StatusIndicator status={activeIncident.status} />
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-[#29251C]">{activeIncident.description}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#FFF2C6] border border-[#C9A227] rounded-md p-3.5">
                  <div>
                    <span className="font-bold text-[#493713]">Location: </span>
                    <span>{activeIncident.locationText}</span>
                  </div>
                  <div>
                    <span className="font-bold text-[#493713]">Location Source: </span>
                    <span>{activeIncident.locationSource}</span>
                  </div>
                  <div>
                    <span className="font-bold text-[#493713]">People Affected: </span>
                    <span className="tabular-nums">{activeIncident.peopleAffected}</span>
                  </div>
                  <div>
                    <span className="font-bold text-[#493713]">Contact: </span>
                    <span>{activeIncident.contactInfo}</span>
                  </div>
                  <div>
                    <span className="font-bold text-[#493713]">Assigned Team: </span>
                    <span>{activeIncident.assignedTeamName || 'Unassigned'}</span>
                  </div>
                  <div>
                    <span className="font-bold text-[#493713]">Verified By: </span>
                    <span>{activeIncident.verifiedByName || 'Pending Coordinator Review'}</span>
                  </div>
                </div>

                {activeIncident.attachments && activeIncident.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {activeIncident.attachments.map((att) => (
                      <img
                        key={att.id}
                        src={att.dataUrl}
                        alt={att.fileName}
                        className="h-24 w-32 object-cover rounded border border-[#C9A227]"
                      />
                    ))}
                  </div>
                )}

                {/* AI Analysis Breakdown */}
                {activeIncident.aiAnalysis && (
                  <div className="rounded-md border border-[#C9A227] bg-[#F7E7A1]/50 p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-bold text-sm text-[#493713]">
                        <Bot className="h-4 w-4" /> AI Operational Advisory (
                        {activeIncident.aiAnalysis.provider === 'gemini'
                          ? 'Gemini AI'
                          : 'Fallback Rules'}
                        )
                      </span>
                      <span className="text-xs font-bold tabular-nums text-[#493713]">
                        Recommended: {activeIncident.aiAnalysis.priority_recommendation} ·{' '}
                        {activeIncident.aiAnalysis.confidence}% confidence
                      </span>
                    </div>
                    <p className="text-xs text-[#29251C]">
                      <strong>AI Summary:</strong> {activeIncident.aiAnalysis.summary}
                    </p>
                    <p className="text-xs text-[#29251C]">
                      <strong>Reasoning:</strong> {activeIncident.aiAnalysis.reasoning_summary}
                    </p>
                    <p className="text-xs text-[#493713]">
                      <strong>Suggested Resources:</strong>{' '}
                      {activeIncident.aiAnalysis.required_resources.join(', ')}
                    </p>
                    {activeIncident.aiAnalysis.additional_information_needed.length > 0 && (
                      <p className="text-xs text-[#78350F]">
                        <strong>Missing Info Flagged:</strong>{' '}
                        {activeIncident.aiAnalysis.additional_information_needed.join(' · ')}
                      </p>
                    )}
                    <p className="text-xs font-bold text-[#7F1D1D] flex items-center gap-1 pt-1">
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                      Human Safety Gate: AI cannot independently authorize dispatch or diagnose medical conditions.
                    </p>
                  </div>
                )}

                {/* Coordinator & Responder Action Controls */}
                {user && (canVerifyIncident(user.role) || canUpdateResponderProgress(user.role)) && (
                  <div className="border-t border-[#C0C0C0] pt-4 space-y-3">
                    <h3 className="text-base font-bold text-[#493713]">
                      Operational Controls
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {canVerifyIncident(user.role) && (
                        <>
                          <div>
                            <label
                              htmlFor="inc-priority-override"
                              className="block text-xs font-bold text-[#493713] mb-1"
                            >
                              Confirmed Priority
                            </label>
                            <select
                              id="inc-priority-override"
                              value={overridePriority}
                              onChange={(e) =>
                                setOverridePriority(e.target.value as IncidentPriority)
                              }
                              className="w-full rounded-md border border-[#C9A227] bg-[#FFF2C6] px-2.5 py-1.5 text-xs font-bold"
                            >
                              <option value="Critical">Critical</option>
                              <option value="High">High</option>
                              <option value="Medium">Medium</option>
                              <option value="Low">Low</option>
                            </select>
                          </div>
                          <div>
                            <label
                              htmlFor="inc-team-assign"
                              className="block text-xs font-bold text-[#493713] mb-1"
                            >
                              Assign Response Team
                            </label>
                            <select
                              id="inc-team-assign"
                              value={selectedTeamId}
                              onChange={(e) => setSelectedTeamId(e.target.value)}
                              className="w-full rounded-md border border-[#C9A227] bg-[#FFF2C6] px-2.5 py-1.5 text-xs font-bold"
                            >
                              <option value="">-- Select Response Team --</option>
                              {teams.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.status})
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="inc-progress-note"
                          className="block text-xs font-bold text-[#493713] mb-1"
                        >
                          Operational Log Note
                        </label>
                        <input
                          id="inc-progress-note"
                          type="text"
                          value={updateNote}
                          onChange={(e) => setUpdateNote(e.target.value)}
                          placeholder="Add verification note, arrival status, or resolution summary..."
                          className="w-full rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-1.5 text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {canVerifyIncident(user.role) && (
                        <>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleTransitionStatus('Under Verification')}
                            className="px-3 py-1.5 rounded border border-[#C9A227] bg-[#FFF2C6] hover:bg-[#F7E7A1] text-xs font-bold text-[#493713] cursor-pointer"
                          >
                            Mark Under Verification
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleTransitionStatus('Verified')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#493713] bg-[#D4AF37] hover:bg-[#C9A227] text-xs font-bold text-[#29251C] cursor-pointer"
                          >
                            <ClipboardCheck className="h-3.5 w-3.5" /> Verify Incident
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleTransitionStatus('Assigned')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#C9A227] bg-[#F7E7A1] hover:bg-[#D4AF37] text-xs font-bold text-[#29251C] cursor-pointer"
                          >
                            <Truck className="h-3.5 w-3.5" /> Confirm Team Assignment
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleTransitionStatus('Resolved')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#15803D] bg-[#ECFDF5] hover:bg-[#DCFCE7] text-xs font-bold text-[#14532D] cursor-pointer"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Mark Resolved
                          </button>
                        </>
                      )}

                      {canUpdateResponderProgress(user.role) && (
                        <>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              void handleTransitionStatus(
                                'Response in Progress',
                                updateNote || 'Responder unit arrived on scene; response in progress.'
                              )
                            }
                            className="px-3 py-1.5 rounded border border-[#B45309] bg-[#FEF3C7] hover:bg-[#FDE68A] text-xs font-bold text-[#78350F] cursor-pointer"
                          >
                            Acknowledge / On Scene
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              void handleTransitionStatus(
                                'Assistance Provided',
                                updateNote || 'Primary emergency assistance provided; awaiting coordinator closure.'
                              )
                            }
                            className="px-3 py-1.5 rounded border border-[#15803D] bg-[#ECFDF5] hover:bg-[#DCFCE7] text-xs font-bold text-[#14532D] cursor-pointer"
                          >
                            Report Assistance Provided
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Smart Resource Recommendation Engine */}
              {user && canAssignResources(user.role) && (
                <div className="gold-card-surface rounded-lg p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold text-[#493713] inline-flex items-center gap-2">
                      <Sparkles className="h-4 w-4" /> Smart Resource Recommendations
                    </h3>
                    <span className="text-xs text-[#493713]">
                      Coordinator approval required before dispatch
                    </span>
                  </div>
                  {loadingRecs ? (
                    <p className="text-xs text-[#493713]">Evaluating proximity &amp; suitability...</p>
                  ) : recommendations.length === 0 ? (
                    <p className="text-xs text-[#493713]">
                      No unassigned Available resources match right now.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {recommendations.slice(0, 4).map((rec) => (
                        <div
                          key={rec.resourceId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#C9A227] bg-[#FFF2C6] p-3"
                        >
                          <div>
                            <p className="text-sm font-bold text-[#29251C]">
                              {rec.name} ({rec.resourceCode})
                            </p>
                            <p className="text-xs text-[#493713]">
                              {rec.category} · {rec.locationName} · {rec.distanceKm} km away ·{' '}
                              <strong>{rec.suitabilityScore}% match</strong>
                            </p>
                            <p className="text-xs text-[#29251C]/80 mt-0.5">
                              {rec.reasons.join(' · ')}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleApproveAllocation(rec)}
                            className="px-3.5 py-1.5 rounded bg-[#D4AF37] hover:bg-[#C9A227] border border-[#493713] text-xs font-bold text-[#29251C] cursor-pointer whitespace-nowrap"
                          >
                            Approve &amp; Allocate
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Visual Timeline */}
              <div className="gold-card-surface rounded-lg p-5 space-y-3">
                <h3 className="text-lg font-bold text-[#493713]">Incident Timeline</h3>
                <div className="space-y-3">
                  {(activeIncident.updates || []).map((upd) => (
                    <div
                      key={upd.id}
                      className="rounded-md border border-[#C0C0C0] bg-[#FFF2C6]/60 p-3 text-xs flex flex-col gap-1"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-[#493713]">
                          {upd.previousStatus ? `${upd.previousStatus} → ${upd.newStatus}` : upd.newStatus}
                        </span>
                        <span className="tabular-nums text-[#493713]/80">
                          {new Date(upd.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[#29251C]">{upd.note}</p>
                      <p className="text-[#493713]/80">Actor: {upd.actorName || 'System'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
