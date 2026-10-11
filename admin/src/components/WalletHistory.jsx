import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDateTime, formatToman } from '../lib/format';
import { Pagination } from './Primitives';

const LABELS = {
  zarinpal_charge: 'شارژ از درگاه',
  admin_charge: 'شارژ دستی پشتیبانی',
  withdrawal: 'برداشت',
  order_payment: 'پرداخت سفارش',
  refund: 'بازگشت وجه',
};

// A wallet's movements, newest first. The panel showed a balance and
// nothing behind it - support could not answer "where did my money go".
export default function WalletHistory({ walletId, refreshKey }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], totalPages: 1 });
  const [state, setState] = useState('loading');

  const load = useCallback(() => {
    setState('loading');
    api
      .get(`/wallets/${walletId}/transactions?page=${page}&limit=8`, { auth: true })
      .then((data) => {
        setResult({ items: data?.items ?? [], totalPages: data?.totalPages ?? 1 });
        setState('ready');
      })
      .catch(() => setState('failed'));
  }, [walletId, page]);

  useEffect(load, [load, refreshKey]);

  if (state === 'loading') return <div className="skeleton" style={{ height: 120 }} />;
  if (state === 'failed') {
    return <p className="small muted">تراکنش‌ها بارگذاری نشدند.</p>;
  }
  if (result.items.length === 0) {
    return <p className="small muted">هنوز تراکنشی ثبت نشده است.</p>;
  }

  return (
    <div className="stack" style={{ gap: 4 }}>
      {result.items.map((entry) => {
        const credit = Number(entry.amount) >= 0;
        return (
          <div className="spread small" key={entry.id} style={{ paddingBlock: 6 }}>
            <div>
              <div className="strong">{LABELS[entry.type] ?? entry.type}</div>
              <div className="tiny muted">
                {formatDateTime(entry.createdAt)}
                {entry.description ? ` — ${entry.description}` : ''}
              </div>
            </div>
            <span
              className="strong nowrap"
              style={{ color: credit ? 'var(--success-600)' : 'var(--danger-600)' }}
            >
              {credit ? '+' : '−'}
              {formatToman(Math.abs(Number(entry.amount)))}
            </span>
          </div>
        );
      })}
      <Pagination page={page} totalPages={result.totalPages} onChange={setPage} />
    </div>
  );
}
