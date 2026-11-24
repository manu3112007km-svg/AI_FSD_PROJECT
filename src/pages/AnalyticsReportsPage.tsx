import React, { useEffect, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet, FileText, Sparkles } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch } from '../services/api';
import type {
  AnalyticsOverview,
  HospitalRecord,
  IncidentRecord,
  ResourceRecord,
} from '../types/resqnet';
import { downloadOperationalCsv, downloadOperationalPdf } from '../utils/exportReports';

export function AnalyticsReportsPage({
  analytics,
  incidents,
  resources,
  hospitals,
}: {
  analytics: AnalyticsOverview | null;
  incidents: IncidentRecord[];
  resources: ResourceRecord[];
  hospitals: HospitalRecord[];
}) {
  const [trendRange, setTrendRange] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [predictive, setPredictive] = useState<{
    label: string;
    categoryDemandEstimates: Array<{
      category: string;
      historicalCount: number;
      estimatedNext24hDemand: number;
      recommendedStandbyUnits: number;
    }>;
    peakWindows: Array<{ window: string; estimatedIndex: number }>;
  } | null>(null);
  const [observations, setObservations] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<typeof predictive>('/api/analytics/predictive')
      .then(setPredictive)
      .catch(() => setPredictive(null));
  }, [incidents.length]);

  const trendData =
    trendRange === 'daily'
      ? analytics?.dailyTrends || []
      : trendRange === 'weekly'
        ? analytics?.weeklyTrends || []
        : analytics?.monthlyTrends || [];

  const handleGenerateAndExport = async (format: 'csv' | 'pdf') => {
    if (!analytics) return;
    setExporting(true);
    setExportNote(null);
    try {
      const res = await apiFetch<{ observations: string[] }>('/api/ai/generate-summary', {
        method: 'POST',
      });
      setObservations(res.observations);
      if (format === 'csv') {
        downloadOperationalCsv({
          overview: analytics,
          incidents,
          resources,
          hospitals,
          observations: res.observations,
        });
        setExportNote('Operational CSV report generated and downloaded.');
      } else {
        downloadOperationalPdf({
          overview: analytics,
          incidents,
          resources,
          hospitals,
          observations: res.observations,
        });
        setExportNote('Operational PDF report generated and downloaded.');
      }
    } catch (err) {
      setExportNote(err instanceof Error ? err.message : 'Unable to generate report.');
    } finally {
      setExporting(false);
    }
  };

  const resolutionRate =
    analytics && analytics.kpis.totalIncidents > 0
      ? Math.round((analytics.kpis.resolvedIncidents / analytics.kpis.totalIncidents) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="gold-card-surface rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#493713]">
            Analytics &amp; Operational Reports
          </h1>
          <p className="text-sm text-[#29251C]/85 mt-1">
            Incident trends, resource utilization, predictive demand estimates, and downloadable CSV / PDF operational reports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={exporting || !analytics}
            onClick={() => void handleGenerateAndExport('csv')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[#C9A227] bg-[#FFF2C6] hover:bg-[#F7E7A1] text-xs font-bold text-[#493713] cursor-pointer disabled:opacity-60"
          >
            <FileSpreadsheet className="h-4 w-4" /> Export CSV Report
          </button>
          <button
            type="button"
            disabled={exporting || !analytics}
            onClick={() => void handleGenerateAndExport('pdf')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-[#493713] bg-[#D4AF37] hover:bg-[#C9A227] text-xs font-bold text-[#29251C] cursor-pointer disabled:opacity-60"
          >
            <FileText className="h-4 w-4" /> Export PDF Report
          </button>
        </div>
      </div>

      {exportNote && (
        <div className="rounded-md border border-[#15803D] bg-[#ECFDF5] px-4 py-2.5 text-sm font-bold text-[#14532D] flex items-center gap-2">
          <Download className="h-4 w-4" />
          <span>{exportNote}</span>
        </div>
      )}

      {/* Resolution & Hospital Capacity Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="gold-card-surface rounded-lg p-4">
          <p className="text-xs font-bold text-[#493713]">Incident Resolution Rate</p>
          <p className="text-3xl font-bold tabular-nums text-[#29251C] mt-1">{resolutionRate}%</p>
        </div>
        <div className="gold-card-surface rounded-lg p-4">
          <p className="text-xs font-bold text-[#493713]">General Beds Open</p>
          <p className="text-3xl font-bold tabular-nums text-[#29251C] mt-1">
            {analytics?.hospitalCapacitySummary.totalGeneralAvailable ?? 0}/
            {analytics?.hospitalCapacitySummary.totalGeneralBeds ?? 0}
          </p>
        </div>
        <div className="gold-card-surface rounded-lg p-4">
          <p className="text-xs font-bold text-[#493713]">ICU Beds Open</p>
          <p className="text-3xl font-bold tabular-nums text-[#29251C] mt-1">
            {analytics?.hospitalCapacitySummary.totalIcuAvailable ?? 0}/
            {analytics?.hospitalCapacitySummary.totalIcuBeds ?? 0}
          </p>
        </div>
        <div className="gold-card-surface rounded-lg p-4">
          <p className="text-xs font-bold text-[#493713]">Stale Hospital Feeds (&gt;6h)</p>
          <p className="text-3xl font-bold tabular-nums text-[#7F1D1D] mt-1">
            {analytics?.hospitalCapacitySummary.staleCapacityCount ?? 0}
          </p>
        </div>
      </div>

      {/* Interactive Trend & Resource Utilization Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="gold-card-surface rounded-lg p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-bold text-[#493713] inline-flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Incident Trends
            </h2>
            <div className="flex gap-1 bg-[#FFF2C6] p-1 rounded border border-[#C9A227]">
              {(['daily', 'weekly', 'monthly'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setTrendRange(r)}
                  className={`px-2.5 py-1 rounded text-xs font-bold capitalize cursor-pointer ${
                    trendRange === r
                      ? 'bg-[#D4AF37] text-[#29251C]'
                      : 'text-[#493713] hover:bg-[#F7E7A1]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5D399" />
                <XAxis dataKey="label" tick={{ fill: '#29251C', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#29251C', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFDF5',
                    borderColor: '#C9A227',
                    fontFamily: 'Times New Roman',
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="reported" name="Reported" stroke="#8A6D1B" strokeWidth={2.5} />
                <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#15803D" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="gold-card-surface rounded-lg p-5">
          <h2 className="text-lg font-bold text-[#493713] mb-4">
            Resource Utilization by Category
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.resourceUtilization || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5D399" />
                <XAxis dataKey="category" tick={{ fill: '#29251C', fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#29251C', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFDF5',
                    borderColor: '#C9A227',
                    fontFamily: 'Times New Roman',
                  }}
                />
                <Legend />
                <Bar dataKey="available" stackId="a" name="Available" fill="#15803D" />
                <Bar dataKey="assigned" stackId="a" name="Assigned / In Service" fill="#C9A227" />
                <Bar dataKey="other" stackId="a" name="Maintenance / Unavailable" fill="#991B1B" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Predictive Resource Demand Estimates */}
      {predictive && (
        <div className="gold-card-surface rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-[#493713] inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Predictive Resource Demand Estimates
            </h2>
            <span className="text-xs font-bold text-[#78350F] bg-[#FEF3C7] border border-[#B45309] px-2.5 py-1 rounded">
              STATISTICAL ESTIMATES — NOT CONFIRMED FUTURE EVENTS
            </span>
          </div>
          <p className="text-xs text-[#493713]">{predictive.label}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#C9A227] bg-[#FFF2C6] text-xs font-bold text-[#493713]">
                  <th className="py-2 px-3">Emergency Category</th>
                  <th className="py-2 px-3">Historical &amp; Demo Count</th>
                  <th className="py-2 px-3">Estimated 24h Demand</th>
                  <th className="py-2 px-3">Suggested Standby Units (Estimate)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5D399]">
                {predictive.categoryDemandEstimates.map((row) => (
                  <tr key={row.category}>
                    <td className="py-2 px-3 font-bold">{row.category}</td>
                    <td className="py-2 px-3 tabular-nums">{row.historicalCount}</td>
                    <td className="py-2 px-3 tabular-nums">{row.estimatedNext24hDemand} incidents</td>
                    <td className="py-2 px-3 tabular-nums">{row.recommendedStandbyUnits} units</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {observations.length > 0 && (
        <div className="gold-card-surface rounded-lg p-5 space-y-2">
          <h2 className="text-lg font-bold text-[#493713]">
            AI-Generated Operational Observations (Included in Report)
          </h2>
          <ul className="list-disc pl-5 text-sm space-y-1 text-[#29251C]">
            {observations.map((obs, idx) => (
              <li key={idx}>{obs}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
