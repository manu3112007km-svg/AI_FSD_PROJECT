import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  Package,
  Radio,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useRealtime } from '../contexts/RealtimeContext';
import type {
  AnalyticsOverview,
  IncidentRecord,
  NotificationRecord,
} from '../types/resqnet';
import { PriorityIndicator, StatusIndicator } from '../components/StatusBadge';
import type { NavTabKey } from '../components/LayoutShell';

const GOLD_CHART_COLORS = ['#C9A227', '#8A6D1B', '#493713', '#B45309', '#15803D', '#7F1D1D', '#A16207'];

export function OverviewPage({
  analytics,
  incidents,
  notifications,
  onNavigate,
  onSelectIncident,
}: {
  analytics: AnalyticsOverview | null;
  incidents: IncidentRecord[];
  notifications: NotificationRecord[];
  onNavigate: (tab: NavTabKey) => void;
  onSelectIncident: (inc: IncidentRecord) => void;
}) {
  const { user } = useAuth();
  const { recentEvents } = useRealtime();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'reportedAt' | 'priority'>('reportedAt');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const filteredIncidents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const priorityRank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    const list = incidents.filter((inc) => {
      if (statusFilter !== 'ALL' && inc.status !== statusFilter) return false;
      if (!q) return true;
      return (
        inc.incidentCode.toLowerCase().includes(q) ||
        inc.category.toLowerCase().includes(q) ||
        inc.locationText.toLowerCase().includes(q) ||
        inc.title.toLowerCase().includes(q)
      );
    });
    return [...list].sort((a, b) => {
      const cmp =
        sortBy === 'priority'
          ? (priorityRank[a.priority] || 0) - (priorityRank[b.priority] || 0)
          : Date.parse(a.reportedAt) - Date.parse(b.reportedAt);
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [incidents, search, statusFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredIncidents.length / pageSize));
  const pagedIncidents = filteredIncidents.slice((page - 1) * pageSize, page * pageSize);

  const kpis = analytics?.kpis;
  const kpiCards = [
    { label: 'Total Incidents', value: kpis?.totalIncidents ?? 0, icon: Activity },
    { label: 'Active Incidents', value: kpis?.activeIncidents ?? 0, icon: AlertTriangle },
    { label: 'Critical Priority', value: kpis?.criticalPriorityIncidents ?? 0, icon: ShieldCheck },
    { label: 'Available Resources', value: kpis?.availableResources ?? 0, icon: Package },
    { label: 'Registered Hospitals', value: kpis?.registeredHospitals ?? 0, icon: Building2 },
    { label: 'Resolved Incidents', value: kpis?.resolvedIncidents ?? 0, icon: CheckCircle2 },
    { label: 'Active Response Teams', value: kpis?.activeResponseTeams ?? 0, icon: Users },
    { label: 'Pending Verification', value: kpis?.pendingVerification ?? 0, icon: Clock },
  ];

  const toggleSort = (field: 'reportedAt' | 'priority') => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Executive Role Header */}
      <div className="gold-card-surface rounded-lg p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#493713]">
            ResQNet Command Overview
          </h1>
          <p className="text-sm text-[#29251C]/85 mt-1">
            Welcome, <strong>{user?.fullName}</strong> · Real-time operational picture synchronized with database records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {user?.role === 'CITIZEN' || user?.role === 'EMERGENCY_COORDINATOR' || user?.role === 'SUPER_ADMIN' ? (
            <button
              type="button"
              onClick={() => onNavigate('report')}
              className="px-4 py-2 rounded-md bg-[#D4AF37] hover:bg-[#C9A227] border border-[#493713] text-sm font-bold text-[#29251C] cursor-pointer whitespace-nowrap"
            >
              Submit Emergency Report
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onNavigate('map')}
            className="px-4 py-2 rounded-md bg-[#FFF2C6] hover:bg-[#F7E7A1] border border-[#C9A227] text-sm font-bold text-[#493713] cursor-pointer whitespace-nowrap"
          >
            Open Live Map
          </button>
        </div>
      </div>

      {/* 8 Database-Connected KPI Cards */}
      <section aria-label="Operational Statistics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="gold-card-surface rounded-lg p-4 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-xs font-bold text-[#493713]">{card.label}</p>
                <p className="text-3xl font-bold text-[#29251C] tabular-nums mt-1">
                  {card.value}
                </p>
              </div>
              <div className="h-11 w-11 rounded-md bg-[#F7E7A1] border border-[#C9A227] flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5 text-[#493713]" />
              </div>
            </div>
          );
        })}
      </section>

      {/* Interactive Charts Row */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="gold-card-surface rounded-lg p-5 min-w-0">
          <h2 className="text-lg font-bold text-[#493713] mb-3">
            Emergency Category Distribution
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.byCategory || []} margin={{ top: 5, right: 10, left: -15, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5D399" />
                <XAxis
                  dataKey="category"
                  tick={{ fill: '#29251C', fontSize: 10 }}
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis allowDecimals={false} tick={{ fill: '#29251C', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFDF5',
                    borderColor: '#C9A227',
                    fontFamily: 'Times New Roman',
                  }}
                />
                <Bar dataKey="count" name="Incidents" fill="#C9A227" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="gold-card-surface rounded-lg p-5 min-w-0">
          <h2 className="text-lg font-bold text-[#493713] mb-3">
            Incident Priority Breakdown
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics?.byPriority || []}
                  dataKey="count"
                  nameKey="priority"
                  cx="50%"
                  cy="45%"
                  outerRadius={68}
                  isAnimationActive={false}
                >
                  {(analytics?.byPriority || []).map((entry, idx) => (
                    <Cell
                      key={entry.priority}
                      fill={
                        entry.priority === 'Critical'
                          ? '#991B1B'
                          : entry.priority === 'High'
                            ? '#B45309'
                            : entry.priority === 'Medium'
                              ? '#C9A227'
                              : GOLD_CHART_COLORS[idx % GOLD_CHART_COLORS.length]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFDF5',
                    borderColor: '#C9A227',
                    fontFamily: 'Times New Roman',
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="gold-card-surface rounded-lg p-5 min-w-0">
          <h2 className="text-lg font-bold text-[#493713] mb-3">
            7-Day Incident Activity Trend
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics?.dailyTrends || []} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
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
                <Line type="monotone" dataKey="reported" name="Reported" stroke="#8A6D1B" strokeWidth={2.5} isAnimationActive={false} />
                <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#15803D" strokeWidth={2.5} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Bottom Split: Recent Incidents Table + Live Activity Panel */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 gold-card-surface rounded-lg p-5 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-bold text-[#493713]">Recent Incidents</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-[#493713] absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search ID, category, location..."
                  aria-label="Search recent incidents"
                  className="pl-8 pr-3 py-1.5 rounded-md border border-[#C9A227] bg-[#FFF2C6] text-xs text-[#29251C] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                />
              </div>
              <select
                aria-label="Filter incidents by status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 rounded-md border border-[#C9A227] bg-[#FFF2C6] text-xs font-bold text-[#493713]"
              >
                <option value="ALL">All Statuses</option>
                <option value="Reported">Reported</option>
                <option value="Under Verification">Under Verification</option>
                <option value="Verified">Verified</option>
                <option value="Assigned">Assigned</option>
                <option value="Response in Progress">Response in Progress</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#C9A227] text-xs font-bold text-[#493713] bg-[#FFF2C6]">
                  <th className="py-2.5 px-3">Incident ID</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('priority')}
                      className="inline-flex items-center gap-1 font-bold cursor-pointer"
                    >
                      Priority <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('reportedAt')}
                      className="inline-flex items-center gap-1 font-bold cursor-pointer"
                    >
                      Reported <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3">Team</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5D399]">
                {pagedIncidents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-sm text-[#493713]">
                      No incidents match the current search or filter criteria.
                    </td>
                  </tr>
                ) : (
                  pagedIncidents.map((inc) => (
                    <tr key={inc.id} className="hover:bg-[#FFF2C6]/60 transition-colors">
                      <td className="py-2.5 px-3 font-bold tabular-nums whitespace-nowrap">
                        {inc.incidentCode}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">{inc.category}</td>
                      <td className="py-2.5 px-3 max-w-[180px] truncate">{inc.locationText}</td>
                      <td className="py-2.5 px-3">
                        <PriorityIndicator priority={inc.priority} />
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusIndicator status={inc.status} />
                      </td>
                      <td className="py-2.5 px-3 text-xs tabular-nums whitespace-nowrap">
                        {new Date(inc.reportedAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-xs whitespace-nowrap">
                        {inc.assignedTeamName || 'Unassigned'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectIncident(inc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#C9A227] bg-[#F7E7A1] hover:bg-[#D4AF37] text-xs font-bold text-[#29251C] cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" /> Inspect
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-[#493713]">
            <span className="tabular-nums">
              Showing {pagedIncidents.length} of {filteredIncidents.length} incidents
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-[#C9A227] bg-[#FFF2C6] disabled:opacity-50 font-bold cursor-pointer"
              >
                Previous
              </button>
              <span className="tabular-nums font-bold">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded border border-[#C9A227] bg-[#FFF2C6] disabled:opacity-50 font-bold cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="xl:col-span-4 gold-card-surface rounded-lg p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[#493713]">Live Activity Panel</h2>
            <Radio className="h-4 w-4 text-[#493713]" />
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto max-h-[380px]">
            {recentEvents.map((evt, idx) => (
              <div
                key={`${evt.timestamp}-${idx}`}
                className="p-3 rounded-md border border-[#C9A227] bg-[#F7E7A1]/50 text-xs"
              >
                <p className="font-bold text-[#493713]">{evt.type}</p>
                <p className="text-[#29251C] mt-0.5">{JSON.stringify(evt.payload)}</p>
                <p className="text-[#493713]/75 tabular-nums mt-1">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </p>
              </div>
            ))}
            {notifications.slice(0, 6).map((n) => (
              <div
                key={n.id}
                className="p-3 rounded-md border border-[#C0C0C0] bg-[#FFF2C6] text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#493713]">{n.category}</span>
                  <span className="tabular-nums text-[#493713]/80">
                    {new Date(n.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="font-bold text-[#29251C] mt-1">{n.title}</p>
                <p className="text-[#29251C]/85 mt-0.5">{n.message}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
