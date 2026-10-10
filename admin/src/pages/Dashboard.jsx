import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Package,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatToman } from '../lib/format';
import { EmptyState } from '../components/Primitives';
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

  useEffect(() => {
    api.get('/reports/summary', { auth: true }).then(setSummary).catch(() => {});
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
      .then((data) => setReturns(data?.items ?? []))
      .catch(() => {});
  }, []);

  const periods = (sales?.periods ?? []).slice(-14);
  const peak = Math.max(1, ...periods.map((period) => period.net));
  const byStatus = summary?.ordersByStatus ?? {};

  return (
    <div className="stack" style={{ gap: 16 }}>
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
              <div className="chart">
                {periods.map((period) => (
                  <div className="chart-col" key={period.period}>
                    <div
                      className="chart-bar"
                      style={{ height: `${Math.max(4, (period.net / peak) * 100)}%` }}
                      data-value={formatToman(period.net)}
                    />
                    <span className="chart-label">{period.period.slice(5)}</span>
                  </div>
                ))}
              </div>
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
                <div className="spread" key={item.variantId}>
                  <span className="small" style={{ maxWidth: '62%' }}>
                    {item.productTitle}
                    <span className="muted"> — {item.variantTitle}</span>
                  </span>
                  <span
                    className={`badge badge-${item.stock === 0 ? 'danger' : 'warning'}`}
                  >
                    {item.stock.toLocaleString('fa-IR')} عدد
                  </span>
                </div>
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
