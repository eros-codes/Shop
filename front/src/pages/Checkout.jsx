import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgePercent,
  Banknote,
  CreditCard,
  MapPin,
  Plus,
  Truck,
  Wallet,
} from 'lucide-react';
import { api, idempotencyKey } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { formatToman } from '../lib/format';
import { Breadcrumb, Button, Field } from '../components/ui/Primitives';

const STEPS = ['آدرس', 'روش ارسال', 'پرداخت'];

export default function Checkout() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { lines, goodsTotal, reload, clearLocal } = useCart();

  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  const [shippingOptions, setShippingOptions] = useState([]);
  const [shippingMethodId, setShippingMethodId] = useState(null);
  const [quoting, setQuoting] = useState(false);

  const [discountCode, setDiscountCode] = useState('');
  const [appliedCode, setAppliedCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [wallet, setWallet] = useState(null);
  const [placing, setPlacing] = useState(false);
  // `placing` cannot guard the submit on its own: setState is asynchronous,
  // so several fast clicks all run placeOrder before React re-renders and
  // disables the button. This ref is read and written synchronously.
  const placingRef = useRef(false);
  // One Idempotency-Key per checkout *attempt*, not per request. Generating
  // a fresh key inside each call is what let a double-click create two
  // orders - the server deduplicates by key, and never saw the same one
  // twice. The key is tied to the payload because reusing it for a changed
  // order is a 409 by design.
  const attempt = useRef({ key: null, signature: null });

  const items = useMemo(
    () =>
      lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId ?? undefined,
        quantity: line.quantity,
      })),
    [lines],
  );

  useEffect(() => {
    if (lines.length === 0) navigate('/cart', { replace: true });
  }, [lines.length, navigate]);

  useEffect(() => {
    api
      .get('/addresses', { auth: true })
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.items ?? []);
        setAddresses(list);
        if (list.length > 0) setAddressId((current) => current ?? list[0].id);
        else setShowAddressForm(true);
      })
      .catch(() => setShowAddressForm(true));

    if (user?.id) {
      api
        .get(`/wallets/user/${user.id}`, { auth: true })
        .then(setWallet)
        .catch(() => setWallet(null));
    }
  }, [user?.id]);

  // The API prices shipping for this address and this basket: the cost
  // depends on where it goes and how much it weighs, so the quote has to
  // come from the server, not from a guess here.
  const quote = useCallback(async () => {
    if (!addressId || items.length === 0) return;
    setQuoting(true);
    try {
      const data = await api.post(
        '/shipping/quote',
        { addressId, items, goodsTotal },
        { auth: true },
      );
      const options = data?.options ?? [];
      setShippingOptions(options);
      setShippingMethodId((current) => {
        if (options.some((option) => option.methodId === current)) return current;
        return options[0]?.methodId ?? null;
      });
    } catch (error) {
      setShippingOptions([]);
      toast.error(translateError(error));
    } finally {
      setQuoting(false);
    }
  }, [addressId, items, goodsTotal, toast]);

  useEffect(() => {
    void quote();
  }, [quote]);

  const selectedShipping = shippingOptions.find(
    (option) => option.methodId === shippingMethodId,
  );

  const saveAddress = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSavingAddress(true);
    try {
      const created = await api.post(
        '/addresses',
        {
          province: form.get('province'),
          city: form.get('city'),
          address: form.get('address'),
          postal_code: form.get('postal_code'),
          receiver_mobile: form.get('receiver_mobile'),
        },
        { auth: true },
      );
      setAddresses((current) => [...current, created]);
      setAddressId(created.id);
      setShowAddressForm(false);
      toast.success('آدرس ذخیره شد');
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      setSavingAddress(false);
    }
  };

  const placeOrder = async () => {
    if (!addressId) {
      toast.error('لطفاً آدرس تحویل را انتخاب کنید');
      return;
    }
    if (placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    try {
      const payload = {
        addressId,
        items,
        ...(shippingMethodId ? { shippingMethodId } : {}),
        ...(appliedCode ? { discountCode: appliedCode } : {}),
        ...(paymentMethod === 'wallet'
          ? { payWithWallet: true }
          : paymentMethod === 'cod'
            ? { payOnDelivery: true }
            : { payWithZarinpal: true }),
      };

      const signature = JSON.stringify(payload);
      if (attempt.current.signature !== signature) {
        attempt.current = { key: idempotencyKey(), signature };
      }

      const result = await api.post('/orders', payload, {
        auth: true,
        // A retried request returns the order it already created rather
        // than making a second one.
        headers: { 'Idempotency-Key': attempt.current.key },
      });
      attempt.current = { key: null, signature: null };

      if (result?.paymentUrl) {
        clearLocal();
        window.location.href = result.paymentUrl;
        return;
      }

      clearLocal();
      await reload();
      const order = result?.order ?? result;
      toast.success('سفارش شما ثبت شد');
      navigate(`/account/orders/${order?.id ?? ''}`);
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  const shippingCost = selectedShipping?.cost ?? 0;
  const codFee =
    paymentMethod === 'cod' ? (selectedShipping?.cashOnDeliveryFee ?? 0) : 0;
  // The authoritative total comes back with the order; this is the
  // estimate the customer sees while choosing.
  const estimatedTax = Math.round(goodsTotal * 0.1);
  const estimatedTotal = goodsTotal + shippingCost + codFee + estimatedTax;

  const step = !addressId ? 0 : !shippingMethodId && shippingOptions.length > 0 ? 1 : 2;

  return (
    <div className="container page">
      <Breadcrumb items={[{ label: 'سبد خرید', to: '/cart' }, { label: 'تکمیل خرید' }]} />

      <div className="steps">
        {STEPS.map((label, index) => (
          <span key={label} className="row" style={{ gap: 8 }}>
            <span
              className="step"
              data-state={index < step ? 'done' : index === step ? 'current' : 'todo'}
            >
              <span className="step-num">{(index + 1).toLocaleString('fa-IR')}</span>
              {label}
            </span>
            {index < STEPS.length - 1 ? <span className="step-line" /> : null}
          </span>
        ))}
      </div>

      <div className="two-col">
        <div className="stack" style={{ gap: 16 }}>
          <section className="card card-pad">
            <div className="spread" style={{ marginBottom: 14 }}>
              <h2 className="row" style={{ fontSize: 16, fontWeight: 700, gap: 8 }}>
                <MapPin size={18} color="var(--brand-600)" />
                آدرس تحویل
              </h2>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowAddressForm((value) => !value)}
              >
                <Plus size={15} />
                آدرس جدید
              </button>
            </div>

            <div className="stack" style={{ gap: 10 }}>
              {addresses.map((address) => (
                <label
                  key={address.id}
                  className="option-card"
                  data-selected={addressId === address.id}
                >
                  <input
                    type="radio"
                    name="address"
                    checked={addressId === address.id}
                    onChange={() => setAddressId(address.id)}
                  />
                  <div>
                    <div className="strong small">
                      {address.province}، {address.city}
                    </div>
                    <div className="small muted">{address.address}</div>
                    <div className="tiny muted">
                      کد پستی {address.postal_code} — تحویل‌گیرنده{' '}
                      {address.receiver_mobile}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {showAddressForm ? (
              <form onSubmit={saveAddress} className="stack" style={{ marginTop: 16 }}>
                <div className="grid auto-grid">
                  <Field label="استان">
                    <input className="input" name="province" required />
                  </Field>
                  <Field label="شهر">
                    <input className="input" name="city" required />
                  </Field>
                </div>
                <Field label="نشانی کامل">
                  <textarea className="textarea" name="address" required />
                </Field>
                <div className="grid auto-grid">
                  <Field label="کد پستی">
                    <input
                      className="input"
                      name="postal_code"
                      inputMode="numeric"
                      maxLength={10}
                      required
                    />
                  </Field>
                  <Field label="موبایل تحویل‌گیرنده">
                    <input
                      className="input"
                      name="receiver_mobile"
                      inputMode="numeric"
                      placeholder="09123456789"
                      required
                    />
                  </Field>
                </div>
                <Button type="submit" variant="soft" loading={savingAddress}>
                  ذخیره آدرس
                </Button>
              </form>
            ) : null}
          </section>

          <section className="card card-pad">
            <h2
              className="row"
              style={{ fontSize: 16, fontWeight: 700, gap: 8, marginBottom: 14 }}
            >
              <Truck size={18} color="var(--brand-600)" />
              روش ارسال
            </h2>

            {quoting ? (
              <p className="small muted">در حال محاسبه هزینه ارسال…</p>
            ) : shippingOptions.length === 0 ? (
              <p className="small muted">
                برای این آدرس روش ارسالی تعریف نشده است؛ سفارش بدون هزینه ارسال ثبت
                می‌شود.
              </p>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {shippingOptions.map((option) => (
                  <label
                    key={option.methodId}
                    className="option-card"
                    data-selected={shippingMethodId === option.methodId}
                  >
                    <input
                      type="radio"
                      name="shipping"
                      checked={shippingMethodId === option.methodId}
                      onChange={() => setShippingMethodId(option.methodId)}
                    />
                    <div style={{ flex: 1 }}>
                      <div className="spread">
                        <span className="strong small">{option.title}</span>
                        <span className="strong small">
                          {option.cost === 0 ? 'رایگان' : formatToman(option.cost)}
                        </span>
                      </div>
                      <div className="tiny muted">
                        تحویل بین {option.estimatedDaysMin.toLocaleString('fa-IR')} تا{' '}
                        {option.estimatedDaysMax.toLocaleString('fa-IR')} روز کاری
                        {option.freeShippingApplied ? ' — ارسال رایگان اعمال شد' : ''}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="card card-pad">
            <h2
              className="row"
              style={{ fontSize: 16, fontWeight: 700, gap: 8, marginBottom: 14 }}
            >
              <CreditCard size={18} color="var(--brand-600)" />
              روش پرداخت
            </h2>

            <div className="stack" style={{ gap: 10 }}>
              <label className="option-card" data-selected={paymentMethod === 'wallet'}>
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'wallet'}
                  onChange={() => setPaymentMethod('wallet')}
                />
                <div style={{ flex: 1 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <Wallet size={16} />
                    <span className="strong small">کیف پول</span>
                  </div>
                  <div className="tiny muted">
                    موجودی:{' '}
                    {wallet ? formatToman(wallet.amount) : 'در حال دریافت…'}
                  </div>
                </div>
              </label>

              <label className="option-card" data-selected={paymentMethod === 'online'}>
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'online'}
                  onChange={() => setPaymentMethod('online')}
                />
                <div style={{ flex: 1 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <CreditCard size={16} />
                    <span className="strong small">پرداخت اینترنتی</span>
                  </div>
                  <div className="tiny muted">انتقال به درگاه بانکی زرین‌پال</div>
                </div>
              </label>

              {selectedShipping?.supportsCashOnDelivery ? (
                <label className="option-card" data-selected={paymentMethod === 'cod'}>
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === 'cod'}
                    onChange={() => setPaymentMethod('cod')}
                  />
                  <div style={{ flex: 1 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <Banknote size={16} />
                      <span className="strong small">پرداخت در محل</span>
                    </div>
                    <div className="tiny muted">
                      کارمزد دریافت وجه:{' '}
                      {formatToman(selectedShipping.cashOnDeliveryFee ?? 0)}
                    </div>
                  </div>
                </label>
              ) : null}
            </div>
          </section>
        </div>

        <div className="card card-pad summary">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
            خلاصه سفارش
          </h2>

          <div className="stack" style={{ gap: 8, marginBottom: 10 }}>
            {lines.map((line) => (
              <div
                key={`${line.productId}-${line.variantId}`}
                className="spread small"
              >
                <span style={{ maxWidth: '65%' }}>
                  {line.title}
                  {line.variantTitle ? (
                    <span className="muted"> — {line.variantTitle}</span>
                  ) : null}
                  <span className="muted"> ×{line.quantity.toLocaleString('fa-IR')}</span>
                </span>
                <span>{formatToman(line.unitPrice * line.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="divider" />

          <div className="row" style={{ gap: 8 }}>
            <input
              className="input"
              placeholder="کد تخفیف"
              value={discountCode}
              onChange={(event) => setDiscountCode(event.target.value.toUpperCase())}
            />
            <Button
              variant="soft"
              onClick={() => {
                setAppliedCode(discountCode.trim());
                if (discountCode.trim()) {
                  toast.toast('کد هنگام ثبت سفارش بررسی می‌شود');
                }
              }}
            >
              <BadgePercent size={16} />
            </Button>
          </div>
          {appliedCode ? (
            <div className="tiny" style={{ color: 'var(--success-600)', marginTop: 6 }}>
              کد «{appliedCode}» هنگام ثبت سفارش اعمال می‌شود
            </div>
          ) : null}

          <div className="divider" />

          <div className="summary-row">
            <span className="muted">قیمت کالاها</span>
            <span>{formatToman(goodsTotal)}</span>
          </div>
          <div className="summary-row">
            <span className="muted">هزینه ارسال</span>
            <span>{shippingCost === 0 ? 'رایگان' : formatToman(shippingCost)}</span>
          </div>
          {codFee > 0 ? (
            <div className="summary-row">
              <span className="muted">کارمزد پرداخت در محل</span>
              <span>{formatToman(codFee)}</span>
            </div>
          ) : null}
          <div className="summary-row">
            <span className="muted">مالیات (تخمینی)</span>
            <span>{formatToman(estimatedTax)}</span>
          </div>

          <div className="summary-row summary-total">
            <span>مبلغ قابل پرداخت</span>
            <span>{formatToman(estimatedTotal)}</span>
          </div>

          <Button
            variant="primary"
            block
            size="lg"
            style={{ marginTop: 14 }}
            loading={placing}
            onClick={placeOrder}
          >
            ثبت سفارش و پرداخت
          </Button>

          <p className="tiny muted" style={{ marginTop: 10, lineHeight: 1.9 }}>
            مبلغ نهایی و تخفیف‌ها هنگام ثبت سفارش توسط سرور محاسبه می‌شود؛ عدد
            بالا تخمینی است.
          </p>
        </div>
      </div>
    </div>
  );
}
