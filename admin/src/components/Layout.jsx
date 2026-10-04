import { useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  ClipboardList,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Percent,
  RotateCcw,
  ScrollText,
  ShoppingBag,
  Sliders,
  Tags,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = [
  {
    group: 'فروش',
    items: [
      { to: '/', label: 'پیشخوان', icon: LayoutDashboard, end: true },
      { to: '/orders', label: 'سفارش‌ها', icon: ShoppingBag },
      { to: '/returns', label: 'مرجوعی‌ها', icon: RotateCcw },
      { to: '/reports', label: 'گزارش‌ها', icon: BarChart3 },
    ],
  },
  {
    group: 'کاتالوگ',
    items: [
      { to: '/products', label: 'کالاها', icon: Package },
      { to: '/categories', label: 'دسته‌بندی‌ها', icon: FolderTree },
      { to: '/brands', label: 'برندها', icon: Tags },
      { to: '/attributes', label: 'ویژگی‌ها', icon: Sliders },
      { to: '/comments', label: 'نظرات', icon: MessageSquare },
    ],
  },
  {
    group: 'فروشگاه',
    items: [
      { to: '/discounts', label: 'کدهای تخفیف', icon: Percent },
      { to: '/shipping', label: 'ارسال', icon: Truck },
      { to: '/users', label: 'کاربران', icon: Users },
      { to: '/wallets', label: 'کیف پول‌ها', icon: Wallet },
      { to: '/audit', label: 'گزارش فعالیت', icon: ScrollText },
    ],
  },
];

const TITLES = {
  '/': 'پیشخوان',
  '/orders': 'سفارش‌ها',
  '/returns': 'مرجوعی‌ها',
  '/reports': 'گزارش‌ها',
  '/products': 'کالاها',
  '/categories': 'دسته‌بندی‌ها',
  '/brands': 'برندها',
  '/attributes': 'ویژگی‌ها',
  '/comments': 'نظرات',
  '/discounts': 'کدهای تخفیف',
  '/shipping': 'ارسال',
  '/users': 'کاربران',
  '/wallets': 'کیف پول‌ها',
  '/audit': 'گزارش فعالیت',
};

export default function Layout() {
  const { isAuthenticated, ready, user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  if (!ready) {
    return (
      <div style={{ padding: 40 }}>
        <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const title =
    TITLES[location.pathname] ??
    Object.entries(TITLES).find(
      ([path]) => path !== '/' && location.pathname.startsWith(path),
    )?.[1] ??
    'پنل مدیریت';

  return (
    <div className="shell">
      <aside className={`rail${open ? ' is-open' : ''}`}>
        <div className="rail-logo">
          <b>tellcall</b>
          <span>پنل مدیریت فروشگاه</span>
        </div>

        {NAV.map((section) => (
          <div key={section.group}>
            <div className="rail-group">{section.group}</div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `rail-link${isActive ? ' is-active' : ''}`
                }
              >
                <item.icon size={17} />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}

        <button
          className="rail-link"
          style={{ marginTop: 'auto', border: 'none', background: 'none', cursor: 'pointer' }}
          onClick={logout}
        >
          <LogOut size={17} />
          خروج
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            className="icon-btn rail-toggle"
            onClick={() => setOpen((value) => !value)}
            aria-label="منو"
          >
            <Menu size={18} />
          </button>
          <h1>{title}</h1>
          <div className="who">
            <Boxes size={16} />
            <span>{user?.display_name ?? user?.mobile}</span>
            <span className="badge">مدیر</span>
          </div>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
