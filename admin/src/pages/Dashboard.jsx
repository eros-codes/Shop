import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardCheck,
  Headphones,
  MessageSquare,
  Package,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Wallet,
  WifiOff,
} from 'lucide-react';
import { api, toPage } from '../lib/api';
import { formatToman } from '../lib/format';
import { EmptyState } from '../components/Primitives';
import SalesChart from '../components/SalesChart';
import { ORDER_STATUS } from '../lib/status';

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="stat">
      <span
        className="stat-icon"
        style={
          tone
            ? { background: `var(--${tone}-50)`, color: `var(--${tone}-600)` }
            : undefined
        }
      >
        <Icon size={20} />
      </span>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [sales, setSales] = useState(null);
  const [top, setTop] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [returns, setReturns] = useState([]);
  const [returnsWaiting, setReturnsWaiting] = useState(0);
  const [openTickets, setOpenTickets] = useState(0);
  const [pendingReviews, setPendingReviews] = useState(0);
  // The figures failed to load. The cards used to show zeros instead -
  // "no sales today" - with nothing to say the panel could not ask.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .get('/reports/summary', { auth: true })
      .then(setSummary)
      .catch(() => setFailed(true));
    api
      .get('/tickets?status=open&limit=1', { auth: true })
      .then((data) => setOpenTickets(data?.total ?? 0))
      .catch(() => {});
    api
      .get('/comments?status=pending&limit=1', { auth: true })
      .then((data) => setPendingReviews(toPage(data, 1).total))
      .catch(() => {});
    api
      .get('/reports/sales?granularity=day', { auth: true })
      .then(setSales)
      .catch(() => {});
    api
      .get('/reports/top-products?limit=5', { auth: true })
      .then((data) => setTop(data?.items ?? []))
      .catch(() => {});
    api
      .get('/reports/low-stock?threshold=5&limit=8', { auth: true })
      .then((data) => setLowStock(data?.items ?? []))
      .catch(() => {});
    api
      .get('/returns?status=requested&limit=5', { auth: true })
      .then((data) => {
        setReturns(data?.items ?? []);
        setReturnsWaiting(data?.total ?? 0);
      })
      .catch(() => {});
  }, []);

  const periods = (sales?.periods ?? []).slice(-14);
  const byStatus = summary?.ordersByStatus ?? {};

  // The day's work, each with a link straight to it: cash-on-delivery
  // orders to confirm, paid orders to prepare, customers waiting on an
  // answer, reviews to approve, returns to look at.
  const todo = [
    {
      icon: ClipboardCheck,
      label: 'سفارش در انتظار تأیید',
      count: byStatus.pending ?? 0,
      to: '/orders?status=pending',
    },
    {
      icon: ShoppingBag,
      label: 'سفارش پرداخت‌شده برای آماده‌سازی',
      count: byStatus.paid ?? 0,
      to: '/orders?status=paid',
    },
    { icon: Headphones, label: 'تیکت در انتظار پاسخ', count: openTickets, to: '/tickets?status=open' },
    { icon: MessageSquare, label: 'نظر در انتظار تأیید', count: pendingReviews, to: '/comments' },
    { icon: RotateCcw, label: 'درخواست مرجوعی', count: returnsWaiting, to: '/returns' },
  ].filter((item) => item.count > 0);

  return (
    <div className="stack" style={{ gap: 16 }}>
      {failed ? (
        <div className="card card-pad row small" style={{ gap: 8, color: 'var(--danger-600)' }}>
          <WifiOff size={16} />
          آمار فروش بارگذاری نشد؛ عددهای زیر واقعی نیستند. صفحه را دوباره باز کنید.
        </div>
      ) : null}

      {todo.length > 0 ? (
        <section className="card card-pad">
          <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>
            نیاز به اقدام
          </div>
          <div className="todo-grid">
            {todo.map((item) => (
              <Link key={item.to} to={item.to} className="todo-item">
                <item.icon size={18} />
                <span className="todo-count">{item.count.toLocaleString('fa-IR')}</span>
                <span className="small">{item.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid cols-4">
        <Stat
          icon={TrendingUp}
          label="فروش خالص امروز"
          value={formatToman(summary?.today?.net ?? 0)}
        />
        <Stat
          icon={ShoppingBag}
          label="سفارش‌های امروز"
          value={(summary?.today?.orders ?? 0).toLocaleString('fa-IR')}
        />
        <Stat
          icon={Wallet}
          label="فروش خالص این ماه"
          value={formatToman(summary?.thisMonth?.net ?? 0)}
          tone="success"
        />
        <Stat
          icon={Package}
          label="میانگین ارزش سفارش (ماه)"
          value={formatToman(summary?.thisMonth?.averageOrderValue ?? 0)}
        />
      </div>

      <div className="grid cols-wide-narrow">
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">فروش ۱۴ روز اخیر</h2>
            <Link className="small" style={{ color: 'var(--brand-600)' }} to="/reports">
              گزارش کامل
            </Link>
          </div>
          <div className="card-pad">
            {periods.length === 0 ? (
              <EmptyState title="هنوز فروشی ثبت نشده" />
            ) : (
              <SalesChart periods={periods} granularity={sales?.granularity} />
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">سفارش‌ها بر اساس وضعیت</h2>
          </div>
          <div className="card-pad stack" style={{ gap: 8 }}>
            {Object.keys(byStatus).length === 0 ? (
              <p className="small muted">سفارشی ثبت نشده است.</p>
            ) : (
              Object.entries(byStatus).map(([status, count]) => {
                const meta = ORDER_STATUS[status] ?? { label: status, tone: 'muted' };
                return (
                  <Link
                    key={status}
                    to={`/orders?status=${status}`}
                    className="spread"
                    style={{ padding: '6px 0' }}
                  >
                    <span className={`badge badge-${meta.tone}`}>{meta.label}</span>
                    <span className="strong">{count.toLocaleString('fa-IR')}</span>
                  </Link>
                );
              })
            )}
          </div>
        </section>
      </div>

      <div className="grid cols-3">
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">پرفروش‌ترین کالاها</h2>
          </div>
          <div className="card-pad stack" style={{ gap: 10 }}>
            {top.length === 0 ? (
              <p className="small muted">هنوز فروشی ثبت نشده است.</p>
            ) : (
              top.map((item) => (
                <div className="spread" key={item.productId}>
                  <span className="small" style={{ maxWidth: '60%' }}>
                    {item.title}
                  </span>
                  <span className="tiny muted">
                    {item.quantity.toLocaleString('fa-IR')} عدد
                  </span>
                  <span className="small strong">{formatToman(item.revenue)}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">
              <span className="row" style={{ gap: 7 }}>
                <AlertTriangle size={16} color="var(--warning-600)" />
                رو به اتمام
              </span>
            </h2>
          </div>
          <div className="card-pad stack" style={{ gap: 10 }}>
            {lowStock.length === 0 ? (
              <p className="small muted">همه‌چیز موجود است.</p>
            ) : (
              lowStock.map((item) => (
                <Link
                  className="spread"
                  key={item.variantId}
                  to={`/products?edit=${item.productId}`}
                  title="ویرایش موجودی"
                >
                  <span className="small" style={{ maxWidth: '62%' }}>
                    {item.productTitle}
                    <span className="muted"> — {item.variantTitle}</span>
                  </span>
                  <span
                    className={`badge badge-${item.stock === 0 ? 'danger' : 'warning'}`}
                  >
                    {item.stock.toLocaleString('fa-IR')} عدد
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">
              <span className="row" style={{ gap: 7 }}>
                <RotateCcw size={16} color="var(--brand-600)" />
                مرجوعی‌های در انتظار
              </span>
            </h2>
            <Link className="small" style={{ color: 'var(--brand-600)' }} to="/returns">
              <ArrowLeft size={14} />
            </Link>
          </div>
          <div className="card-pad stack" style={{ gap: 10 }}>
            {returns.length === 0 ? (
              <p className="small muted">درخواست بازمانده‌ای نیست.</p>
            ) : (
              returns.map((request) => (
                <Link className="spread" key={request.id} to="/returns">
                  <span className="small">
                    <bdi className="nowrap">
                      {request.order?.invoice_number ?? `سفارش #${request.order?.id}`}
                    </bdi>
                  </span>
                  <span className="tiny muted">{request.user?.display_name}</span>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
