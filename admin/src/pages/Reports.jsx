import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, TrendingUp } from 'lucide-react';
import { api, buildQuery } from '../lib/api';
import { formatToman } from '../lib/format';
import {
  Button,
  ConnectionError,
  EmptyState,
  Field,
} from '../components/Primitives';
import SalesChart from '../components/SalesChart';

// The calendar day on this device. toISOString() gives the UTC one, which
// is still "yesterday" until 03:30 in Tehran.
const localDay = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = () => localDay(new Date());
const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDay(date);
};

export default function Reports() {
  const [range, setRange] = useState({ from: daysAgo(29), to: today() });
  const [granularity, setGranularity] = useState('day');
  const [sales, setSales] = useState(null);
  const [top, setTop] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [threshold, setThreshold] = useState(5);
  const [loading, setLoading] = useState(true);
  // Promise.allSettled swallowed rejections entirely, so an unreachable API
  // drew an empty report that looked like a quiet trading period.
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    // Bare dates: the API reads each as a whole day on the shop's (Tehran)
    // clock, wherever this browser happens to be.
    const query = buildQuery({ from: range.from, to: range.to, granularity });
    Promise.allSettled([
      api.get(`/reports/sales${query}`, { auth: true }),
      api.get(`/reports/top-products${query}&limit=10`, { auth: true }),
    ])
      .then(([salesResult, topResult]) => {
        if (salesResult.status === 'fulfilled') setSales(salesResult.value);
        if (topResult.status === 'fulfilled') setTop(topResult.value?.items ?? []);
        setFailed(salesResult.status === 'rejected');
      })
      .finally(() => setLoading(false));
  }, [range, granularity]);

  useEffect(load, [load]);

  useEffect(() => {
    api
      .get(`/reports/low-stock?threshold=${threshold}&limit=50`, { auth: true })
      .then((data) => setLowStock(data?.items ?? []))
      .catch(() => setLowStock([]));
  }, [threshold]);

  const periods = sales?.periods ?? [];
  const totals = sales?.totals;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card card-pad">
        <div className="row wrap" style={{ gap: 12 }}>
          <Field label="از تاریخ">
            <input
              className="input"
              type="date"
              value={range.from}
              onChange={(event) =>
                setRange((current) => ({ ...current, from: event.target.value }))
              }
            />
          </Field>
          <Field label="تا تاریخ">
            <input
              className="input"
              type="date"
              value={range.to}
              onChange={(event) =>
                setRange((current) => ({ ...current, to: event.target.value }))
              }
            />
          </Field>
          <Field label="گروه‌بندی">
            <select
              className="select"
              value={granularity}
              onChange={(event) => setGranularity(event.target.value)}
            >
              <option value="day">روزانه</option>
              <option value="month">ماهانه</option>
            </select>
          </Field>
          <div className="row" style={{ gap: 6, alignSelf: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setRange({ from: daysAgo(6), to: today() })}>
              ۷ روز
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRange({ from: daysAgo(29), to: today() })}>
              ۳۰ روز
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRange({ from: daysAgo(89), to: today() })}>
              ۹۰ روز
            </Button>
          </div>
        </div>
      </section>

      <div className="grid cols-4">
        {[
          ['فروش ناخالص', totals?.gross],
          ['بازگشت وجه', totals?.refunded],
          ['فروش خالص', totals?.net],
          ['میانگین ارزش سفارش', totals?.averageOrderValue],
        ].map(([label, value]) => (
          <div className="stat" key={label}>
            <span className="stat-icon">
              <TrendingUp size={19} />
            </span>
            <div>
              <div className="stat-value">{formatToman(value ?? 0)}</div>
              <div className="stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">
            <span className="row" style={{ gap: 8 }}>
              <BarChart3 size={17} color="var(--brand-600)" />
              روند فروش خالص
            </span>
          </h2>
          <span className="tiny muted">
            {totals?.orders?.toLocaleString('fa-IR') ?? 0} سفارش در این بازه
          </span>
        </div>
        <div className="card-pad">
          {loading ? (
            <div className="skeleton" style={{ height: 180 }} />
          ) : failed ? (
            <ConnectionError onRetry={load} />
          ) : periods.length === 0 ? (
            <EmptyState title="در این بازه فروشی ثبت نشده" />
          ) : (
            <SalesChart periods={periods.slice(-30)} granularity={sales?.granularity} />
          )}
        </div>
      </section>

      <div className="grid cols-2">
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">پرفروش‌ترین کالاها</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>کالا</th>
                  <th>تعداد</th>
                  <th>درآمد</th>
                </tr>
              </thead>
              <tbody>
                {top.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="small muted">
                      داده‌ای نیست.
                    </td>
                  </tr>
                ) : (
                  top.map((item) => (
                    <tr key={item.productId}>
                      <td className="small">{item.title}</td>
                      <td className="small">
                        {item.quantity.toLocaleString('fa-IR')}
                      </td>
                      <td className="small strong">{formatToman(item.revenue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">
              <span className="row" style={{ gap: 8 }}>
                <AlertTriangle size={17} color="var(--warning-600)" />
                موجودی رو به اتمام
              </span>
            </h2>
            <select
              className="select"
              style={{ width: 120 }}
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
            >
              {[0, 3, 5, 10, 20].map((value) => (
                <option key={value} value={value}>
                  ≤ {value.toLocaleString('fa-IR')}
                </option>
              ))}
            </select>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>کالا</th>
                  <th>گزینه</th>
                  <th>SKU</th>
                  <th>موجودی</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="small muted">
                      موردی نیست.
                    </td>
                  </tr>
                ) : (
                  lowStock.map((item) => (
                    <tr key={item.variantId}>
                      <td className="small">{item.productTitle}</td>
                      <td className="small muted">{item.variantTitle}</td>
                      <td className="tiny muted">{item.sku}</td>
                      <td>
                        <span
                          className={`badge badge-${item.stock === 0 ? 'danger' : 'warning'}`}
                        >
                          {item.stock.toLocaleString('fa-IR')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
