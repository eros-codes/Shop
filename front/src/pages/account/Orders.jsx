import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Package } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate, formatToman } from '../../lib/format';
import { EmptyState, Pagination } from '../../components/ui/Primitives';
import { ORDER_STATUS } from './orderStatus';
import { usePageTitle } from '../../lib/usePageTitle';

const PAGE_SIZE = 20;

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [orders, setOrders] = useState([]);
  // The list stopped at the fifty most recent, with nothing to say there
  // were more.
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  usePageTitle('سفارش‌های من');

  useEffect(() => {
    setLoading(true);
    api
      .get(`/orders?limit=${PAGE_SIZE}&page=${page}`, { auth: true })
      .then((data) => {
        setOrders(data?.items ?? []);
        setTotalPages(data?.totalPages ?? 1);
      })
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) {
    return <div className="skeleton" style={{ height: 240, borderRadius: 16 }} />;
  }

  if (orders.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<Package size={30} />}
          title="هنوز سفارشی ثبت نکرده‌اید"
          description="اولین خریدتان را از فروشگاه شروع کنید."
          action={
            <Link className="btn btn-primary" to="/products">
              رفتن به فروشگاه
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {orders.map((order) => {
        const status = ORDER_STATUS[order.status] ?? {
          label: order.status,
          tone: 'muted',
        };
        return (
          <Link key={order.id} to={`/account/orders/${order.id}`} className="order-card">
            <div className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div className="strong">
                  <bdi className="nowrap">{order.invoice_number ?? `سفارش #${order.id}`}</bdi>
                </div>
                <div className="tiny muted">
                  ثبت در {formatDate(order.createdAt ?? order.created_at)}
                </div>
              </div>

              <span className={`badge badge-${status.tone}`}>{status.label}</span>

              <div className="small muted">
                {order.total_quantity?.toLocaleString('fa-IR')} کالا
              </div>

              <div className="strong">{formatToman(order.total_price)}</div>
            </div>
          </Link>
        );
      })}
      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={(next) => {
          setParams(next > 1 ? { page: String(next) } : {});
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
}
