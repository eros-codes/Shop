import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, Wallet, XCircle } from 'lucide-react';
import { formatToman } from '../lib/format';

// Where the API sends the customer back to after the gateway. The backend
// decides the outcome and puts it in the query string; this page only
// reports it.
//
// Four outcomes, not two. "refunded" and "pending" both mean the money has
// actually left the customer's account, so they cannot share the wording of
// a cancelled payment - and until these routes existed they landed on the
// 404 page, at the one moment a customer least needs to see one.
const OUTCOMES = {
  success: {
    icon: CheckCircle2,
    tone: 'success',
    title: 'پرداخت با موفقیت انجام شد',
    body: () => 'سفارش شما ثبت شد و در حال آماده‌سازی است.',
  },
  failed: {
    icon: XCircle,
    tone: 'danger',
    title: 'پرداخت ناموفق بود',
    body: (reason) =>
      reason === 'cancelled'
        ? 'پرداخت توسط شما لغو شد. مبلغی از حساب شما کسر نشد.'
        : 'مبلغی از حساب شما کسر نشد. می‌توانید دوباره تلاش کنید.',
  },
  refunded: {
    icon: Wallet,
    tone: 'warning',
    title: 'مبلغ به کیف پول شما برگشت',
    body: () =>
      'این سفارش پیش از رسیدن پرداخت بسته شده بود، پس مبلغ کسرشده به کیف پول شما واریز شد. می‌توانید با همان موجودی دوباره سفارش ثبت کنید.',
  },
  pending: {
    icon: Clock,
    tone: 'warning',
    title: 'پرداخت در حال بررسی است',
    body: () =>
      'هنوز نتوانسته‌ایم پرداخت را با درگاه تطبیق دهیم. سفارش شما رزرو مانده و به‌محض تأیید، وضعیتش به‌روز می‌شود. اگر مبلغی کسر شده باشد و پرداخت تأیید نشود، خودکار برمی‌گردد.',
  },
};

export default function PaymentResult({ outcome = 'success' }) {
  const [params] = useSearchParams();
  const orderId = params.get('orderId');
  const amount = params.get('amount');
  const reference = params.get('refId') ?? params.get('reference');
  const reason = params.get('reason');

  const view = OUTCOMES[outcome] ?? OUTCOMES.success;
  const Icon = view.icon;

  return (
    <div className="container auth-wrap">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div
          className="empty-icon"
          style={{
            margin: '0 auto 16px',
            width: 78,
            height: 78,
            background: `var(--${view.tone}-50)`,
            color: `var(--${view.tone}-600)`,
          }}
        >
          <Icon size={36} />
        </div>

        <h1 className="auth-title">{view.title}</h1>
        <p className="auth-sub">{view.body(reason)}</p>

        <div className="stack" style={{ gap: 8, textAlign: 'start' }}>
          {orderId ? (
            <div className="summary-row">
              <span className="muted">شماره سفارش</span>
              <span className="strong">{orderId}</span>
            </div>
          ) : null}
          {amount ? (
            <div className="summary-row">
              <span className="muted">مبلغ</span>
              <span className="strong">{formatToman(amount)}</span>
            </div>
          ) : null}
          {reference ? (
            <div className="summary-row">
              <span className="muted">کد پیگیری</span>
              <span className="strong">{reference}</span>
            </div>
          ) : null}
        </div>

        <div className="stack" style={{ marginTop: 20 }}>
          <Link
            className="btn btn-primary btn-block"
            to={orderId ? `/account/orders/${orderId}` : '/account/orders'}
          >
            مشاهده سفارش
          </Link>
          {outcome === 'refunded' ? (
            <Link className="btn btn-ghost btn-block" to="/account/wallet">
              مشاهده کیف پول
            </Link>
          ) : null}
          <Link className="btn btn-ghost btn-block" to="/products">
            ادامه خرید
          </Link>
        </div>
      </div>
    </div>
  );
}
