import { useEffect, useState, useRef } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { formatDateTime, formatToman } from '../lib/format';
import { Button, Field, Modal } from '../components/Primitives';
import { NEXT_STATUS, ORDER_STATUS, PAYMENT_METHODS } from '../lib/status';

export default function OrderDrawer({ orderId, onClose, onChanged }) {
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  // "This order was not found" is a different thing to say than "we could
  // not reach the server", and the admin needs to know which one it is.
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState('');
  const [tracking, setTracking] = useState('');
  const [saving, setSaving] = useState(false);
  // `saving` is React state, so it only disables the button on the next
  // render - three fast clicks all get through first. Some transitions have
  // side effects (an SMS on "sent", a refund on "cancelled"), so a repeat is
  // not harmless even when the final status comes out right.
  const savingRef = useRef(false);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    api
      .get(`/orders/${orderId}`, { auth: true })
      .then((data) => {
        setOrder(data);
        setTracking(data?.tracking_code ?? '');
      })
      .catch((error) => {
        setOrder(null);
        setFailed(!error?.status || error.status >= 500);
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  const changeStatus = async () => {
    if (!target || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const updated = await api.patch(
        `/orders/${orderId}/status`,
        {
          status: target,
          // Sent with the same request, so marking an order shipped and
          // recording its tracking code is one action.
          ...(target === 'sent' && tracking.trim()
            ? { tracking_code: tracking.trim() }
            : {}),
        },
        { auth: true },
      );
      setOrder(updated);
      setTarget('');
      toast.success('وضعیت سفارش به‌روز شد');
      onChanged?.();
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const meta = ORDER_STATUS[order?.status] ?? { label: order?.status, tone: 'muted' };
  const nextOptions = NEXT_STATUS[order?.status] ?? [];

  return (
    <Modal
      wide
      title={
        loading
          ? 'در حال بارگذاری…'
          : `سفارش ${order?.invoice_number ?? `#${orderId}`}`
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            بستن
          </Button>
          {nextOptions.length > 0 ? (
            <Button onClick={changeStatus} loading={saving} disabled={!target}>
              ثبت تغییر وضعیت
            </Button>
          ) : null}
        </>
      }
    >
      {loading ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : !order ? (
        <p className="small muted">
          {failed
            ? 'ارتباط با سرور برقرار نشد؛ لطفاً دوباره تلاش کنید.'
            : 'این سفارش پیدا نشد.'}
        </p>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div className="grid cols-3">
            <div>
              <div className="tiny muted">وضعیت</div>
              <span className={`badge badge-${meta.tone}`}>{meta.label}</span>
            </div>
            <div>
              <div className="tiny muted">روش پرداخت</div>
              <div className="small strong">
                {PAYMENT_METHODS[order.payment_method] ?? '—'}
              </div>
            </div>
            <div>
              <div className="tiny muted">ثبت</div>
              <div className="small">
                {formatDateTime(order.createdAt ?? order.created_at)}
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="tiny muted" style={{ marginBottom: 6 }}>
              مشتری و آدرس
            </div>
            <div className="small strong">
              {order.user?.display_name} — {order.user?.mobile}
            </div>
            {order.shippingAddressSnapshot ? (
              <div className="small muted">
                {order.shippingAddressSnapshot.province}،{' '}
                {order.shippingAddressSnapshot.city} —{' '}
                {order.shippingAddressSnapshot.address} (کد پستی{' '}
                {order.shippingAddressSnapshot.postal_code}، گیرنده{' '}
                {order.shippingAddressSnapshot.receiver_mobile})
              </div>
            ) : null}
            {order.shipping_method_title ? (
              <div className="tiny muted" style={{ marginTop: 4 }}>
                ارسال با {order.shipping_method_title}
                {order.tracking_code ? ` — کد رهگیری ${order.tracking_code}` : ''}
              </div>
            ) : null}
          </div>

          <div className="table-wrap card">
            <table className="data">
              <thead>
                <tr>
                  <th>کالا</th>
                  <th>گزینه</th>
                  <th>قیمت واحد</th>
                  <th>تعداد</th>
                  <th>جمع</th>
                </tr>
              </thead>
              <tbody>
                {(order.items ?? []).map((item) => (
                  <tr key={item.id}>
                    <td className="small">{item.product?.title}</td>
                    <td className="tiny muted">
                      {item.variant_title ?? '—'}
                      {item.variant_sku ? ` (${item.variant_sku})` : ''}
                    </td>
                    <td className="small">{formatToman(item.price)}</td>
                    <td>{item.quantity.toLocaleString('fa-IR')}</td>
                    <td className="strong small">
                      {formatToman(item.price * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card card-pad stack" style={{ gap: 6 }}>
            <div className="spread small">
              <span className="muted">کالاها</span>
              <span>{formatToman(order.items_total)}</span>
            </div>
            {Number(order.discount_amount) > 0 ? (
              <div className="spread small" style={{ color: 'var(--success-600)' }}>
                <span>تخفیف</span>
                <span>−{formatToman(order.discount_amount)}</span>
              </div>
            ) : null}
            <div className="spread small">
              <span className="muted">ارسال</span>
              <span>{formatToman(order.shipping_cost)}</span>
            </div>
            {Number(order.cod_fee) > 0 ? (
              <div className="spread small">
                <span className="muted">کارمزد پرداخت در محل</span>
                <span>{formatToman(order.cod_fee)}</span>
              </div>
            ) : null}
            <div className="spread small">
              <span className="muted">مالیات</span>
              <span>{formatToman(order.tax_amount)}</span>
            </div>
            {Number(order.refunded_amount) > 0 ? (
              <div className="spread small" style={{ color: 'var(--success-600)' }}>
                <span>بازگشت داده شده</span>
                <span>{formatToman(order.refunded_amount)}</span>
              </div>
            ) : null}
            <div className="divider" />
            <div className="spread strong">
              <span>مبلغ پرداختی</span>
              <span>{formatToman(order.total_price)}</span>
            </div>
          </div>

          {nextOptions.length > 0 ? (
            <div className="card card-pad stack">
              <div className="card-title" style={{ fontSize: 14 }}>
                تغییر وضعیت
              </div>
              <Field label="وضعیت جدید">
                <select
                  className="select"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  <option value="">انتخاب کنید…</option>
                  {nextOptions.map((value) => (
                    <option key={value} value={value}>
                      {ORDER_STATUS[value]?.label ?? value}
                    </option>
                  ))}
                </select>
              </Field>

              {target === 'sent' ? (
                <Field
                  label="کد رهگیری مرسوله"
                  hint="همراه پیامک «ارسال شد» برای مشتری فرستاده می‌شود"
                >
                  <input
                    className="input"
                    value={tracking}
                    onChange={(event) => setTracking(event.target.value)}
                    placeholder="مثلاً ۱۲۳۴۵۶۷۸۹"
                  />
                </Field>
              ) : null}

              {target === 'cancelled' ? (
                <p className="tiny" style={{ color: 'var(--warning-600)' }}>
                  با لغو سفارش، موجودی کالاها برمی‌گردد و در صورت پرداخت، مبلغ به
                  کیف پول مشتری بازگردانده می‌شود.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
