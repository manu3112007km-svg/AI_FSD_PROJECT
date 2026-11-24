import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ClipboardCheck,
  Lock,
  Shield,
  Truck,
  UserCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types/resqnet';

const EMBLEM_SRC = '/src/assets/images/resqnet_emblem_1795092987885.jpg';
const HERO_SRC = '/src/assets/images/resqnet_command_hero_1795092989321.jpg';

const DEMO_ROLES: Array<{
  role: UserRole;
  title: string;
  account: string;
  scope: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    role: 'EMERGENCY_COORDINATOR',
    title: 'Emergency Coordinator',
    account: 'coordinator@resqnet.demo',
    scope: 'Verify reports, review AI priority, approve resources',
    icon: ClipboardCheck,
  },
  {
    role: 'CITIZEN',
    title: 'Citizen Reporter',
    account: 'citizen@resqnet.demo',
    scope: 'Submit emergencies, track status, view verified hospitals',
    icon: Users,
  },
  {
    role: 'EMERGENCY_RESPONDER',
    title: 'Emergency Responder',
    account: 'responder@resqnet.demo',
    scope: 'Accept dispatches, update live arrival & field status',
    icon: Truck,
  },
  {
    role: 'HOSPITAL_ADMIN',
    title: 'Hospital Administrator',
    account: 'hospital@resqnet.demo',
    scope: 'Update bed, ICU, and emergency department capacity',
    icon: Building2,
  },
  {
    role: 'SUPER_ADMIN',
    title: 'Super Administrator',
    account: 'admin@resqnet.demo',
    scope: 'Full governance, user roles, audit logs, demo reset',
    icon: Shield,
  },
];

