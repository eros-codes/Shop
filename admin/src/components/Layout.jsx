import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  ClipboardList,
  FolderTree,
  Headphones,
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
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { TICKETS_CHANGED } from '../lib/tickets';

const NAV = [
  {
    group: 'فروش',
    items: [
      { to: '/', label: 'پیشخوان', icon: LayoutDashboard, end: true },
      { to: '/orders', label: 'سفارش‌ها', icon: ShoppingBag },
      { to: '/returns', label: 'مرجوعی‌ها', icon: RotateCcw },
      { to: '/tickets', label: 'تیکت‌ها', icon: Headphones },
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
  '/tickets': 'تیکت‌های پشتیبانی',
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
  const [openTickets, setOpenTickets] = useState(0);

  // How many customers are waiting on an answer, next to the menu entry.
  // Re-read on every navigation and whenever a ticket changes status here.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const refresh = () =>
      api
        .get('/tickets?status=open&limit=1', { auth: true })
        .then((data) => setOpenTickets(data?.total ?? 0))
        .catch(() => {});
    refresh();
    window.addEventListener(TICKETS_CHANGED, refresh);
    return () => window.removeEventListener(TICKETS_CHANGED, refresh);
  }, [isAuthenticated, location.pathname]);

  const counts = { '/tickets': openTickets };

  // The phone menu: Escape closes it, and the page under it stays put
  // while it is open.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  // On a phone every table.data is drawn as a stack of cards, one per row,
  // and each cell needs its column's name beside it. Copying the heading
  // onto the cell here covers every table in the panel - modals included,
  // they render inside .content - without each page having to remember to.
  const contentRef = useRef(null);
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return undefined;
    let frame = 0;
    const label = () => {
      frame = 0;
      root.querySelectorAll('table.data').forEach((table) => {
        const heads = [...table.querySelectorAll('thead th')].map((th) =>
          th.textContent.trim(),
        );
        if (heads.length === 0) return;
        table.querySelectorAll('tbody tr').forEach((row) => {
          [...row.children].forEach((cell, index) => {
            const text = heads[index] ?? '';
            if (cell.dataset.label !== text) cell.dataset.label = text;
          });
        });
      });
    };
    // Only childList is watched, so writing data-label never re-triggers it.
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(label);
    });
    observer.observe(root, { childList: true, subtree: true });
    label();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ready, isAuthenticated]);

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
      {open ? <div className="rail-backdrop" onClick={() => setOpen(false)} /> : null}
      <aside className={`rail${open ? ' is-open' : ''}`}>
        <div className="rail-logo">
          <b>tellcall</b>
          <span>پنل مدیریت فروشگاه</span>
          {/* The toggle in the top bar is underneath the open menu on a
              phone, so the menu carries its own way out. */}
          <button
            className="icon-btn rail-close"
            onClick={() => setOpen(false)}
            aria-label="بستن منو"
          >
            <X size={17} />
          </button>
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
                {counts[item.to] > 0 ? (
                  <span className="badge badge-warning">
                    {counts[item.to].toLocaleString('fa-IR')}
                  </span>
                ) : null}
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

        <div className="content" ref={contentRef}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
