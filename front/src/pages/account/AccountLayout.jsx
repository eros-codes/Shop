import { NavLink, Navigate, Outlet } from 'react-router-dom';
import {
  Heart,
  KeyRound,
  LogOut,
  MapPin,
  Package,
  RotateCcw,
  User,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Breadcrumb } from '../../components/ui/Primitives';

const LINKS = [
  { to: '/account', label: 'پیشخوان', icon: User, end: true },
  { to: '/account/orders', label: 'سفارش‌های من', icon: Package },
  { to: '/account/returns', label: 'مرجوعی‌ها', icon: RotateCcw },
  { to: '/account/addresses', label: 'آدرس‌ها', icon: MapPin },
  { to: '/account/wallet', label: 'کیف پول', icon: Wallet },
  { to: '/account/favorites', label: 'علاقه‌مندی‌ها', icon: Heart },
  { to: '/account/password', label: 'تغییر رمز عبور', icon: KeyRound },
];

export default function AccountLayout() {
  const { isAuthenticated, ready, user, logout } = useAuth();

  if (!ready) {
    return (
      <div className="container page">
        <div className="skeleton" style={{ height: 320, borderRadius: 16 }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login?next=/account" replace />;
  }

  return (
    <div className="container page">
      <Breadcrumb items={[{ label: 'حساب کاربری' }]} />

      <div className="account">
        <aside className="card account-nav">
          <div
            className="row"
            style={{ gap: 10, padding: '10px 12px 14px', borderBottom: '1px solid var(--line)' }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'var(--brand-50)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--brand-700)',
              }}
            >
              <User size={20} />
            </span>
            <div>
              <div className="strong small">{user?.display_name ?? 'کاربر تل‌کال'}</div>
              <div className="tiny muted">{user?.mobile}</div>
            </div>
          </div>

          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `account-link${isActive ? ' is-active' : ''}`
              }
            >
              <link.icon size={17} />
              {link.label}
            </NavLink>
          ))}

          <button
            className="account-link"
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--danger-600)',
            }}
            onClick={logout}
          >
            <LogOut size={17} />
            خروج از حساب
          </button>
        </aside>

        <div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
