import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, ShoppingBag } from 'lucide-react';
import { api, buildQuery } from '../lib/api';
import { formatDateTime, formatToman } from '../lib/format';
import {
  ConnectionError,
  EmptyState,
  Pagination,
  SearchBox,
  TableSkeleton,
} from '../components/Primitives';
import { ORDER_STATUS, PAYMENT_METHODS } from '../lib/status';
import OrderDrawer from './OrderDrawer';

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  // A failed request is not "no orders".
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [openId, setOpenId] = useState(null);

  const status = params.get('status') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const query = params.get('search') ?? '';

  // Searched on the server, across every page: it used to filter only the
  // twenty orders on screen, so an order on page three was "not found".
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim() !== query) update({ search: search.trim(), page: '' });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    api
      .get(
        `/orders${buildQuery({ status: status || undefined, search: query || undefined, page, limit: 20 })}`,
        { auth: true },
      )
      .then((data) =>
        setResult({
          items: data?.items ?? [],
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 1,
        }),
      )
      .catch(() => {
        setResult({ items: [], total: 0, totalPages: 1 });
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [status, query, page]);

  useEffect(load, [load]);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    });
    setParams(next);
  };

  const rows = result.items;

  return (
    <>
      <div className="toolbar">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="شماره سفارش، فاکتور یا موبایل…"
        />

        <select
          className="select"
          style={{ width: 190 }}
          value={status}
          onChange={(event) => update({ status: event.target.value, page: '' })}
        >
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(ORDER_STATUS).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>

        <span className="small muted" style={{ marginInlineStart: 'auto' }}>
          {result.total.toLocaleString('fa-IR')} سفارش
        </span>
      </div>

      <section className="card">
        {loading ? (
          <TableSkeleton cols={6} />
        ) : failed ? (
          <ConnectionError onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<ShoppingBag size={26} />} title="سفارشی پیدا نشد" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>سفارش</th>
                  <th>مشتری</th>
                  <th>وضعیت</th>
                  <th>پرداخت</th>
                  <th>مبلغ</th>
                  <th>تاریخ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((order) => {
                  const meta = ORDER_STATUS[order.status] ?? {
                    label: order.status,
                    tone: 'muted',
                  };
                  return (
                    <tr key={order.id}>
                      <td>
                        <div className="strong">
                          <bdi className="nowrap">{order.invoice_number ?? `#${order.id}`}</bdi>
                        </div>
                        <div className="tiny muted">
                          {order.total_quantity?.toLocaleString('fa-IR')} کالا
                        </div>
                      </td>
                      <td>
                        <div className="small">{order.user?.display_name ?? '—'}</div>
                        <div className="tiny muted">{order.user?.mobile}</div>
                      </td>
                      <td>
                        <span className={`badge badge-${meta.tone}`}>{meta.label}</span>
                      </td>
                      <td className="small">
                        {PAYMENT_METHODS[order.payment_method] ?? '—'}
                      </td>
                      <td className="strong">{formatToman(order.total_price)}</td>
                      <td className="tiny muted">
                        {formatDateTime(order.createdAt ?? order.created_at)}
                      </td>
                      <td>
                        <div className="cell-actions">
                          <button
                            className="icon-btn"
                            onClick={() => setOpenId(order.id)}
                            title="جزئیات"
                          >
                            <Eye size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={result.totalPages}
          onChange={(next) => update({ page: next })}
        />
      </section>

      {openId ? (
        <OrderDrawer
          orderId={openId}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      ) : null}
    </>
  );
}
