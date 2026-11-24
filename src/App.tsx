import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { RealtimeProvider, useRealtime } from './contexts/RealtimeContext';
import { apiFetch } from './services/api';
import { AuthPortal } from './components/AuthPortal';
import { LayoutShell, type NavTabKey } from './components/LayoutShell';
import { canAccessModule } from './server/domain/rules';
import type {
  AnalyticsOverview,
  HospitalRecord,
  IncidentRecord,
  NotificationRecord,
  ResourceRecord,
  ResponseTeamRecord,
} from './types/resqnet';

import { OverviewPage } from './pages/OverviewPage';
import { EmergencyReportPage } from './pages/EmergencyReportPage';
import { IncidentManagementPage } from './pages/IncidentManagementPage';
import { ResourceManagementPage } from './pages/ResourceManagementPage';
import { HospitalNetworkPage } from './pages/HospitalNetworkPage';
import { LiveTrackingPage } from './pages/LiveTrackingPage';
import { GeographicIntelligencePage } from './pages/GeographicIntelligencePage';
import { AiIntelligencePage } from './pages/AiIntelligencePage';
import { AnalyticsReportsPage } from './pages/AnalyticsReportsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { UserManagementPage } from './pages/UserManagementPage';
import { SettingsPage } from './pages/SettingsPage';

function AuthenticatedWorkspace() {
  const { user } = useAuth();
  const { lastEvent } = useRealtime();

  const [activeTab, setActiveTab] = useState<NavTabKey>('overview');
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [resources, setResources] = useState<ResourceRecord[]>([]);
  const [hospitals, setHospitals] = useState<HospitalRecord[]>([]);
  const [teams, setTeams] = useState<ResponseTeamRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadWorkspaceData = useCallback(async () => {
    if (!user) return;
    try {
      const [incRes, resRes, hospRes, teamRes, notifRes, analRes] = await Promise.all([
        apiFetch<{ incidents: IncidentRecord[] }>('/api/incidents'),
        apiFetch<{ resources: ResourceRecord[] }>('/api/resources'),
        apiFetch<{ hospitals: HospitalRecord[] }>('/api/hospitals'),
        apiFetch<{ teams: ResponseTeamRecord[] }>('/api/teams'),
        apiFetch<{ notifications: NotificationRecord[] }>('/api/notifications'),
        apiFetch<AnalyticsOverview>('/api/analytics/overview'),
      ]);
      setIncidents(incRes.incidents);
      setResources(resRes.resources);
      setHospitals(hospRes.hospitals);
      setTeams(teamRes.teams);
      setNotifications(notifRes.notifications);
      setAnalytics(analRes);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to synchronize workspace data.');
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    setLoadingData(true);
    setActiveTab('overview');
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  // Real-time WebSocket event refresh
  useEffect(() => {
    if (!lastEvent || lastEvent.type === 'system:connected') return;
    void loadWorkspaceData();
  }, [lastEvent, loadWorkspaceData]);

  if (!user) return null;

  const safeTab: NavTabKey = canAccessModule(user.role, activeTab) ? activeTab : 'overview';
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleOpenIncident = (inc: IncidentRecord) => {
    setSelectedIncidentId(inc.id);
    if (canAccessModule(user.role, 'incidents')) {
      setActiveTab('incidents');
    } else {
      setActiveTab('tracking');
    }
  };

  return (
    <LayoutShell
      activeTab={safeTab}
      onSelectTab={setActiveTab}
      unreadNotificationsCount={unreadCount}
    >
      {loadError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-[#B91C1C] bg-[#FDECEC] px-4 py-3 text-sm font-bold text-[#7F1D1D]"
        >
          {loadError}
        </div>
      )}

      {loadingData && incidents.length === 0 ? (
        <div className="gold-card-surface rounded-lg p-12 text-center text-base font-bold text-[#493713]">
          Loading ResQNet operational workspace...
        </div>
      ) : (
        <>
          {safeTab === 'overview' && (
            <OverviewPage
              analytics={analytics}
              incidents={incidents}
              notifications={notifications}
              onNavigate={setActiveTab}
              onSelectIncident={handleOpenIncident}
            />
          )}
          {safeTab === 'report' && (
            <EmergencyReportPage
              onCreated={(inc) => {
                setSelectedIncidentId(inc.id);
                void loadWorkspaceData();
              }}
            />
          )}
          {safeTab === 'incidents' && (
            <IncidentManagementPage
              incidents={incidents}
              teams={teams}
              selectedIncidentId={selectedIncidentId}
              onSelectIncidentId={setSelectedIncidentId}
              onRefresh={loadWorkspaceData}
            />
          )}
          {safeTab === 'resources' && (
            <ResourceManagementPage resources={resources} onRefresh={loadWorkspaceData} />
          )}
          {safeTab === 'hospitals' && (
            <HospitalNetworkPage hospitals={hospitals} onRefresh={loadWorkspaceData} />
          )}
          {safeTab === 'tracking' && (
            <LiveTrackingPage incidents={incidents} onRefresh={loadWorkspaceData} />
          )}
          {safeTab === 'map' && (
            <GeographicIntelligencePage
              incidents={incidents}
              hospitals={hospitals}
              resources={resources}
              teams={teams}
            />
          )}
          {safeTab === 'ai' && <AiIntelligencePage incidents={incidents} />}
          {safeTab === 'analytics' && (
            <AnalyticsReportsPage
              analytics={analytics}
              incidents={incidents}
              resources={resources}
              hospitals={hospitals}
            />
          )}
          {safeTab === 'notifications' && (
            <NotificationsPage
              notifications={notifications}
              onRefresh={loadWorkspaceData}
              onOpenIncidentId={(id) => {
                setSelectedIncidentId(id);
                setActiveTab(canAccessModule(user.role, 'incidents') ? 'incidents' : 'tracking');
              }}
            />
          )}
          {safeTab === 'users' && <UserManagementPage onGlobalRefresh={loadWorkspaceData} />}
          {safeTab === 'settings' && <SettingsPage />}
        </>
      )}
    </LayoutShell>
  );
}

function AppRoot() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF2C6] flex items-center justify-center p-6">
        <div className="gold-card-surface rounded-lg px-8 py-6 text-center">
          <h1 className="text-2xl font-bold text-[#493713]">ResQNet</h1>
          <p className="text-sm text-[#29251C] mt-1">Initializing secure emergency session...</p>
        </div>
      </div>
    );
  }

  return (
    <RealtimeProvider enabled={Boolean(user)}>
      {user ? <AuthenticatedWorkspace /> : <AuthPortal />}
    </RealtimeProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoot />
    </AuthProvider>
  );
}
