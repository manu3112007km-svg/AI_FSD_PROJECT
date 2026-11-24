import React, { useState } from 'react';
import { Bot, GitCompare, Send, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { IncidentRecord } from '../types/resqnet';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  citedRecords?: string[];
  recommendedActions?: string[];
  provider?: string;
}

const QUICK_PROMPTS = [
  'How many active incidents are there?',
  'Which incidents are awaiting verification?',
  'Which resources are currently unavailable?',
  'Which hospitals have recently updated their capacity?',
  "Generate today's operational summary.",
  'Identify areas with increased incident activity.',
];

export function AiIntelligencePage({ incidents }: { incidents: IncidentRecord[] }) {
  const { user } = useAuth();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      role: 'assistant',
      content:
        'ResQNet Decision-Support Assistant ready. Ask operational questions grounded strictly in verified database records. I never invent incident records or override human coordinator decisions.',
      provider: 'system',
    },
  ]);

  const canUseDecisionSupport =
    user && ['EMERGENCY_COORDINATOR', 'SUPER_ADMIN'].includes(user.role);

  const relatedClusters = incidents.filter(
    (inc) => inc.relationships && inc.relationships.length > 0
  );

  const askQuestion = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setQuestion('');
    setBusy(true);
    try {
      const res = await apiFetch<{
        answer: string;
        citedRecords: string[];
        recommendedActions: string[];
        provider: string;
      }>('/api/ai/decision-support', {
        method: 'POST',
        body: JSON.stringify({ question: trimmed }),
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.answer,
          citedRecords: res.citedRecords,
          recommendedActions: res.recommendedActions,
          provider: res.provider,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to query decision-support engine.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="gold-card-surface rounded-lg p-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#493713]">
          AI Operational Intelligence &amp; Clustering
        </h1>
        <p className="text-sm text-[#29251C]/85 mt-1">
          Database-grounded coordinator decision support and advisory incident relationship detection.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: AI Decision Support Chat */}
        <div className="xl:col-span-7 gold-card-surface rounded-lg p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[#C0C0C0] pb-3">
            <h2 className="text-lg font-bold text-[#493713] inline-flex items-center gap-2">
              <Bot className="h-5 w-5" /> Coordinator Decision-Support Assistant
            </h2>
            <span className="text-xs font-bold text-[#7F1D1D] inline-flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5" /> Database-Grounded Advisory
            </span>
          </div>

          {!canUseDecisionSupport ? (
            <div className="p-4 rounded border border-[#C9A227] bg-[#FFF2C6] text-sm text-[#493713]">
              Coordinator Decision-Support queries are restricted to Emergency Coordinators and Super Administrators.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp}
                    type="button"
                    disabled={busy}
                    onClick={() => void askQuestion(qp)}
                    className="px-2.5 py-1 rounded border border-[#C9A227] bg-[#FFF2C6] hover:bg-[#F7E7A1] text-xs font-bold text-[#493713] cursor-pointer"
                  >
                    {qp}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-h-[300px] max-h-[420px] overflow-y-auto space-y-3 bg-[#FFF2C6]/60 border border-[#C9A227] rounded-md p-4">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`rounded-md border p-3 text-sm ${
                      m.role === 'user'
                        ? 'bg-[#F7E7A1] border-[#493713] ml-8'
                        : 'bg-[#FFFDF5] border-[#C9A227] mr-4'
                    }`}
                  >
                    <p className="text-xs font-bold text-[#493713] mb-1">
                      {m.role === 'user'
                        ? user?.fullName
                        : `ResQNet AI Assistant (${m.provider === 'gemini' ? 'Gemini AI' : m.provider === 'system' ? 'Ready' : 'Rule-Grounded Fallback'})`}
                    </p>
                    <p className="whitespace-pre-line text-[#29251C] leading-relaxed">{m.content}</p>
                    {m.citedRecords && m.citedRecords.length > 0 && (
                      <p className="text-xs text-[#493713] mt-2">
                        <strong>Cited DB Records:</strong> {m.citedRecords.join(', ')}
                      </p>
                    )}
                    {m.recommendedActions && m.recommendedActions.length > 0 && (
                      <div className="text-xs text-[#14532D] mt-1">
                        <strong>Recommended Follow-up:</strong> {m.recommendedActions.join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {error && (
                <p className="text-xs font-bold text-[#7F1D1D]">{error}</p>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void askQuestion(question);
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask about active incidents, resource shortages, or hospital capacity..."
                  className="flex-1 rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D4AF37] hover:bg-[#C9A227] border border-[#493713] text-sm font-bold text-[#29251C] cursor-pointer disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  <span>{busy ? 'Analyzing...' : 'Ask'}</span>
                </button>
              </form>
            </>
          )}
        </div>

        {/* Right: Intelligent Incident Clustering Advisory */}
        <div className="xl:col-span-5 gold-card-surface rounded-lg p-5 space-y-4">
          <div className="border-b border-[#C0C0C0] pb-3">
            <h2 className="text-lg font-bold text-[#493713] inline-flex items-center gap-2">
              <GitCompare className="h-5 w-5" /> Intelligent Incident Clustering (Advisory)
            </h2>
            <p className="text-xs text-[#493713]/85 mt-1">
              Potentially related reports detected by proximity, category, time window, and description similarity. Separate reports are never automatically merged.
            </p>
          </div>

          <div className="space-y-3 max-h-[480px] overflow-y-auto">
            {relatedClusters.length === 0 ? (
              <p className="text-sm text-[#493713] py-6 text-center">
                No overlapping incident clusters detected in active reports.
              </p>
            ) : (
              relatedClusters.map((inc) => (
                <div
                  key={inc.id}
                  className="rounded-md border border-[#C9A227] bg-[#FFF2C6] p-3.5 space-y-2"
                >
                  <p className="text-sm font-bold text-[#29251C]">
                    {inc.incidentCode} · {inc.title}
                  </p>
                  <p className="text-xs text-[#493713]">
                    {inc.category} · {inc.locationText}
                  </p>
                  <div className="space-y-1.5 pt-1 border-t border-[#C0C0C0]">
                    {(inc.relationships || []).map((rel) => (
                      <div key={rel.id} className="text-xs text-[#29251C]">
                        <span className="font-bold text-[#78350F] tabular-nums">
                          {Math.round(rel.similarityScore)}% similarity
                        </span>{' '}
                        with <strong>{rel.relatedIncidentCode}</strong> ({rel.relatedLocation}) —{' '}
                        {rel.relationshipReason}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
