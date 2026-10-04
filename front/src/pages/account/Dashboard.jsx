import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, RotateCcw, Wallet } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { formatToman } from '../../lib/format';
import { ORDER_STATUS } from './orderStatus';

export default function Dashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    api
      .get('/orders?limit=5', { auth: true })
      .then((data) => setOrders(data?.items ?? []))
      .catch(() => setOrders([]));

    if (user?.id) {
      api
        .get(`/wallets/user/${user.id}`, { auth: true })
        .then(setWallet)
        .catch(() => setWallet(null));
    }
  }, [user?.id]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid auto-grid">
        <div className="card card-pad">
          <div className="row" style={{ gap: 10 }}>
            <Package size={22} color="var(--brand-600)" />
            <div>
              <div className="tiny muted">سفارش‌های من</div>
              <div className="strong" style={{ fontSize: 18 }}>
                {orders.length.toLocaleString('fa-IR')}
              </div>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div className="row" style={{ gap: 10 }}>
            <Wallet size={22} color="var(--brand-600)" />
            <div>
              <div className="tiny muted">موجودی کیف پول</div>
              <div className="strong" style={{ fontSize: 18 }}>
                {wallet ? formatToman(wallet.amount) : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div className="row" style={{ gap: 10 }}>
            <RotateCcw size={22} color="var(--brand-600)" />
            <div>
              <div className="tiny muted">مرجوعی‌ها</div>
              <Link className="strong" style={{ fontSize: 14 }} to="/account/returns">
                مشاهده
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>آخرین سفارش‌ها</h2>
          <Link className="section-link" to="/account/orders">
            همه سفارش‌ها
          </Link>
        </div>

        {orders.length === 0 ? (
          <p className="small muted">هنوز سفارشی ثبت نکرده‌اید.</p>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {orders.map((order) => {
              const status = ORDER_STATUS[order.status] ?? {
                label: order.status,
                tone: 'muted',
              };
              return (
                <Link
                  key={order.id}
                  to={`/account/orders/${order.id}`}
                  className="order-card spread"
                >
                  <div>
                    <div className="strong small">
                      سفارش {order.invoice_number ?? `#${order.id}`}
                    </div>
                    <div className="tiny muted">
                      {order.total_quantity?.toLocaleString('fa-IR')} کالا
                    </div>
                  </div>
                  <span className={`badge badge-${status.tone}`}>{status.label}</span>
                  <span className="strong small">{formatToman(order.total_price)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
