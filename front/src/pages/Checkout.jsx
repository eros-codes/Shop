import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
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
import { PROVINCES } from '../lib/provinces';
import { useInView } from '../lib/useInView';
import { usePageTitle } from '../lib/usePageTitle';
import { Breadcrumb, Button, Field } from '../components/ui/Primitives';

const STEPS = ['آدرس', 'روش ارسال', 'پرداخت'];

// Errors from pricing that are about the payment choice, not the basket:
// the page drops back to paying online instead of refusing to go on.
const COD_REFUSALS = ['COD_LIMIT_EXCEEDED', 'COD_NOT_SUPPORTED'];

export default function Checkout() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, ready, isAuthenticated } = useAuth();
  const { lines, reload, clearLocal, settled } = useCart();
  usePageTitle('تکمیل خرید');

  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  const [shippingOptions, setShippingOptions] = useState([]);
  const [shippingMethodId, setShippingMethodId] = useState(null);
  const [quoting, setQuoting] = useState(false);

  const [discountCode, setDiscountCode] = useState('');
  const [appliedCode, setAppliedCode] = useState('');
  const [discountNote, setDiscountNote] = useState(null);

  // undefined: still asking; null: this account has no wallet yet.
  const [wallet, setWallet] = useState(undefined);
  // What the customer picked. The method actually used is worked out
  // below, because a pick can stop being possible (a courier that does
  // not collect cash, a wallet that does not cover the total).
  const [chosenPayment, setChosenPayment] = useState(null);
  const [codRefusal, setCodRefusal] = useState(null);

  // The server's price for exactly this order - see OrdersService.quote.
  const [price, setPrice] = useState(null);
  const [pricing, setPricing] = useState(false);
  const [priceError, setPriceError] = useState(null);
  const pricingRun = useRef(0);

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
  const goodsTotal = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.unitPrice ?? 0) * line.quantity, 0),
    [lines],
  );

  useEffect(() => {
    if (isAuthenticated && settled && lines.length === 0) navigate('/cart', { replace: true });
  }, [isAuthenticated, settled, lines.length, navigate]);

  useEffect(() => {
    if (!user?.id) return;
    api
      .get('/addresses', { auth: true })
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.items ?? []);
        setAddresses(list);
        if (list.length > 0) setAddressId((current) => current ?? list[0].id);
        else setShowAddressForm(true);
      })
      .catch(() => setShowAddressForm(true));

    api
      .get(`/wallets/user/${user.id}`, { auth: true })
      .then(setWallet)
      .catch(() => setWallet(null));
  }, [user?.id]);

  // The API prices shipping for this address and this basket: the cost
  // depends on where it goes and how much it weighs, so the quote has to
  // come from the server, not from a guess here.
  const quoteShipping = useCallback(async () => {
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
    void quoteShipping();
  }, [quoteShipping]);

  const selectedShipping = shippingOptions.find(
    (option) => option.methodId === shippingMethodId,
  );
  const codAvailable = !!selectedShipping?.supportsCashOnDelivery && !codRefusal;
  const payOnDelivery = chosenPayment === 'cod' && codAvailable;

  // The price for exactly what would be sent. Recomputed whenever the
  // basket, address, courier, code or cash-on-delivery choice changes;
  // a slower answer to an older question is thrown away.
  useEffect(() => {
    if (!addressId || items.length === 0 || quoting) return;
    if (shippingOptions.length > 0 && !shippingMethodId) return;

    const run = ++pricingRun.current;
    setPricing(true);
    api
      .post(
        '/orders/quote',
        {
          addressId,
          items,
          ...(shippingMethodId ? { shippingMethodId } : {}),
          ...(appliedCode ? { discountCode: appliedCode } : {}),
          ...(payOnDelivery ? { payOnDelivery: true } : {}),
        },
        { auth: true },
      )
      .then((result) => {
        if (run !== pricingRun.current) return;
        setPrice(result);
        setPriceError(null);
        const discount = result?.discount;
        if (discount?.applied) {
          setDiscountNote({
            tone: 'success',
            text: `کد «${discount.code}» اعمال شد: ${formatToman(result.discount_amount)} تخفیف`,
          });
        } else if (discount) {
          // Shown, then dropped from the order: placing it with a code the
          // server just turned down would only fail again.
          setDiscountNote({ tone: 'danger', text: translateError(discount.error) });
          setAppliedCode('');
        }
      })
      .catch((error) => {
        if (run !== pricingRun.current) return;
        if (payOnDelivery && COD_REFUSALS.includes(error?.code)) {
          setCodRefusal(translateError(error));
          return;
        }
        setPrice(null);
        setPriceError(error);
      })
      .finally(() => {
        if (run === pricingRun.current) setPricing(false);
      });
  }, [addressId, items, shippingMethodId, shippingOptions.length, quoting, appliedCode, payOnDelivery]);

  // A cash-on-delivery refusal belongs to the courier it was given for.
  useEffect(() => setCodRefusal(null), [shippingMethodId, addressId]);

  const total = price?.total_price ?? null;
  const walletCovers = !!wallet && total !== null && Number(wallet.amount) >= total;
  const paymentMethod = payOnDelivery
    ? 'cod'
    : chosenPayment === 'wallet' && (walletCovers || total === null)
      ? 'wallet'
      : chosenPayment === 'online'
        ? 'online'
        : walletCovers
          ? 'wallet'
          : 'online';

  const applyCode = () => {
    const code = discountCode.trim();
    setDiscountNote(null);
    setAppliedCode(code);
  };

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
    if (placingRef.current || !price) return;
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

  const step = !addressId ? 0 : !shippingMethodId && shippingOptions.length > 0 ? 1 : 2;

  const placeRef = useRef(null);
  const placeVisible = useInView(placeRef, [settled]);

  if (ready && !isAuthenticated) {
    // Reached by a link or the back button while signed out: the address
    // list, the wallet and the order itself all need an account.
    return <Navigate to="/login?next=/checkout" replace />;
  }

  if (!ready || !settled) {
    return (
      <div className="container page">
        <div className="skeleton" style={{ height: 360, borderRadius: 16 }} />
      </div>
    );
  }

  const amount = (value) =>
    pricing ? '…' : value === undefined || value === null ? '—' : formatToman(value);
  const canPlace = !!price && !pricing && !quoting;

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
                    <select className="select" name="province" defaultValue="" required>
                      <option value="" disabled>
                        انتخاب کنید…
                      </option>
                      {PROVINCES.map((province) => (
                        <option key={province} value={province}>
                          {province}
                        </option>
                      ))}
                    </select>
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
              <label
                className="option-card"
                data-selected={paymentMethod === 'wallet'}
                data-disabled={!walletCovers}
              >
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'wallet'}
                  disabled={!walletCovers}
                  onChange={() => setChosenPayment('wallet')}
                />
                <div style={{ flex: 1 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <Wallet size={16} />
                    <span className="strong small">کیف پول</span>
                  </div>
                  <div className="tiny muted">
                    {wallet === undefined
                      ? 'در حال دریافت موجودی…'
                      : `موجودی: ${formatToman(wallet?.amount ?? 0)}`}
                    {wallet !== undefined && total !== null && !walletCovers
                      ? ' — برای این سفارش کافی نیست'
                      : ''}
                  </div>
                </div>
              </label>

              <label className="option-card" data-selected={paymentMethod === 'online'}>
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === 'online'}
                  onChange={() => setChosenPayment('online')}
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
                <label
                  className="option-card"
                  data-selected={paymentMethod === 'cod'}
                  data-disabled={!!codRefusal}
                >
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === 'cod'}
                    disabled={!!codRefusal}
                    onChange={() => setChosenPayment('cod')}
                  />
                  <div style={{ flex: 1 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <Banknote size={16} />
                      <span className="strong small">پرداخت در محل</span>
                    </div>
                    <div className="tiny muted">
                      {codRefusal ??
                        `کارمزد دریافت وجه: ${formatToman(selectedShipping.cashOnDeliveryFee ?? 0)}`}
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
              onChange={(event) => {
                setDiscountCode(event.target.value.toUpperCase());
                setDiscountNote(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyCode();
              }}
            />
            <Button variant="soft" onClick={applyCode} aria-label="اعمال کد تخفیف">
              <BadgePercent size={16} />
            </Button>
          </div>
          {discountNote ? (
            <div
              className="tiny"
              style={{ color: `var(--${discountNote.tone}-600)`, marginTop: 6 }}
            >
              {discountNote.text}
            </div>
          ) : null}

          <div className="divider" />

          {priceError ? (
            <div className="small" style={{ color: 'var(--danger-600)', marginBottom: 8 }}>
              {translateError(priceError)}
            </div>
          ) : null}

          <div className="summary-row">
            <span className="muted">قیمت کالاها</span>
            <span>{amount(price?.items_total)}</span>
          </div>
          {Number(price?.discount_amount) > 0 ? (
            <div className="summary-row" style={{ color: 'var(--success-600)' }}>
              <span>تخفیف</span>
              <span>−{amount(price.discount_amount)}</span>
            </div>
          ) : null}
          <div className="summary-row">
            <span className="muted">هزینه ارسال</span>
            <span>
              {price && !pricing && price.shipping_cost === 0
                ? 'رایگان'
                : amount(price?.shipping_cost)}
            </span>
          </div>
          {Number(price?.cod_fee) > 0 ? (
            <div className="summary-row">
              <span className="muted">کارمزد پرداخت در محل</span>
              <span>{amount(price.cod_fee)}</span>
            </div>
          ) : null}
          <div className="summary-row">
            <span className="muted">مالیات بر ارزش افزوده</span>
            <span>{amount(price?.tax_amount)}</span>
          </div>

          <div className="summary-row summary-total">
            <span>مبلغ قابل پرداخت</span>
            <span>{amount(price?.total_price)}</span>
          </div>

          <div ref={placeRef}>
            <Button
              variant="primary"
              block
              size="lg"
              style={{ marginTop: 14 }}
              loading={placing}
              disabled={!canPlace}
              onClick={placeOrder}
            >
              {paymentMethod === 'wallet'
                ? 'پرداخت از کیف پول و ثبت سفارش'
                : paymentMethod === 'cod'
                  ? 'ثبت سفارش (پرداخت در محل)'
                  : 'ثبت سفارش و پرداخت'}
            </Button>
          </div>
        </div>
      </div>

      <div className="mobile-bar" data-hidden={placeVisible} aria-hidden={placeVisible}>
        <div className="mobile-bar-info">
          <span className="tiny muted">مبلغ قابل پرداخت</span>
          <span className="strong nowrap">{amount(price?.total_price)}</span>
        </div>
        <Button
          variant="primary"
          loading={placing}
          disabled={!canPlace}
          onClick={placeOrder}
          tabIndex={placeVisible ? -1 : 0}
        >
          ثبت سفارش
        </Button>
      </div>
    </div>
  );
}
