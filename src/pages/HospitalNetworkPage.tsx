import React, { useState } from 'react';
import { AlertCircle, Building2, CheckCircle2, Plus, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { canUpdateHospitalCapacity } from '../server/domain/rules';
import type { HospitalRecord } from '../types/resqnet';
import { StatusIndicator } from '../components/StatusBadge';

export function HospitalNetworkPage({
  hospitals,
  onRefresh,
}: {
  hospitals: HospitalRecord[];
  onRefresh: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [editingHospital, setEditingHospital] = useState<HospitalRecord | null>(null);
  const [edStatus, setEdStatus] = useState('Operational');
  const [genAvail, setGenAvail] = useState(0);
  const [genTotal, setGenTotal] = useState(0);
  const [icuAvail, setIcuAvail] = useState(0);
  const [icuTotal, setIcuTotal] = useState(0);
  const [facilities, setFacilities] = useState('');
  const [incomingCases, setIncomingCases] = useState(0);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddr, setNewAddr] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canEdit = user ? canUpdateHospitalCapacity(user.role) : false;
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const openEditor = (h: HospitalRecord) => {
    setEditingHospital(h);
    setEdStatus(h.edStatus);
    setGenAvail(h.generalBedsAvailable);
    setGenTotal(h.generalBedsTotal);
    setIcuAvail(h.icuBedsAvailable);
    setIcuTotal(h.icuBedsTotal);
    setFacilities(h.availableFacilities);
    setIncomingCases(h.incomingCasesCount);
  };

  const handleSaveCapacity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHospital) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/api/hospitals/${editingHospital.id}/capacity`, {
        method: 'PATCH',
        body: JSON.stringify({
          edStatus,
          generalBedsAvailable: Number(genAvail),
          generalBedsTotal: Number(genTotal),
          icuBedsAvailable: Number(icuAvail),
          icuBedsTotal: Number(icuTotal),
          availableFacilities: facilities,
          incomingCasesCount: Number(incomingCases),
        }),
      });
      setMessage(`Updated capacity for ${editingHospital.name}. Coordinators notified.`);
      setEditingHospital(null);
      await onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Capacity update failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterHospital = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch('/api/hospitals', {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          address: newAddr,
          contactPhone: newPhone,
          contactEmail: newEmail,
        }),
      });
      setShowAdd(false);
      setNewName('');
      setNewAddr('');
      setNewPhone('');
      setNewEmail('');
      setMessage('Hospital registered.');
      await onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleVerify = async (h: HospitalRecord) => {
    setBusy(true);
    try {
      await apiFetch(`/api/hospitals/${h.id}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ isVerified: !h.isVerified }),
      });
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
            Hospital Coordination Network
          </h1>
          <p className="text-sm text-[#29251C]/85 mt-1">
            Monitor emergency department status, general &amp; ICU bed capacity, and verification freshness. Capacity records older than 6 hours are flagged stale.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#D4AF37] hover:bg-[#C9A227] border border-[#493713] text-sm font-bold text-[#29251C] cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Register Hospital
          </button>
        )}
      </div>

      {message && (
        <div className="rounded-md border border-[#C9A227] bg-[#F7E7A1] px-4 py-2.5 text-sm font-bold text-[#493713]">
          {message}
        </div>
      )}

      {showAdd && canEdit && (
        <form onSubmit={handleRegisterHospital} className="gold-card-surface rounded-lg p-5 space-y-4">
          <h2 className="text-lg font-bold text-[#493713]">Register Medical Facility</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              placeholder="Hospital Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm"
            />
            <input
              type="text"
              required
              placeholder="Street Address"
              value={newAddr}
              onChange={(e) => setNewAddr(e.target.value)}
              className="rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm"
            />
            <input
              type="text"
              required
              placeholder="Contact Phone"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm"
            />
            <input
              type="email"
              required
              placeholder="Emergency Intake Email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="rounded-md border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 rounded border border-[#C9A227] bg-[#FFF2C6] text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded border border-[#493713] bg-[#D4AF37] text-xs font-bold cursor-pointer"
            >
              Register Facility
            </button>
          </div>
        </form>
      )}

      {/* Capacity Editor Modal / Drawer */}
      {editingHospital && (
        <form
          onSubmit={handleSaveCapacity}
          className="gold-card-surface rounded-lg p-5 sm:p-6 space-y-4 border-2 border-[#493713]"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#493713]">
              Update Capacity · {editingHospital.name}
            </h2>
            <button
              type="button"
              onClick={() => setEditingHospital(null)}
              className="text-xs font-bold text-[#7F1D1D] underline cursor-pointer"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="ed-status" className="block text-xs font-bold text-[#493713] mb-1">
                ED Status
              </label>
              <select
                id="ed-status"
                value={edStatus}
                onChange={(e) => setEdStatus(e.target.value)}
                className="w-full rounded border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm font-bold"
              >
                <option value="Operational">Operational</option>
                <option value="High Load">High Load</option>
                <option value="Limited Triage">Limited Triage</option>
              </select>
            </div>
            <div>
              <label htmlFor="gen-avail" className="block text-xs font-bold text-[#493713] mb-1">
                General Beds Available
              </label>
              <input
                id="gen-avail"
                type="number"
                min={0}
                value={genAvail}
                onChange={(e) => setGenAvail(Number(e.target.value))}
                className="w-full rounded border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="gen-total" className="block text-xs font-bold text-[#493713] mb-1">
                General Beds Total
              </label>
              <input
                id="gen-total"
                type="number"
                min={1}
                value={genTotal}
                onChange={(e) => setGenTotal(Number(e.target.value))}
                className="w-full rounded border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="icu-avail" className="block text-xs font-bold text-[#493713] mb-1">
                ICU Beds Available
              </label>
              <input
                id="icu-avail"
                type="number"
                min={0}
                value={icuAvail}
                onChange={(e) => setIcuAvail(Number(e.target.value))}
                className="w-full rounded border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="icu-total" className="block text-xs font-bold text-[#493713] mb-1">
                ICU Beds Total
              </label>
              <input
                id="icu-total"
                type="number"
                min={0}
                value={icuTotal}
                onChange={(e) => setIcuTotal(Number(e.target.value))}
                className="w-full rounded border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="incoming-cases" className="block text-xs font-bold text-[#493713] mb-1">
                Incoming Emergency Cases
              </label>
              <input
                id="incoming-cases"
                type="number"
                min={0}
                value={incomingCases}
                onChange={(e) => setIncomingCases(Number(e.target.value))}
                className="w-full rounded border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label htmlFor="hosp-fac" className="block text-xs font-bold text-[#493713] mb-1">
                Available Medical Facilities
              </label>
              <input
                id="hosp-fac"
                type="text"
                value={facilities}
                onChange={(e) => setFacilities(e.target.value)}
                className="w-full rounded border border-[#C9A227] bg-[#FFF2C6] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 rounded-md bg-[#D4AF37] hover:bg-[#C9A227] border border-[#493713] text-sm font-bold text-[#29251C] cursor-pointer"
            >
              Publish Capacity Update
            </button>
          </div>
        </form>
      )}

      {/* Hospital Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {hospitals.map((h) => {
          const genPct =
            h.generalBedsTotal > 0
              ? Math.round((h.generalBedsAvailable / h.generalBedsTotal) * 100)
              : 0;
          const icuPct =
            h.icuBedsTotal > 0 ? Math.round((h.icuBedsAvailable / h.icuBedsTotal) * 100) : 0;

          return (
            <div key={h.id} className="gold-card-surface rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[#493713] tabular-nums">
                    {h.hospitalCode} · {h.isDemo ? 'Demonstration Facility' : 'Registered Facility'}
                  </p>
                  <h2 className="text-xl font-bold text-[#29251C] flex items-center gap-2 mt-0.5">
                    <Building2 className="h-5 w-5 text-[#493713] shrink-0" />
                    <span>{h.name}</span>
                  </h2>
                  <p className="text-xs text-[#493713] mt-0.5">
                    {h.address} · {h.contactPhone}
                  </p>
                </div>
                <StatusIndicator status={h.edStatus} />
              </div>

              {/* Verification & Stale Advisories */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {h.isVerified ? (
                  <span className="inline-flex items-center gap-1 font-bold text-[#14532D] bg-[#ECFDF5] border border-[#15803D] px-2 py-0.5 rounded">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Verified Hospital
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-bold text-[#78350F] bg-[#FEF3C7] border border-[#B45309] px-2 py-0.5 rounded">
                    <AlertCircle className="h-3.5 w-3.5" /> Unverified Registration
                  </span>
                )}

                {h.isCapacityStale ? (
                  <span className="inline-flex items-center gap-1 font-bold text-[#7F1D1D] bg-[#FDECEC] border border-[#B91C1C] px-2 py-0.5 rounded">
                    <AlertCircle className="h-3.5 w-3.5" /> STALE CAPACITY (&gt;6h old)
                  </span>
                ) : (
                  <span className="text-[#493713] tabular-nums">
                    Updated {new Date(h.capacityUpdatedAt).toLocaleString()}
                  </span>
                )}
              </div>

              {/* Visual Capacity Gauges */}
              <div className="space-y-3 bg-[#FFF2C6] border border-[#C9A227] rounded-md p-3.5">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>General Beds Available</span>
                    <span className="tabular-nums">
                      {h.generalBedsAvailable} / {h.generalBedsTotal} ({genPct}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded bg-[#FFFDF5] border border-[#C9A227] overflow-hidden">
                    <div
                      className="h-full bg-[#C9A227] transition-all"
                      style={{ width: `${Math.min(100, genPct)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>ICU Beds Available</span>
                    <span className="tabular-nums">
                      {h.icuBedsAvailable} / {h.icuBedsTotal} ({icuPct}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded bg-[#FFFDF5] border border-[#C9A227] overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        h.icuBedsAvailable === 0 ? 'bg-[#B91C1C]' : 'bg-[#15803D]'
                      }`}
                      style={{ width: `${Math.min(100, icuPct)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="text-xs text-[#29251C] space-y-1">
                <p>
                  <strong>Facilities:</strong> {h.availableFacilities}
                </p>
                <p className="tabular-nums">
                  <strong>Incoming Emergency Cases:</strong> {h.incomingCasesCount}
                </p>
              </div>

              {(canEdit || isSuperAdmin) && (
                <div className="pt-2 border-t border-[#C0C0C0] flex flex-wrap items-center justify-end gap-2">
                  {isSuperAdmin && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleToggleVerify(h)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#C9A227] bg-[#FFF2C6] hover:bg-[#F7E7A1] text-xs font-bold text-[#493713] cursor-pointer"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {h.isVerified ? 'Revoke Verification' : 'Verify Hospital'}
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openEditor(h)}
                      className="px-3.5 py-1.5 rounded border border-[#493713] bg-[#D4AF37] hover:bg-[#C9A227] text-xs font-bold text-[#29251C] cursor-pointer"
                    >
                      Update Capacity
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
