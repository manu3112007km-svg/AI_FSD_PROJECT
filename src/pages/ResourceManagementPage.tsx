import React, { useMemo, useState } from 'react';
import { Package, Plus, RefreshCw } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { ResourceRecord, ResourceStatus } from '../types/resqnet';
import { StatusIndicator } from '../components/StatusBadge';

const RESOURCE_CATEGORIES = [
  'Ambulance',
  'Emergency Response Vehicle',
  'Rescue Team',
  'Medical Supplies',
  'Emergency Equipment',
  'Temporary Shelter',
  'Disaster Response Resource',
];

const RESOURCE_STATUSES: ResourceStatus[] = [
  'Available',
  'Assigned',
  'In Service',
  'Under Maintenance',
  'Unavailable',
];

export function ResourceManagementPage({
  resources,
  onRefresh,
}: {
  resources: ResourceRecord[];
  onRefresh: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [catFilter, setCatFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showAdd, setShowAdd] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Ambulance');
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState('37.7749');
  const [longitude, setLongitude] = useState('-122.4194');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canModify =
    user &&
    ['SUPER_ADMIN', 'EMERGENCY_COORDINATOR', 'EMERGENCY_RESPONDER'].includes(user.role);

  const filtered = useMemo(() => {
    return resources.filter((r) => {
      if (catFilter !== 'ALL' && r.category !== catFilter) return false;
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      return true;
    });
  }, [resources, catFilter, statusFilter]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch('/api/resources', {
        method: 'POST',
        body: JSON.stringify({
          name,
          category,
          locationName,
          latitude: Number(latitude),
          longitude: Number(longitude),
        }),
      });
      setName('');
      setLocationName('');
      setShowAdd(false);
      setMsg('Resource registered to database.');
      await onRefresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to register resource.');
    } finally {
      setBusy(false);
    }
  };

  const handleStatusUpdate = async (id: number, status: ResourceStatus) => {
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch(`/api/resources/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setMsg(`Resource status updated to ${status}.`);
      await onRefresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Unable to update resource.');
    } finally {
      setBusy(false);
    }
  };

  const availableCount = resources.filter((r) => r.status === 'Available').length;
  const assignedCount = resources.filter((r) => r.status === 'Assigned' || r.status === 'In Service').length;
  const maintenanceCount = resources.filter(
    (r) => r.status === 'Under Maintenance' || r.status === 'Unavailable'
  ).length;

  return (
    <div className="space-y-6">
      <div className="gold-card-surface rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#493713]">
            Smart Resource Management
          </h1>
          <p className="text-sm text-[#29251C]/85 mt-1">
            Monitor ambulances, rescue units, medical supplies, and emergency equipment availability.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#C9A227] bg-[#FFF2C6] text-xs font-bold text-[#493713] cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          {canModify && (
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D4AF37] hover:bg-[#C9A227] border border-[#493713] text-sm font-bold text-[#29251C] cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Register Resource
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="gold-card-surface rounded-lg p-4">
          <p className="text-xs font-bold text-[#493713]">Available for Dispatch</p>
          <p className="text-3xl font-bold tabular-nums text-[#14532D] mt-1">{availableCount}</p>
        </div>
        <div className="gold-card-surface rounded-lg p-4">
          <p className="text-xs font-bold text-[#493713]">Assigned / In Service</p>
          <p className="text-3xl font-bold tabular-nums text-[#493713] mt-1">{assignedCount}</p>
        </div>
        <div className="gold-card-surface rounded-lg p-4">
          <p className="text-xs font-bold text-[#493713]">Maintenance / Unavailable</p>
          <p className="text-3xl font-bold tabular-nums text-[#7F1D1D] mt-1">{maintenanceCount}</p>
        </div>
      </div>

      {msg && (
        <div className="rounded-md border border-[#C9A227] bg-[#F7E7A1] px-4 py-2.5 text-sm font-bold text-[#493713]">
          {msg}
        </div>
      )}

      {showAdd && canModify && (
        <form onSubmit={handleRegister} className="gold-card-surface rounded-lg p-5 space-y-4">
          <h2 className="text-lg font-bold text-[#493713]">Register Emergency Resource</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              type="text"
              required
              placeholder="Resource Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm"
            >
              {RESOURCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="text"
              required
              placeholder="Staging Location"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              className="rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                aria-label="Resource Latitude"
                className="w-1/2 rounded-md border border-[#C9A227] bg-[#FFF2C6] px-2 py-2 text-xs tabular-nums"
              />
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                aria-label="Resource Longitude"
                className="w-1/2 rounded-md border border-[#C9A227] bg-[#FFF2C6] px-2 py-2 text-xs tabular-nums"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 rounded-md border border-[#C9A227] bg-[#FFF2C6] text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-md border border-[#493713] bg-[#D4AF37] text-xs font-bold cursor-pointer"
            >
              Save Resource
            </button>
          </div>
        </form>
      )}

      {/* Resource Table */}
      <div className="gold-card-surface rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[#493713] inline-flex items-center gap-2">
            <Package className="h-4 w-4" /> Resource Inventory ({filtered.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Filter by resource category"
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-md border border-[#C9A227] bg-[#FFF2C6] text-xs font-bold"
            >
              <option value="ALL">All Categories</option>
              {RESOURCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by resource status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-md border border-[#C9A227] bg-[#FFF2C6] text-xs font-bold"
            >
              <option value="ALL">All Statuses</option>
              {RESOURCE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#C9A227] bg-[#FFF2C6] text-xs font-bold text-[#493713]">
                <th className="py-2.5 px-3">Resource ID</th>
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Assigned Incident</th>
                <th className="py-2.5 px-3">Location</th>
                <th className="py-2.5 px-3">Organization</th>
                <th className="py-2.5 px-3">Last Updated</th>
                {canModify && <th className="py-2.5 px-3 text-right">Change Status</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5D399]">
              {filtered.map((res) => (
                <tr key={res.id} className="hover:bg-[#FFF2C6]/60">
                  <td className="py-2.5 px-3 font-bold tabular-nums whitespace-nowrap">
                    {res.resourceCode}
                  </td>
                  <td className="py-2.5 px-3 font-bold">{res.name}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{res.category}</td>
                  <td className="py-2.5 px-3">
                    <StatusIndicator status={res.status} />
                  </td>
                  <td className="py-2.5 px-3 tabular-nums">
                    {res.assignedIncidentCode || 'None'}
                  </td>
                  <td className="py-2.5 px-3">{res.locationName}</td>
                  <td className="py-2.5 px-3 text-xs">{res.organizationName || 'Civic Pool'}</td>
                  <td className="py-2.5 px-3 text-xs tabular-nums whitespace-nowrap">
                    {new Date(res.updatedAt).toLocaleString()}
                  </td>
                  {canModify && (
                    <td className="py-2.5 px-3 text-right">
                      <select
                        aria-label={`Update status for ${res.resourceCode}`}
                        value={res.status}
                        disabled={busy}
                        onChange={(e) =>
                          void handleStatusUpdate(res.id, e.target.value as ResourceStatus)
                        }
                        className="rounded border border-[#C9A227] bg-[#F7E7A1] px-2 py-1 text-xs font-bold"
                      >
                        {RESOURCE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
