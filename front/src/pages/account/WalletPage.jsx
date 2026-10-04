import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { translateError } from '../../lib/errorMessages';
import { formatDateTime, formatToman } from '../../lib/format';
import { Button, EmptyState, Field } from '../../components/ui/Primitives';

const TRANSACTION_LABELS = {
  charge: 'شارژ کیف پول',
  admin_charge: 'شارژ توسط پشتیبانی',
  withdraw: 'برداشت',
  order_payment: 'پرداخت سفارش',
  refund: 'بازگشت وجه',
};

export default function WalletPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    api
      .get(`/wallets/user/${user.id}`, { auth: true })
      .then(setWallet)
      .catch(() => setWallet(null));
  }, [user?.id]);

  const charge = async (event) => {
    event.preventDefault();
    if (!wallet) return;
    setLoading(true);
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
      setLoading(false);
    }
  };

  if (!wallet) {
    return (
      <div className="card">
        <EmptyState
          icon={<Wallet size={28} />}
          title="کیف پولی برای حساب شما ساخته نشده"
          description="پس از اولین خرید یا شارژ، کیف پول فعال می‌شود."
        />
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
        <div className="tiny" style={{ opacity: 0.8 }}>
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
            onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
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
        <Button type="submit" variant="primary" loading={loading}>
          پرداخت و شارژ
        </Button>
      </form>

      {wallet.transactions?.length ? (
        <div className="card card-pad">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
            تراکنش‌ها
          </h2>
          {wallet.transactions.map((transaction) => (
            <div className="spread" key={transaction.id} style={{ paddingBlock: 10 }}>
              <div>
                <div className="small strong">
                  {TRANSACTION_LABELS[transaction.type] ?? transaction.type}
                </div>
                <div className="tiny muted">
                  {formatDateTime(transaction.created_at)}
                </div>
              </div>
              <span
                className="strong small"
                style={{
                  color:
                    Number(transaction.amount) >= 0
                      ? 'var(--success-600)'
                      : 'var(--danger-600)',
                }}
              >
                {formatToman(Math.abs(Number(transaction.amount)))}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
