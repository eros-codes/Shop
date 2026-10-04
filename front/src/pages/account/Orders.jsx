import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate, formatToman } from '../../lib/format';
import { EmptyState } from '../../components/ui/Primitives';
import { ORDER_STATUS } from './orderStatus';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/orders?limit=50', { auth: true })
      .then((data) => setOrders(data?.items ?? []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

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
                  {order.invoice_number ?? `سفارش #${order.id}`}
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
    </div>
  );
}
