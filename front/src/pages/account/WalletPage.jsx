import { useCallback, useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { translateError } from '../../lib/errorMessages';
import { digitsOnly, formatDateTime, formatToman } from '../../lib/format';
import { usePageTitle } from '../../lib/usePageTitle';
import {
  Button,
  ConnectionError,
  Field,
  Pagination,
} from '../../components/ui/Primitives';

// Keyed by the API's transaction types. Two of them were spelled
// differently here ("charge", "withdraw"), so a gateway top-up showed up
// as the raw English "zarinpal_charge".
const TRANSACTION_LABELS = {
  zarinpal_charge: 'شارژ کیف پول',
  admin_charge: 'شارژ توسط پشتیبانی',
  withdrawal: 'برداشت',
  order_payment: 'پرداخت سفارش',
  refund: 'بازگشت وجه',
};

export default function WalletPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [wallet, setWallet] = useState(null);
  const [status, setStatus] = useState('loading');
  const [history, setHistory] = useState({ items: [], totalPages: 1, page: 1 });
  const [amount, setAmount] = useState('');
  const [charging, setCharging] = useState(false);
  usePageTitle('کیف پول');

  // A new account has no wallet: the API makes one on the first refund,
  // but nothing made one for a customer who wanted to top up. The page
  // said "it activates after your first charge" and offered no way to
  // charge. Opening the page is reason enough to open the wallet.
  const loadWallet = useCallback(async () => {
    if (!user?.id) return;
    setStatus('loading');
    try {
      setWallet(await api.get(`/wallets/user/${user.id}`, { auth: true }));
      setStatus('ready');
    } catch (error) {
      if (error?.status !== 404) {
        setStatus('failed');
        return;
      }
      try {
        setWallet(await api.post('/wallets', {}, { auth: true }));
        setStatus('ready');
      } catch {
        setStatus('failed');
      }
    }
  }, [user?.id]);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  const loadHistory = useCallback(
    (page) => {
      if (!wallet?.id) return;
      api
        .get(`/wallets/${wallet.id}/transactions?page=${page}&limit=10`, { auth: true })
        .then((data) =>
          setHistory({
            items: data?.items ?? [],
            totalPages: data?.totalPages ?? 1,
            page,
          }),
        )
        .catch(() => setHistory({ items: [], totalPages: 1, page }));
    },
    [wallet?.id],
  );

  useEffect(() => loadHistory(1), [loadHistory]);

  const charge = async (event) => {
    event.preventDefault();
    if (!wallet) return;
    setCharging(true);
    try {
      // The API opens a gateway session and answers with the URL the
      // customer has to be sent to.
      const result = await api.post(
        `/wallets/${wallet.id}/charge/request`,
        { amount: Number(amount) },
        { auth: true },
      );
      if (result?.paymentUrl) {
        window.location.href = result.paymentUrl;
        return;
      }
      toast.success('درخواست شارژ ثبت شد');
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      setCharging(false);
    }
  };

  if (status === 'loading') {
    return <div className="skeleton" style={{ height: 240, borderRadius: 16 }} />;
  }

  if (status === 'failed' || !wallet) {
    return (
      <div className="card">
        <ConnectionError onRetry={loadWallet} />
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div
        className="card card-pad"
        style={{
          background: 'linear-gradient(135deg, var(--brand-800), var(--brand-600))',
          color: '#fff',
          border: 'none',
        }}
      >
        <div className="tiny row" style={{ opacity: 0.8, gap: 6 }}>
          <Wallet size={14} />
          موجودی کیف پول
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
          {formatToman(wallet.amount)}
        </div>
      </div>

      <form onSubmit={charge} className="card card-pad stack">
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>افزایش موجودی</h2>
        <Field label="مبلغ (تومان)">
          <input
            className="input"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(digitsOnly(event.target.value))}
            placeholder="۵۰۰۰۰۰"
            required
          />
        </Field>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {[500000, 1000000, 2000000].map((preset) => (
            <button
              key={preset}
              type="button"
              className="chip"
              onClick={() => setAmount(String(preset))}
            >
              {formatToman(preset)}
            </button>
          ))}
        </div>
        <Button type="submit" variant="primary" loading={charging} disabled={!Number(amount)}>
          پرداخت و شارژ
        </Button>
      </form>

      <div className="card card-pad">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>تراکنش‌ها</h2>
        {history.items.length === 0 ? (
          <p className="small muted">هنوز تراکنشی ثبت نشده است.</p>
        ) : (
          history.items.map((transaction) => {
            const credit = Number(transaction.amount) >= 0;
            return (
              <div className="spread" key={transaction.id} style={{ paddingBlock: 10 }}>
                <div>
                  <div className="small strong">
                    {TRANSACTION_LABELS[transaction.type] ?? 'تراکنش'}
                  </div>
                  <div className="tiny muted">{formatDateTime(transaction.createdAt)}</div>
                </div>
                <span
                  className="strong small nowrap"
                  style={{ color: credit ? 'var(--success-600)' : 'var(--danger-600)' }}
                >
                  {credit ? '+' : '−'}
                  {formatToman(Math.abs(Number(transaction.amount)))}
                </span>
              </div>
            );
          })
        )}
        <Pagination page={history.page} totalPages={history.totalPages} onChange={loadHistory} />
      </div>
    </div>
  );
}
