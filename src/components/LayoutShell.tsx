import React, { useState } from 'react';
import {
  Activity,
  AlertOctagon,
  BarChart3,
  Bell,
  Bot,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  Package,
  Settings,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { canAccessModule } from '../server/domain/rules';
import type { UserRole } from '../types/resqnet';

export type NavTabKey =
  | 'overview'
  | 'report'
  | 'incidents'
  | 'resources'
  | 'hospitals'
  | 'tracking'
  | 'map'
  | 'ai'
  | 'analytics'
  | 'notifications'
  | 'users'
  | 'settings';

interface NavItem {
  key: NavTabKey;
  label: string;
  section: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const ALL_NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: 'Overview', section: 'Command & Operations', icon: LayoutDashboard },
  { key: 'report', label: 'Emergency Reports', section: 'Command & Operations', icon: AlertOctagon },
  { key: 'incidents', label: 'Incident Management', section: 'Command & Operations', icon: ClipboardList },
  { key: 'tracking', label: 'Live Tracking', section: 'Command & Operations', icon: Activity },
  { key: 'resources', label: 'Resource Management', section: 'Infrastructure & Network', icon: Package },
  { key: 'hospitals', label: 'Hospital Network', section: 'Infrastructure & Network', icon: Building2 },
  { key: 'map', label: 'Geographic Intelligence', section: 'Infrastructure & Network', icon: MapIcon },
  { key: 'ai', label: 'AI Intelligence', section: 'Intelligence & Insights', icon: Bot },
  { key: 'analytics', label: 'Analytics & Reports', section: 'Intelligence & Insights', icon: BarChart3 },
  { key: 'notifications', label: 'Notifications', section: 'Intelligence & Insights', icon: Bell },
  { key: 'users', label: 'User Management', section: 'Governance & Account', icon: Users },
  { key: 'settings', label: 'Settings', section: 'Governance & Account', icon: Settings },
];

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Administrator',
  EMERGENCY_COORDINATOR: 'Emergency Coordinator',
  EMERGENCY_RESPONDER: 'Emergency Responder',
  HOSPITAL_ADMIN: 'Hospital Administrator',
  CITIZEN: 'Citizen',
};

const EMBLEM_SRC = '/src/assets/images/resqnet_emblem_1795092987885.jpg';