export function AuthPortal() {
  const { login, register, demoLogin } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emblemError, setEmblemError] = useState(false);
  const [heroError, setHeroError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (fullName.trim().length < 2) {
          throw new Error('Please enter your full name.');
        }
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters.');
        }
        await register({ fullName, email, password, phone });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDemoAccess = async (role: UserRole) => {
    setError(null);
    setBusy(true);
    try {
      await demoLogin(role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in to demonstration account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF2C6] text-[#29251C] flex flex-col overflow-x-hidden">
      {/* Official Emergency Notice */}
      <div className="bg-[#F7E7A1] border-b border-[#C9A227] px-4 py-2.5 text-center text-sm text-[#493713]">
        <span className="inline-flex items-center gap-2 font-bold">
          <AlertTriangle className="h-4 w-4 text-[#8B1E1E] shrink-0" />
          <span>
            Official Emergency Services Notice: ResQNet is a coordination prototype. For immediate life-threatening emergencies, contact 911, 112, or your local official emergency service directly.
          </span>
        </span>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Brand & Demo Showcase */}
        <section className="lg:col-span-7 min-w-0 flex flex-col justify-between gap-6">
          <div className="gold-card-surface rounded-lg p-6 sm:p-8 flex flex-col gap-5">
            <div className="flex items-center gap-4">
              {!emblemError ? (
                <img
                  src={EMBLEM_SRC}
                  alt="ResQNet institutional gold and silver emblem"
                  referrerPolicy="no-referrer"
                  onError={() => setEmblemError(true)}
                  className="h-16 w-16 rounded-lg border border-[#C9A227] object-cover shrink-0"
                />
              ) : (
                <div className="h-16 w-16 rounded-lg border border-[#C9A227] bg-[#F7E7A1] flex items-center justify-center shrink-0">
                  <Shield className="h-8 w-8 text-[#493713]" />
                </div>
              )}
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#493713]">
                  ResQNet
                </h1>
                <p className="text-base text-[#493713]/85 font-semibold">
                  Intelligent Emergency Response &amp; Resource Management System
                </p>
              </div>
            </div>

            <p className="text-lg font-bold text-[#29251C] border-t border-[#C0C0C0] pt-4">
              Intelligent Coordination. Faster Response. Stronger Communities.
            </p>

            {!heroError ? (
              <div className="overflow-hidden rounded-lg border border-[#C9A227]">
                <img
                  src={HERO_SRC}
                  alt="Sunlit modern civic emergency coordination center"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroError(true)}
                  className="w-full h-52 sm:h-64 object-cover"
                />
              </div>
            ) : (
              <div className="h-52 rounded-lg border border-[#C9A227] bg-gradient-to-br from-[#F7E7A1] to-[#FFFDF5] flex items-center justify-center p-6 text-center">
                <p className="text-lg font-bold text-[#493713]">
                  Centralized Multi-Agency Dispatch, Hospital Capacity &amp; Geographic Intelligence
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 text-sm">
              <div className="bg-[#FFF2C6] border border-[#C9A227] rounded-md p-3">
                <p className="font-bold text-[#493713]">Human-Verified AI</p>
                <p className="text-xs text-[#29251C]/85 mt-1">
                  Advisory priority &amp; resource matching with mandatory coordinator approval.
                </p>
              </div>
              <div className="bg-[#FFF2C6] border border-[#C9A227] rounded-md p-3">
                <p className="font-bold text-[#493713]">Live Hospital Grid</p>
                <p className="text-xs text-[#29251C]/85 mt-1">
                  Real-time bed &amp; ICU capacity tracking with staleness warnings.
                </p>
              </div>
              <div className="bg-[#FFF2C6] border border-[#C9A227] rounded-md p-3">
                <p className="font-bold text-[#493713]">Role-Isolated Access</p>
                <p className="text-xs text-[#29251C]/85 mt-1">
                  Dedicated operational portals for all 5 emergency stakeholder roles.
                </p>
              </div>
            </div>
          </div>

          {/* Demonstration Mode Quick Access */}
          <div className="gold-card-surface rounded-lg p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-xl font-bold text-[#493713]">
                  Demonstration Mode Access
                </h2>
                <p className="text-xs text-[#493713]/80">
                  Labeled sample accounts for evaluating multi-user workflows (Password: ResQNet2026!)
                </p>
              </div>
              <span className="text-xs font-bold border border-[#C0C0C0] bg-[#F7E7A1] text-[#493713] px-2.5 py-1 rounded">
                SIMULATED DEMO ENVIRONMENT
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DEMO_ROLES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.role}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDemoAccess(item.role)}
                    className="text-left rounded-md border border-[#C9A227] bg-[#FFF2C6] hover:bg-[#F7E7A1] transition-colors p-3 flex items-start gap-3 focus-visible:outline-2 focus-visible:outline-[#493713] disabled:opacity-60 cursor-pointer"
                  >
                    <div className="p-2 rounded bg-[#FFFDF5] border border-[#C0C0C0] shrink-0">
                      <Icon className="h-4 w-4 text-[#493713]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#29251C] truncate">{item.title}</p>
                      <p className="text-xs text-[#493713] truncate">{item.account}</p>
                      <p className="text-xs text-[#29251C]/80 mt-0.5 leading-snug">{item.scope}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right Authentication Form */}
        <section className="lg:col-span-5 flex flex-col justify-center">
          <div className="gold-card-surface rounded-lg p-6 sm:p-8">
            <div className="flex items-center gap-2 border-b border-[#C0C0C0] pb-4 mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'login'
                    ? 'bg-[#D4AF37] text-[#29251C] border border-[#493713]'
                    : 'bg-[#FFF2C6] text-[#493713] border border-[#C9A227] hover:bg-[#F7E7A1]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'register'
                    ? 'bg-[#D4AF37] text-[#29251C] border border-[#493713]'
                    : 'bg-[#FFF2C6] text-[#493713] border border-[#C9A227] hover:bg-[#F7E7A1]'
                }`}
              >
                Citizen Registration
              </button>
            </div>

            <h2 className="text-2xl font-bold text-[#493713] mb-1">
              {mode === 'login' ? 'Authorized Portal Sign In' : 'Create Citizen Account'}
            </h2>
            <p className="text-sm text-[#493713]/80 mb-6">
              {mode === 'login'
                ? 'Enter your registered ResQNet credentials to access your role dashboard.'
                : 'Register to submit emergency reports, attach photos, and track incident updates.'}
            </p>

            {error && (
              <div
                role="alert"
                className="mb-4 rounded-md border border-[#B91C1C] bg-[#FDECEC] px-3.5 py-2.5 text-sm font-bold text-[#7F1D1D]"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div>
                    <label
                      htmlFor="auth-fullname"
                      className="block text-sm font-bold text-[#493713] mb-1"
                    >
                      Full Name
                    </label>
                    <input
                      id="auth-fullname"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g., Jordan Alvarez"
                      className="w-full rounded-md border border-[#C9A227] bg-[#FFFDF5] px-3 py-2 text-sm text-[#29251C] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="auth-phone"
                      className="block text-sm font-bold text-[#493713] mb-1"
                    >
                      Contact Phone (Optional)
                    </label>
                    <input
                      id="auth-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1-415-555-0199"
                      className="w-full rounded-md border border-[#C9A227] bg-[#FFFDF5] px-3 py-2 text-sm text-[#29251C] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                    />
                  </div>
                </>
              )}

              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-sm font-bold text-[#493713] mb-1"
                >
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@organization.org"
                  className="w-full rounded-md border border-[#C9A227] bg-[#FFFDF5] px-3 py-2 text-sm text-[#29251C] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-sm font-bold text-[#493713] mb-1"
                >
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={mode === 'register' ? 8 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter password'}
                  className="w-full rounded-md border border-[#C9A227] bg-[#FFFDF5] px-3 py-2 text-sm text-[#29251C] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 px-5 rounded-md bg-[#D4AF37] hover:bg-[#C9A227] text-[#29251C] font-bold text-base border border-[#493713] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {mode === 'login' ? (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>{busy ? 'Authenticating...' : 'Sign In to ResQNet'}</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="h-4 w-4" />
                    <span>{busy ? 'Creating Account...' : 'Register Citizen Account'}</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-[#C0C0C0] text-xs text-[#493713]/85 space-y-1">
              <p className="font-bold">Security &amp; Privacy Standards</p>
              <p>
                Passwords use salted scrypt hashing and authenticated JWT sessions. Citizen contact details are isolated from unauthorized users.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
