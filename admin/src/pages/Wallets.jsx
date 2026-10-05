import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { formatToman } from '../lib/format';
import {
  ConnectionError,
  EmptyState,
  TableSkeleton,
} from '../components/Primitives';

export default function Wallets() {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  // Tracked separately from the data so a dead connection is not rendered as
  // an empty table - the two look identical to the admin otherwise.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .get('/wallets?limit=100', { auth: true })
      .then((data) => setWallets(data?.items ?? data ?? []))
      .catch(() => {
        setWallets([]);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const total = wallets.reduce((sum, wallet) => sum + Number(wallet.amount ?? 0), 0);

  return (
    <>
      <div className="toolbar">
        <span className="small muted">
          {wallets.length.toLocaleString('fa-IR')} کیف پول — مجموع موجودی{' '}
          <b>{formatToman(total)}</b>
        </span>
      </div>

      <section className="card">
        {loading ? (
          <TableSkeleton cols={4} />
        ) : failed ? (
          <ConnectionError />
        ) : wallets.length === 0 ? (
          <EmptyState icon={<Wallet size={26} />} title="کیف پولی ساخته نشده است" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>کاربر</th>
                  <th>موبایل</th>
                  <th>موجودی</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((wallet) => (
                  <tr key={wallet.id}>
                    <td className="small strong">{wallet.user?.display_name ?? '—'}</td>
                    <td className="small">{wallet.user?.mobile ?? '—'}</td>
                    <td className="strong">{formatToman(wallet.amount)}</td>
                    <td>
                      <span
                        className={`badge badge-${wallet.is_active ? 'success' : 'muted'}`}
                      >
                        {wallet.is_active ? 'فعال' : 'غیرفعال'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
