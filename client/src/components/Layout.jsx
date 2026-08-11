import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from '../AuthContext.jsx';

const ROLE_LABELS = {
  admin: 'Admin',
  unit_head: 'Unit Head',
  dept_head: 'Department Head',
  purchase_head: 'Purchase Head',
};

function Icon({ d, className = 'w-[18px] h-[18px]' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
const ICONS = {
  overview: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  units: ['M3 21h18', 'M4 21V8l8-5 8 5v13', 'M9 21v-6h6v6'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  master: ['M4 6h16', 'M4 12h16', 'M4 18h10'],
  import: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  history: ['M12 8v4l3 3', 'M3.05 11a9 9 0 1 1 .5 4'],
  docket: ['M9 2h6v4H9z', 'M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2', 'M9 12h6', 'M9 16h6'],
  verify: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M9 15l2 2 4-4'],
  inbox: ['M22 12h-6l-2 3h-4l-2-3H2', 'M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  lock: ['M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  chart: ['M3 3v18h18', 'M8 17v-6', 'M13 17V7', 'M18 17v-9'],
  report: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 17v-3', 'M12 17v-5', 'M16 17v-2'],
};

function navFor(user) {
  if (user?.role === 'admin')
    return [
      ['Overview', '/admin', 'overview', true],
      ['Analytics', '/analytics', 'chart'],
      ['Reports', '/reports', 'report'],
      ['Units', '/admin/units', 'units'],
      ['Users', '/admin/users', 'users'],
      ['Master data', '/admin/master', 'master'],
      ['Min-max archive', '/admin/import', 'import'],
      ['History', '/history', 'history'],
    ];
  if (user?.role === 'unit_head')
    return [
      ['Dashboard', '/unit', 'overview', true],
      ['UPR review', '/unit/upr', 'verify'],
      ['Analytics', '/analytics', 'chart'],
      ['Reports', '/reports', 'report'],
      ['History', '/history', 'history'],
    ];
  if (user?.role === 'dept_head')
    return [
      ['Dashboard', '/dept', 'docket', true],
      ['History', '/history', 'history'],
    ];
  if (user?.role === 'purchase_head')
    return [
      ['Incoming UPRs', '/purchase', 'inbox', true],
      ['Analytics', '/analytics', 'chart'],
    ];
  return [];
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid place-items-center w-8 h-8 rounded-lg bg-brand text-white font-bold text-[13px] leading-none shrink-0">
        CP
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-ink">CPH Requisitions</span>
        <span className="block text-[11px] text-ink-faint">Centre Point Hospitality</span>
      </span>
    </div>
  );
}

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export default function Layout({ title, subtitle, children, actions }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const nav = navFor(user);

  function doLogout() {
    logout();
    navigate('/login');
  }

  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] transition-colors ${
      isActive
        ? 'bg-brand-soft text-brand-deep font-medium'
        : 'text-ink-soft hover:text-ink hover:bg-line-soft'
    }`;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[264px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col bg-surface border-r border-line px-3 py-5 sticky top-0 h-screen">
        <Link to={homeFor(user)} className="px-2 mb-6 block">
          <Brand />
        </Link>
        <nav className="flex flex-col gap-0.5">
          {nav.map(([label, to, icon, end]) => (
            <NavLink key={to} to={to} end={!!end} className={linkCls}>
              <Icon d={ICONS[icon]} className="w-4.75 h-4.75 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        {user && (
          <div className="mt-auto pt-3 border-t border-line-soft">
            <div className="px-1 flex items-center gap-2.5">
              <span className="grid place-items-center w-8 h-8 rounded-full bg-brand-soft text-brand-deep text-[11px] font-semibold shrink-0">
                {initials(user.name)}
              </span>
              <div className="leading-tight min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate">{user.name}</div>
                <div className="text-[11px] text-ink-faint truncate">
                  {ROLE_LABELS[user.role]}
                  {user.unit?.name ? ` · ${user.unit.name}` : ''}
                </div>
              </div>
              <Link to="/change-password" title="Change password" className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-line-soft shrink-0">
                <Icon d={ICONS.lock} className="w-4 h-4" />
              </Link>
              <button onClick={doLogout} title="Log out" className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-line-soft shrink-0">
                <Icon d={ICONS.logout} className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Top bar (mobile) */}
      <header className="md:hidden bg-surface border-b border-line px-4 pt-3 pb-2 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <Link to={homeFor(user)}><Brand /></Link>
          {user && (
            <div className="flex items-center">
              <Link to="/change-password" title="Change password" className="p-2 rounded-lg text-ink-faint hover:text-ink hover:bg-line-soft">
                <Icon d={ICONS.lock} />
              </Link>
              <button onClick={doLogout} title="Log out" className="p-2 rounded-lg text-ink-faint hover:text-ink hover:bg-line-soft">
                <Icon d={ICONS.logout} />
              </button>
            </div>
          )}
        </div>
        <nav className="flex gap-1 mt-2 -mx-1 overflow-x-auto pb-1">
          {nav.map(([label, to, , end]) => (
            <NavLink key={to} to={to} end={!!end} className={linkCls}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="min-w-0">
        <main className="px-4 md:px-10 py-7 max-w-7xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-7">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {subtitle && <p className="text-[15px] text-ink-soft mt-1">{subtitle}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          </div>
          <div className="rise">{children}</div>
        </main>
      </div>
    </div>
  );
}

const STAMP = {
  pending: 'stamp-neutral',
  draft: 'stamp-warn',
  submitted: 'stamp-info',
  verified: 'stamp-violet',
  sent: 'stamp-ok',
};

export function StatusBadge({ status, lg }) {
  return <span className={`stamp ${STAMP[status] || 'stamp-neutral'} ${lg ? 'stamp-lg' : ''}`}>{status}</span>;
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <div className="mb-4 rounded-lg border border-danger/25 bg-danger-soft text-danger px-3.5 py-2.5 text-sm">
      {error}
    </div>
  );
}

export function Note({ tone = 'info', children }) {
  const tones = {
    info: 'border-info/25 bg-info-soft text-info',
    ok: 'border-ok/25 bg-ok-soft text-ok',
    warn: 'border-accent/30 bg-accent-soft text-accent-deep',
  };
  return <div className={`mb-4 rounded-lg border px-3.5 py-2.5 text-sm ${tones[tone]}`}>{children}</div>;
}

export function EmptyState({ title, hint, children }) {
  return (
    <div className="card border-dashed shadow-none px-6 py-12 text-center">
      <div className="text-base font-medium text-ink-soft">{title}</div>
      {hint && <p className="text-sm text-ink-faint mt-1 max-w-md mx-auto">{hint}</p>}
      {children && <div className="mt-4 flex justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-[13px] text-ink-faint">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[13px] text-ink-soft">{sub}</div>}
    </div>
  );
}

export function btn(variant = 'primary') {
  const base =
    'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed';
  const variants = {
    green: 'bg-brand text-white hover:bg-brand-deep shadow-sm',
    primary: 'bg-brand-soft text-brand-deep hover:bg-brand/15',
    subtle: 'bg-surface border border-line text-ink shadow-sm hover:bg-paper',
    danger: 'bg-danger text-white hover:bg-danger/85',
  };
  return `${base} ${variants[variant] || variants.primary}`;
}

export const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint shadow-sm transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15';