export function LayoutShell({
  activeTab,
  onSelectTab,
  unreadNotificationsCount,
  children,
}: {
  activeTab: NavTabKey;
  onSelectTab: (tab: NavTabKey) => void;
  unreadNotificationsCount: number;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const { connectionState } = useRealtime();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'Command & Operations': true,
    'Infrastructure & Network': true,
    'Intelligence & Insights': true,
    'Governance & Account': true,
  });

  if (!user) return null;

  const allowedItems = ALL_NAV_ITEMS.filter((item) => canAccessModule(user.role, item.key));
  const sections = Array.from(new Set(allowedItems.map((i) => i.section)));
  const activeMeta = ALL_NAV_ITEMS.find((i) => i.key === activeTab) || allowedItems[0];

  // Top horizontal quick tabs (role-filtered, concise single-line labels)
  const topTabKeys: NavTabKey[] = ['overview', 'incidents', 'resources', 'hospitals', 'map', 'analytics', 'ai'];
  const topTabs = allowedItems.filter((item) => topTabKeys.includes(item.key)).slice(0, 5);

  const toggleSection = (sec: string) => {
    setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  const handleNavClick = (key: NavTabKey) => {
    onSelectTab(key);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF2C6] text-[#29251C] overflow-x-hidden">
      {/* Top 3-Zone Header */}
      <header className="sticky top-0 z-30 bg-[#F7E7A1] border-b border-[#C9A227] px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="lg:hidden p-2 rounded border border-[#C9A227] bg-[#FFFDF5] text-[#493713] cursor-pointer shrink-0"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('overview')}
            className="flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <img
              src={EMBLEM_SRC}
              alt="ResQNet crest"
              referrerPolicy="no-referrer"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded border border-[#C9A227] object-cover"
            />
            <span className="text-lg sm:text-xl font-bold tracking-tight text-[#493713]">ResQNet</span>
          </button>
        </div>

        {/* Zone 2: Horizontal Gold Navigation Tabs */}
        <nav
          aria-label="Primary sections"
          className="hidden md:flex items-center gap-1.5 overflow-x-auto"
        >
          {topTabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleNavClick(tab.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#D4AF37] text-[#29251C] border border-[#493713]'
                    : 'text-[#493713] hover:bg-[#FFF2C6] border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action & Account Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleNavClick('notifications')}
            aria-label={`Notifications (${unreadNotificationsCount} unread)`}
            className="relative px-2 sm:px-2.5 py-1.5 rounded-md border border-[#C9A227] bg-[#FFFDF5] hover:bg-[#FFF2C6] text-[#493713] text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Bell className="h-4 w-4" />
            <span className="tabular-nums">{unreadNotificationsCount}</span>
          </button>

          {canAccessModule(user.role, 'report') ? (
            <button
              type="button"
              onClick={() => handleNavClick('report')}
              className="px-2.5 sm:px-3.5 py-1.5 rounded-md bg-[#D4AF37] hover:bg-[#C9A227] border border-[#493713] text-xs sm:text-sm font-bold text-[#29251C] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="sm:hidden">Report</span>
              <span className="hidden sm:inline">Report Emergency</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleNavClick('settings')}
              className="hidden sm:inline-flex px-3.5 py-1.5 rounded-md bg-[#FFFDF5] hover:bg-[#FFF2C6] border border-[#C9A227] text-sm font-bold text-[#493713] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {ROLE_LABELS[user.role]}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Desktop Collapsible Sidebar */}
        <aside
          className={`hidden lg:flex flex-col shrink-0 bg-[#FFFDF5] border-r border-[#C9A227] transition-all duration-200 ${
            sidebarCollapsed ? 'w-20' : 'w-64'
          }`}
        >
          <div className="p-3 border-b border-[#C0C0C0] flex items-center justify-between gap-2">
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#29251C] truncate">{user.fullName}</p>
                <p className="text-xs text-[#493713] truncate">{ROLE_LABELS[user.role]}</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="p-1.5 rounded border border-[#C9A227] bg-[#FFF2C6] hover:bg-[#F7E7A1] text-[#493713] cursor-pointer shrink-0"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          <nav aria-label="Module navigation" className="flex-1 overflow-y-auto p-2.5 space-y-3">
            {sections.map((sectionName) => {
              const items = allowedItems.filter((i) => i.section === sectionName);
              const isOpen = openSections[sectionName] ?? true;
              return (
                <div key={sectionName}>
                  {!sidebarCollapsed && (
                    <button
                      type="button"
                      onClick={() => toggleSection(sectionName)}
                      className="w-full flex items-center justify-between px-2 py-1 text-xs font-bold text-[#493713] hover:text-[#29251C] cursor-pointer"
                    >
                      <span className="truncate">{sectionName}</span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${
                          isOpen ? '' : '-rotate-90'
                        }`}
                      />
                    </button>
                  )}
                  {(isOpen || sidebarCollapsed) && (
                    <div className="mt-1 space-y-1">
                      {items.map((item) => {
                        const Icon = item.icon;
                        const active = activeTab === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            title={sidebarCollapsed ? item.label : undefined}
                            onClick={() => handleNavClick(item.key)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-bold transition-colors cursor-pointer ${
                              active
                                ? 'bg-[#D4AF37] text-[#29251C] border border-[#493713]'
                                : 'text-[#493713] hover:bg-[#FFF2C6] border border-transparent'
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            {!sidebarCollapsed && (
                              <span className="truncate flex-1 text-left">{item.label}</span>
                            )}
                            {!sidebarCollapsed &&
                              item.key === 'notifications' &&
                              unreadNotificationsCount > 0 && (
                                <span className="tabular-nums text-xs px-1.5 py-0.5 rounded bg-[#FFFDF5] border border-[#C9A227] text-[#493713]">
                                  {unreadNotificationsCount}
                                </span>
                              )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="p-3 border-t border-[#C0C0C0] space-y-2">
            {!sidebarCollapsed && (
              <div className="flex items-center justify-between text-xs text-[#493713] px-1">
                <span>WebSocket Sync</span>
                <span className="inline-flex items-center gap-1.5 font-bold">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      connectionState === 'connected'
                        ? 'bg-[#16A34A] animate-pulse'
                        : 'bg-[#D97706]'
                    }`}
                  />
                  {connectionState === 'connected' ? 'Live' : 'Syncing'}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-[#C9A227] bg-[#FFF2C6] hover:bg-[#F7E7A1] text-sm font-bold text-[#493713] cursor-pointer"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span>Sign Out</span>}
            </button>
          </div>
        </aside>

        {/* Mobile Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 lg:hidden bg-[#29251C]/35 flex"
            >
              <motion.div
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ duration: 0.18 }}
                className="w-72 max-w-[85vw] bg-[#FFFDF5] border-r border-[#C9A227] h-full flex flex-col p-4"
              >
                <div className="flex items-center justify-between pb-3 border-b border-[#C0C0C0]">
                  <div>
                    <p className="text-base font-bold text-[#493713]">{user.fullName}</p>
                    <p className="text-xs text-[#493713]/80">{ROLE_LABELS[user.role]}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close navigation menu"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 rounded border border-[#C9A227] bg-[#FFF2C6] cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <nav className="flex-1 overflow-y-auto py-3 space-y-1">
                  {allowedItems.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleNavClick(item.key)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-bold cursor-pointer ${
                          active
                            ? 'bg-[#D4AF37] text-[#29251C] border border-[#493713]'
                            : 'text-[#493713] hover:bg-[#FFF2C6]'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
                <button
                  type="button"
                  onClick={logout}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-[#C9A227] bg-[#F7E7A1] text-sm font-bold text-[#493713] cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </motion.div>
              <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Viewport */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Breadcrumb & Context Bar */}
          <div className="bg-[#FFFDF5] border-b border-[#C0C0C0] px-4 sm:px-8 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-[#493713]">
              <span className="font-bold">ResQNet</span>
              <span aria-hidden="true">/</span>
              <span>{activeMeta?.section}</span>
              <span aria-hidden="true">/</span>
              <span className="font-bold text-[#29251C]">{activeMeta?.label}</span>
            </div>
            <div className="flex items-center gap-3 text-[#493713]">
              {user.isDemo && (
                <span className="font-bold border border-[#C9A227] bg-[#FFF2C6] px-2 py-0.5 rounded">
                  Demonstration Account
                </span>
              )}
              <span>
                Role: <strong>{ROLE_LABELS[user.role]}</strong>
              </span>
            </div>
          </div>

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>

          <footer className="border-t border-[#C9A227] bg-[#F7E7A1] px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#493713]">
            <span className="inline-flex items-center gap-1.5 font-bold">
              <ShieldAlert className="h-3.5 w-3.5 text-[#8B1E1E]" />
              Emergency Prototype Disclaimer: Contact local official emergency services (911 / 112) immediately for urgent assistance.
            </span>
            <span>ResQNet · Intelligent Coordination. Faster Response. Stronger Communities.</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
