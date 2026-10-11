import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { api } from '../lib/api';
import { printInvoice } from '../lib/printInvoice';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { formatDateTime, formatToman, toAsciiDigits } from '../lib/format';
import { Button, Field, Modal } from '../components/Primitives';
import {
  ORDER_STATUS,
  PAYMENT_METHODS,
  nextStatuses,
  transitionLabel,
} from '../lib/status';

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

  // A shipped order's tracking code can be corrected: the API takes the
  // current status again with the new code and changes nothing else. There
  // used to be no way to fix a mistyped code once the order was "sent".
  const editingTracking = order?.status === 'sent' && !target;

  const changeStatus = async () => {
    const status = target || (editingTracking ? 'sent' : '');
    if (!status || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const code = toAsciiDigits(tracking.trim());
      const updated = await api.patch(
        `/orders/${orderId}/status`,
        {
          status,
          // Sent with the same request, so marking an order shipped and
          // recording its tracking code is one action.
          ...(status === 'sent' && code ? { tracking_code: code } : {}),
        },
        { auth: true },
      );
      setOrder(updated);
      setTracking(updated?.tracking_code ?? code);
      setTarget('');
      toast.success(target ? 'وضعیت سفارش به‌روز شد' : 'کد رهگیری به‌روز شد');
      onChanged?.();
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const meta = ORDER_STATUS[order?.status] ?? { label: order?.status, tone: 'muted' };
  const nextOptions = order ? nextStatuses(order) : [];
  const cod = order?.payment_method === 'cash_on_delivery';
  const moneyIn = !cod || !!order?.payed_time;

  return (
    <Modal
      wide
      title={
        loading
          ? 'در حال بارگذاری…'
          : `سفارش ⁨${order?.invoice_number ?? `#${orderId}`}⁩`
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            بستن
          </Button>
          {/* The invoice / packing slip that goes in the parcel. */}
          {order ? (
            <Button
              variant="soft"
              onClick={() => {
                if (!printInvoice(order)) toast.error('پنجره‌ی چاپ باز نشد؛ اجازه‌ی پاپ‌آپ را بدهید.');
              }}
            >
              <Printer size={15} />
              چاپ فاکتور
            </Button>
          ) : null}
          {nextOptions.length > 0 ? (
            <Button
              onClick={changeStatus}
              loading={saving}
              disabled={
                !target &&
                !(editingTracking && tracking.trim() && tracking.trim() !== (order?.tracking_code ?? ''))
              }
            >
              {editingTracking ? 'ذخیره' : 'ثبت تغییر وضعیت'}
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
              {/* What support needs to match a payment with the bank or
                  the gateway - neither was on screen. */}
              {order.payed_time ? (
                <div className="tiny muted">پرداخت: {formatDateTime(order.payed_time)}</div>
              ) : cod ? (
                <div className="tiny" style={{ color: 'var(--warning-600)' }}>
                  وجه هنوز دریافت نشده
                </div>
              ) : null}
              {order.payment_reference ? (
                <div className="tiny muted">
                  کد پیگیری: <bdi>{order.payment_reference}</bdi>
                </div>
              ) : null}
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
              {order.user?.mobile ? (
                <Link
                  className="tiny"
                  style={{ color: 'var(--brand-600)', marginInlineStart: 8 }}
                  to={`/orders?search=${encodeURIComponent(order.user.mobile)}`}
                  onClick={onClose}
                >
                  همه‌ی سفارش‌های این مشتری
                </Link>
              ) : null}
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
                    <td className="small">{item.product?.title ?? 'کالای حذف‌شده'}</td>
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
                <span>
                  تخفیف
                  {order.discount?.code ? (
                    <bdi className="tiny"> ({order.discount.code})</bdi>
                  ) : null}
                </span>
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
                      {transitionLabel(order, value)}
                    </option>
                  ))}
                </select>
              </Field>

              {target === 'sent' || editingTracking ? (
                <Field
                  label="کد رهگیری مرسوله"
                  hint={
                    editingTracking
                      ? 'برای اصلاح کد ثبت‌شده؛ وضعیت سفارش تغییر نمی‌کند'
                      : 'همراه پیامک «ارسال شد» برای مشتری فرستاده می‌شود'
                  }
                >
                  <input
                    className="input"
                    value={tracking}
                    onChange={(event) => setTracking(event.target.value)}
                    placeholder="مثلاً 123456789"
                    dir="ltr"
                  />
                </Field>
              ) : null}

              {target === 'cancelled' ? (
                <p className="tiny" style={{ color: 'var(--warning-600)' }}>
                  {moneyIn
                    ? 'با لغو سفارش، موجودی کالاها برمی‌گردد و مبلغ پرداختی به کیف پول مشتری بازگردانده می‌شود.'
                    : 'با لغو سفارش، موجودی کالاها برمی‌گردد. وجهی دریافت نشده، پس مبلغی هم بازگردانده نمی‌شود.'}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
