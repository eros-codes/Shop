import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Headphones, Package, RotateCcw, Truck } from 'lucide-react';
import { api, buildQuery } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { translateError } from '../../lib/errorMessages';
import { formatDateTime, formatToman } from '../../lib/format';
import { Button, EmptyState } from '../../components/ui/Primitives';
import { ORDER_STATUS, TIMELINE } from './orderStatus';

const TIMELINE_LABELS = {
  paid: 'پرداخت',
  processing: 'آماده‌سازی',
  sent: 'ارسال',
  delivered: 'تحویل',
};

export default function OrderDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [returnMode, setReturnMode] = useState(false);
  const [returnLines, setReturnLines] = useState({});
  const [reason, setReason] = useState('damaged');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get(`/orders/${id}`, { auth: true })
      .then(setOrder)
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  if (loading) {
    return <div className="skeleton" style={{ height: 320, borderRadius: 16 }} />;
  }

  if (!order) {
    return (
      <div className="card">
        <EmptyState
          title="این سفارش پیدا نشد"
          action={
            <Link className="btn btn-primary" to="/account/orders">
              بازگشت به سفارش‌ها
            </Link>
          }
        />
      </div>
    );
  }

  const status = ORDER_STATUS[order.status] ?? { label: order.status, tone: 'muted' };
  const currentStep = TIMELINE.indexOf(order.status);
  const cancelled = order.status === 'cancelled';

  const submitReturn = async (event) => {
    event.preventDefault();
    const items = Object.entries(returnLines)
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([orderItemId, quantity]) => ({
        orderItemId: Number(orderItemId),
        quantity: Number(quantity),
      }));

    if (items.length === 0) {
      toast.error('حداقل یک کالا را برای مرجوع‌کردن انتخاب کنید');
      return;
    }

    setSending(true);
    try {
      await api.post(
        '/returns',
        { orderId: order.id, reason, description: description || undefined, items },
        { auth: true },
      );
      toast.success('درخواست مرجوعی ثبت شد');
      setReturnMode(false);
      setReturnLines({});
      setDescription('');
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card card-pad">
        <div className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>
              <bdi className="nowrap">{order.invoice_number ?? `سفارش #${order.id}`}</bdi>
            </h1>
            <div className="tiny muted">
              ثبت در {formatDateTime(order.createdAt ?? order.created_at)}
            </div>
          </div>
          <span className={`badge badge-${status.tone}`}>{status.label}</span>
        </div>

        {!cancelled ? (
          <div className="timeline">
            {TIMELINE.map((step, index) => (
              <div
                className="timeline-step"
                key={step}
                data-done={currentStep >= index}
              >
                <span className="timeline-dot">
                  {currentStep >= index ? <Check size={14} /> : index + 1}
                </span>
                {TIMELINE_LABELS[step]}
              </div>
            ))}
          </div>
        ) : null}

        {order.tracking_code ? (
          <div className="row card card-pad" style={{ gap: 10, marginTop: 8 }}>
            <Truck size={20} color="var(--brand-600)" />
            <div>
              <div className="small strong">
                کد رهگیری مرسوله: {order.tracking_code}
              </div>
              {order.shipping_method_title ? (
                <div className="tiny muted">
                  ارسال با {order.shipping_method_title}
                  {order.shipping_eta_days_max
                    ? ` — تحویل تا ${order.shipping_eta_days_max.toLocaleString('fa-IR')} روز کاری`
                    : ''}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="card card-pad">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          کالاهای این سفارش
        </h2>

        {(order.items ?? []).map((item) => (
          <div className="cart-line" key={item.id}>
            <div className="cart-thumb">
              <Package size={22} color="var(--ink-300)" />
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <Link
                to={`/product/${item.product?.slug ?? item.product?.id}`}
                className="strong small"
              >
                {item.product?.title}
              </Link>
              {item.variant_title ? (
                <span className="badge badge-muted" style={{ alignSelf: 'flex-start' }}>
                  {item.variant_title}
                </span>
              ) : null}
              <span className="tiny muted">
                {formatToman(item.price)} × {item.quantity.toLocaleString('fa-IR')}
              </span>
            </div>
            <div className="strong small">
              {formatToman(item.price * item.quantity)}
            </div>
          </div>
        ))}

        <div className="divider" />

        <div className="summary-row">
          <span className="muted">قیمت کالاها</span>
          <span>{formatToman(order.items_total)}</span>
        </div>
        {Number(order.discount_amount) > 0 ? (
          <div className="summary-row" style={{ color: 'var(--success-600)' }}>
            <span>تخفیف</span>
            <span>−{formatToman(order.discount_amount)}</span>
          </div>
        ) : null}
        <div className="summary-row">
          <span className="muted">هزینه ارسال</span>
          <span>
            {Number(order.shipping_cost) === 0
              ? 'رایگان'
              : formatToman(order.shipping_cost)}
          </span>
        </div>
        {Number(order.cod_fee) > 0 ? (
          <div className="summary-row">
            <span className="muted">کارمزد پرداخت در محل</span>
            <span>{formatToman(order.cod_fee)}</span>
          </div>
        ) : null}
        <div className="summary-row">
          <span className="muted">مالیات</span>
          <span>{formatToman(order.tax_amount)}</span>
        </div>
        {Number(order.refunded_amount) > 0 ? (
          <div className="summary-row" style={{ color: 'var(--success-600)' }}>
            <span>بازگشت داده شده</span>
            <span>{formatToman(order.refunded_amount)}</span>
          </div>
        ) : null}
        <div className="summary-row summary-total">
          <span>مبلغ پرداختی</span>
          <span>{formatToman(order.total_price)}</span>
        </div>
      </div>

      {order.status === 'delivered' ? (
        <div className="card card-pad">
          <div className="spread" style={{ marginBottom: returnMode ? 14 : 0 }}>
            <h2 className="row" style={{ fontSize: 16, fontWeight: 700, gap: 8 }}>
              <RotateCcw size={18} color="var(--brand-600)" />
              مرجوع‌کردن کالا
            </h2>
            <Button
              variant={returnMode ? 'ghost' : 'soft'}
              size="sm"
              onClick={() => setReturnMode((value) => !value)}
            >
              {returnMode ? 'انصراف' : 'ثبت درخواست'}
            </Button>
          </div>

          {returnMode ? (
            <form onSubmit={submitReturn} className="stack">
              {(order.items ?? []).map((item) => (
                <div className="spread" key={item.id}>
                  <span className="small">
                    {item.product?.title}
                    {item.variant_title ? ` — ${item.variant_title}` : ''}
                  </span>
                  <input
                    className="input"
                    style={{ width: 110 }}
                    type="number"
                    min={0}
                    max={item.quantity}
                    value={returnLines[item.id] ?? 0}
                    onChange={(event) =>
                      setReturnLines((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                  />
                </div>
              ))}

              <div className="field">
                <label className="field-label">دلیل مرجوعی</label>
                <select
                  className="select"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                >
                  <option value="damaged">کالا آسیب‌دیده بود</option>
                  <option value="wrong_item">کالای اشتباه ارسال شد</option>
                  <option value="not_as_described">با توضیحات مطابقت ندارد</option>
                  <option value="changed_mind">منصرف شدم</option>
                  <option value="other">دلیل دیگر</option>
                </select>
              </div>

              <textarea
                className="textarea"
                placeholder="توضیح بیشتر (اختیاری)"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />

              <Button type="submit" variant="primary" loading={sending}>
                ثبت درخواست مرجوعی
              </Button>
            </form>
          ) : (
            <p className="small muted" style={{ marginTop: 8 }}>
              تا ۷ روز پس از تحویل می‌توانید کالا را مرجوع کنید. مبلغ کالا و مالیات
              آن پس از دریافت و بررسی به کیف پول شما برمی‌گردد.
            </p>
          )}
        </div>
      ) : null}

      <div className="card card-pad spread" style={{ flexWrap: 'wrap', gap: 10 }}>
        <span className="row small" style={{ gap: 8 }}>
          <Headphones size={18} color="var(--brand-600)" />
          سؤال یا مشکلی درباره‌ی این سفارش دارید؟
        </span>
        <Link
          className="btn btn-soft btn-sm"
          to={`/account/tickets/new${buildQuery({
            subject: 'order',
            title: `پیگیری سفارش ${order.invoice_number ?? `#${order.id}`}`,
          })}`}
        >
          ثبت تیکت پشتیبانی
        </Link>
      </div>
    </div>
  );
}
