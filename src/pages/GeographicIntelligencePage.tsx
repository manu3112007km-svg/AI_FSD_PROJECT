import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Layers, MapPin } from 'lucide-react';
import { INCIDENT_CATEGORIES } from '../server/domain/rules';
import type {
  HospitalRecord,
  IncidentRecord,
  ResourceRecord,
  ResponseTeamRecord,
} from '../types/resqnet';
import { PriorityIndicator, StatusIndicator } from '../components/StatusBadge';

function makeMarkerIcon(color: string, label: string) {
  return L.divIcon({
    className: 'resqnet-map-marker',
    html: `<div style="display:inline-block;transform:translate(-50%,-50%);background:${color};color:#FFFDF5;border:1.5px solid #29251C;border-radius:4px;padding:2px 6px;font-family:'Times New Roman',serif;font-size:11px;font-weight:bold;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.28);">${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function GeographicIntelligencePage({
  incidents,
  hospitals,
  resources,
  teams,
}: {
  incidents: IncidentRecord[];
  hospitals: HospitalRecord[];
  resources: ResourceRecord[];
  teams: ResponseTeamRecord[];
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [showIncidents, setShowIncidents] = useState(true);
  const [showHospitals, setShowHospitals] = useState(true);
  const [showResources, setShowResources] = useState(true);
  const [showTeams, setShowTeams] = useState(true);
  const [showClusters, setShowClusters] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedIncident, setSelectedIncident] = useState<IncidentRecord | null>(
    incidents[0] || null
  );

  const filteredIncidents = useMemo(() => {
    return incidents.filter((i) => {
      if (categoryFilter !== 'ALL' && i.category !== categoryFilter) return false;
      return i.latitude != null && i.longitude != null;
    });
  }, [incidents, categoryFilter]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [37.781, -122.416],
      zoom: 13,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (showIncidents) {
      for (const inc of filteredIncidents) {
        if (inc.latitude == null || inc.longitude == null) continue;
        const color =
          inc.priority === 'Critical'
            ? '#991B1B'
            : inc.priority === 'High'
              ? '#B45309'
              : '#8A6D1B';

        const marker = L.marker([inc.latitude, inc.longitude], {
          icon: makeMarkerIcon(color, inc.incidentCode.replace('INC-2026-', '#')),
        });
        marker.bindPopup(
          `<div style="font-family:'Times New Roman',serif;min-width:190px;">
            <strong>${inc.incidentCode} · ${inc.category}</strong><br/>
            <span>${inc.title}</span><br/>
            <small>${inc.locationText} (${inc.locationSource})</small><br/>
            <small>Priority: <b>${inc.priority}</b> · Status: <b>${inc.status}</b></small>
          </div>`
        );
        marker.on('click', () => setSelectedIncident(inc));
        marker.addTo(group);

        if (showClusters && inc.relationships && inc.relationships.length > 0) {
          L.circle([inc.latitude, inc.longitude], {
            radius: 450,
            color: '#C9A227',
            fillColor: '#D4AF37',
            fillOpacity: 0.16,
            weight: 1.5,
          }).addTo(group);
        }
      }
    }

    if (showHospitals) {
      for (const h of hospitals) {
        const marker = L.marker([h.latitude, h.longitude], {
          icon: makeMarkerIcon('#15803D', `H: ${h.generalBedsAvailable}b`),
        });
        marker.bindPopup(
          `<div style="font-family:'Times New Roman',serif;">
            <strong>${h.name}</strong><br/>
            <span>ED: ${h.edStatus} · General: ${h.generalBedsAvailable}/${h.generalBedsTotal} · ICU: ${h.icuBedsAvailable}/${h.icuBedsTotal}</span><br/>
            <small>${h.isCapacityStale ? 'WARNING: STALE CAPACITY (>6h)' : 'Recently Updated'}</small>
          </div>`
        );
        marker.addTo(group);
      }
    }

    if (showResources) {
      for (const r of resources) {
        const marker = L.marker([r.latitude, r.longitude], {
          icon: makeMarkerIcon('#493713', r.resourceCode.replace('RES-', '')),
        });
        marker.bindPopup(
          `<div style="font-family:'Times New Roman',serif;">
            <strong>${r.name} (${r.resourceCode})</strong><br/>
            <span>${r.category} · ${r.status}</span><br/>
            <small>${r.locationName}</small>
          </div>`
        );
        marker.addTo(group);
      }
    }

    if (showTeams) {
      for (const t of teams) {
        const marker = L.marker([t.latitude, t.longitude], {
          icon: makeMarkerIcon('#374151', t.teamCode),
        });
        marker.bindPopup(
          `<div style="font-family:'Times New Roman',serif;">
            <strong>${t.name}</strong><br/>
            <span>${t.specialty} · ${t.status}</span><br/>
            <small>${t.isSimulatedLocation ? 'Simulated Demo Coordinates' : 'Live GPS'}</small>
          </div>`
        );
        marker.addTo(group);
      }
    }
  }, [
    filteredIncidents,
    hospitals,
    resources,
    teams,
    showIncidents,
    showHospitals,
    showResources,
    showTeams,
    showClusters,
  ]);

  return (
    <div className="space-y-6">
      <div className="gold-card-surface rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#493713]">
            Interactive Geographic Intelligence
          </h1>
          <p className="text-sm text-[#29251C]/85 mt-1">
            Leaflet &amp; OpenStreetMap situational awareness across incidents, hospitals, resources, and teams. Demonstration coordinates are explicitly labeled.
          </p>
        </div>
        <select
          aria-label="Filter map incidents by category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 rounded-md border border-[#C9A227] bg-[#FFF2C6] text-xs font-bold text-[#493713]"
        >
          <option value="ALL">All Emergency Categories</option>
          {INCIDENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Layer Toggles */}
      <div className="gold-card-surface rounded-lg p-4 flex flex-wrap items-center gap-4 text-xs font-bold text-[#493713]">
        <span className="inline-flex items-center gap-1.5">
          <Layers className="h-4 w-4" /> Map Layers:
        </span>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showIncidents}
            onChange={(e) => setShowIncidents(e.target.checked)}
          />
          <span>Incidents ({filteredIncidents.length})</span>
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showHospitals}
            onChange={(e) => setShowHospitals(e.target.checked)}
          />
          <span>Hospitals ({hospitals.length})</span>
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showResources}
            onChange={(e) => setShowResources(e.target.checked)}
          />
          <span>Resources ({resources.length})</span>
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showTeams}
            onChange={(e) => setShowTeams(e.target.checked)}
          />
          <span>Response Teams ({teams.length})</span>
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showClusters}
            onChange={(e) => setShowClusters(e.target.checked)}
          />
          <span>Cluster Proximity Zones</span>
        </label>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 gold-card-surface rounded-lg p-2 overflow-hidden">
          <div
            ref={mapContainerRef}
            data-testid="leaflet-map"
            className="w-full h-[500px] rounded border border-[#C9A227]"
          />
        </div>

        <div className="xl:col-span-4 gold-card-surface rounded-lg p-5 space-y-4">
          <h2 className="text-lg font-bold text-[#493713] inline-flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Selected Geographic Entity
          </h2>
          {selectedIncident ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold tabular-nums text-[#493713]">
                  {selectedIncident.incidentCode}
                </span>
                <PriorityIndicator priority={selectedIncident.priority} />
              </div>
              <p className="font-bold text-[#29251C]">{selectedIncident.title}</p>
              <StatusIndicator status={selectedIncident.status} />
              <p className="text-xs text-[#29251C] leading-relaxed">
                {selectedIncident.description}
              </p>
              <div className="bg-[#FFF2C6] border border-[#C9A227] rounded p-3 text-xs space-y-1">
                <p>
                  <strong>Address:</strong> {selectedIncident.locationText}
                </p>
                <p className="tabular-nums">
                  <strong>Coordinates:</strong> {selectedIncident.latitude?.toFixed(4)},{' '}
                  {selectedIncident.longitude?.toFixed(4)}
                </p>
                <p>
                  <strong>Coordinate Origin:</strong>{' '}
                  {selectedIncident.locationSource === 'SIMULATED_DEMO'
                    ? 'Demonstration Data (Simulated)'
                    : selectedIncident.locationSource}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#493713]">
              Click any incident marker on the map to inspect its coordinates and dispatch status.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
