import { useCallback, useEffect, useState, useRef } from 'react';
import { MapPin, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { formatToman, numberOrNull, toPersianDigits } from '../lib/format';
import { PROVINCES } from '../lib/provinces';
import {
  Button,
  Confirm,
  ConnectionError,
  EmptyState,
  Field,
  Modal,
  TableSkeleton,
} from '../components/Primitives';

export default function Shipping() {
  const toast = useToast();
  const [methods, setMethods] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [methodForm, setMethodForm] = useState(null);
  const [zoneForm, setZoneForm] = useState(null);
  const [rateForm, setRateForm] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [saving, setSaving] = useState(false);
  // setSaving only disables the button on the next render, so clicks landing
  // in the same React tick all get through. This ref closes that window - it
  // matters because a repeated submit fires side effects again and can leave
  // duplicate rows wherever the database has no unique constraint.
  const busyRef = useRef(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    Promise.allSettled([api.get('/shipping/methods'), api.get('/shipping/zones')])
      .then(([methodsResult, zonesResult]) => {
        if (methodsResult.status === 'fulfilled') setMethods(methodsResult.value ?? []);
        if (zonesResult.status === 'fulfilled') setZones(zonesResult.value ?? []);
        setFailed(methodsResult.status === 'rejected' && zonesResult.status === 'rejected');
      })
      .finally(() => setLoading(false));
  }, []);

  // Which zone each province is in already, to say so in the picker - a
  // province in two zones is priced by whichever comes first.
  const zoneOfProvince = new Map();
  zones.forEach((zone) =>
    (zone.provinces ?? []).forEach((province) => zoneOfProvince.set(province, zone)),
  );

  useEffect(load, [load]);

  const saveMethod = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      title: form.get('title'),
      ...(form.get('code') ? { code: form.get('code') } : {}),
      estimated_days_min: numberOrNull(form.get('estimated_days_min')) ?? 0,
      estimated_days_max: numberOrNull(form.get('estimated_days_max')) ?? 0,
      supports_cash_on_delivery: form.get('cod') === 'on',
      is_active: form.get('is_active') === 'on',
    };
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      if (methodForm.id) {
        await api.patch(`/shipping/methods/${methodForm.id}`, payload, { auth: true });
      } else {
        await api.post('/shipping/methods', payload, { auth: true });
      }
      toast.success('روش ارسال ذخیره شد');
      setMethodForm(null);
      load();
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const saveZone = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // Picked from the same list the storefront's address form offers. The
    // box used to be free text split on "," - and the form filled it back
    // in joined with "، ". Saving a zone without touching it turned
    // "تهران، البرز" into one province by that name, which no address
    // matches, and the zone's orders fell through to the default price.
    const payload = {
      title: form.get('title'),
      provinces: form.getAll('provinces').map(String),
      is_default: form.get('is_default') === 'on',
    };
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      if (zoneForm.id) {
        await api.patch(`/shipping/zones/${zoneForm.id}`, payload, { auth: true });
      } else {
        await api.post('/shipping/zones', payload, { auth: true });
      }
      toast.success('منطقه ذخیره شد');
      setZoneForm(null);
      load();
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const saveRate = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      zoneId: Number(form.get('zoneId')),
      base_cost: numberOrNull(form.get('base_cost')) ?? 0,
      per_kg_cost: numberOrNull(form.get('per_kg_cost')) ?? 0,
      // null, not left out: emptying the box on an existing rate has to
      // turn free shipping off, and leaving it out kept the old threshold.
      free_shipping_threshold: numberOrNull(form.get('free_shipping_threshold')),
      cash_on_delivery_fee: numberOrNull(form.get('cash_on_delivery_fee')) ?? 0,
    };
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      await api.post(`/shipping/methods/${rateForm.method.id}/rates`, payload, {
        auth: true,
      });
      toast.success('نرخ ذخیره شد');
      setRateForm(null);
      load();
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(removing.path, undefined, { auth: true });
      toast.success('حذف شد');
      setRemoving(null);
      load();
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  if (loading) {
    return (
      <section className="card">
        <TableSkeleton cols={4} />
      </section>
    );
  }

  if (failed) {
    return (
      <section className="card">
        <ConnectionError onRetry={load} />
      </section>
    );
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card">
        <div className="card-head">
          <h2 className="card-title">
            <span className="row" style={{ gap: 8 }}>
              <MapPin size={17} color="var(--brand-600)" />
              مناطق ارسال
            </span>
          </h2>
          <Button size="sm" onClick={() => setZoneForm({})}>
            <Plus size={15} />
            منطقه جدید
          </Button>
        </div>

        {zones.length === 0 ? (
          <EmptyState
            title="منطقه‌ای تعریف نشده"
            description="یک منطقه پیش‌فرض بسازید تا سفارش‌های سایر شهرها هم قیمت بخورند."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>عنوان</th>
                  <th>استان‌ها</th>
                  <th>پیش‌فرض</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id}>
                    <td className="strong small">{zone.title}</td>
                    <td className="small muted">
                      {(zone.provinces ?? []).join('، ') || 'سایر مناطق'}
                    </td>
                    <td>
                      {zone.is_default ? (
                        <span className="badge badge-success">پیش‌فرض</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="cell-actions">
                        <button className="icon-btn" onClick={() => setZoneForm(zone)}>
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() =>
                            setRemoving({
                              path: `/shipping/zones/${zone.id}`,
                              label: zone.title,
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">
            <span className="row" style={{ gap: 8 }}>
              <Truck size={17} color="var(--brand-600)" />
              روش‌های ارسال
            </span>
          </h2>
          <Button size="sm" onClick={() => setMethodForm({})}>
            <Plus size={15} />
            روش جدید
          </Button>
        </div>

        {methods.length === 0 ? (
          <EmptyState title="روش ارسالی تعریف نشده" />
        ) : (
          <div className="stack card-pad" style={{ gap: 14 }}>
            {methods.map((method) => (
              <div className="card card-pad" key={method.id}>
                <div className="spread wrap">
                  <div>
                    <div className="strong">
                      {method.title}
                      {!method.is_active ? (
                        <span className="badge badge-muted" style={{ marginInlineStart: 8 }}>
                          غیرفعال
                        </span>
                      ) : null}
                      {method.supports_cash_on_delivery ? (
                        <span className="badge" style={{ marginInlineStart: 8 }}>
                          پرداخت در محل
                        </span>
                      ) : null}
                    </div>
                    <div className="tiny muted">
                      {method.code} — تحویل {toPersianDigits(method.estimated_days_min)} تا{' '}
                      {toPersianDigits(method.estimated_days_max)} روز کاری
                    </div>
                  </div>

                  <div className="row" style={{ gap: 6 }}>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => setRateForm({ method })}
                    >
                      <Plus size={14} />
                      نرخ
                    </Button>
                    <button className="icon-btn" onClick={() => setMethodForm(method)}>
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={() =>
                        setRemoving({
                          path: `/shipping/methods/${method.id}`,
                          label: method.title,
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {(method.rates ?? []).length > 0 ? (
                  <div className="table-wrap" style={{ marginTop: 12 }}>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>منطقه</th>
                          <th>هزینه پایه</th>
                          <th>هر کیلو اضافه</th>
                          <th>سقف ارسال رایگان</th>
                          <th>کارمزد پرداخت در محل</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {method.rates.map((rate) => (
                          <tr key={rate.id}>
                            <td className="small">{rate.zone?.title}</td>
                            <td className="small">{formatToman(rate.base_cost)}</td>
                            <td className="small">{formatToman(rate.per_kg_cost)}</td>
                            <td className="small">
                              {rate.free_shipping_threshold
                                ? formatToman(rate.free_shipping_threshold)
                                : '—'}
                            </td>
                            <td className="small">
                              {formatToman(rate.cash_on_delivery_fee)}
                            </td>
                            <td>
                              <div className="cell-actions">
                                <button
                                  className="icon-btn"
                                  title="ویرایش نرخ"
                                  onClick={() => setRateForm({ method, rate })}
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  className="icon-btn danger"
                                  onClick={() =>
                                    setRemoving({
                                      path: `/shipping/methods/${method.id}/rates/${rate.id}`,
                                      label: `نرخ ${rate.zone?.title}`,
                                    })
                                  }
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="tiny muted" style={{ marginTop: 10 }}>
                    برای این روش هنوز نرخی تعریف نشده؛ تا نرخ نداشته باشد در checkout
                    نمایش داده نمی‌شود.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {methodForm ? (
        <Modal
          title={methodForm.id ? 'ویرایش روش ارسال' : 'روش ارسال جدید'}
          onClose={() => setMethodForm(null)}
        >
          <form onSubmit={saveMethod} className="stack">
            <div className="grid cols-2">
              <Field label="عنوان">
                <input className="input" name="title" defaultValue={methodForm.title} required />
              </Field>
              <Field label="کد" hint="خالی = از عنوان ساخته می‌شود">
                <input className="input" name="code" defaultValue={methodForm.code} />
              </Field>
            </div>
            <div className="grid cols-2">
              <Field label="حداقل روز تحویل">
                <input
                  className="input"
                  name="estimated_days_min"
                  inputMode="numeric"
                  defaultValue={methodForm.estimated_days_min ?? 2}
                />
              </Field>
              <Field label="حداکثر روز تحویل">
                <input
                  className="input"
                  name="estimated_days_max"
                  inputMode="numeric"
                  defaultValue={methodForm.estimated_days_max ?? 4}
                />
              </Field>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                name="cod"
                defaultChecked={methodForm.supports_cash_on_delivery}
              />
              پرداخت در محل را پشتیبانی می‌کند
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={methodForm.is_active ?? true}
              />
              فعال باشد
            </label>
            <Button type="submit" loading={saving}>
              ذخیره
            </Button>
          </form>
        </Modal>
      ) : null}

      {zoneForm ? (
        <Modal
          title={zoneForm.id ? 'ویرایش منطقه' : 'منطقه جدید'}
          onClose={() => setZoneForm(null)}
        >
          <form onSubmit={saveZone} className="stack">
            <Field label="عنوان">
              <input className="input" name="title" defaultValue={zoneForm.title} required />
            </Field>
            <div className="field">
              <span className="field-label">استان‌ها</span>
              <div className="province-grid">
                {[
                  ...PROVINCES,
                  // A name typed in before this list existed is kept, and
                  // shown, rather than silently dropped on save.
                  ...(zoneForm.provinces ?? []).filter((name) => !PROVINCES.includes(name)),
                ].map((province) => {
                  const other = zoneOfProvince.get(province);
                  const elsewhere = other && other.id !== zoneForm.id ? other.title : null;
                  return (
                    <label className="checkbox" key={province}>
                      <input
                        type="checkbox"
                        name="provinces"
                        value={province}
                        defaultChecked={(zoneForm.provinces ?? []).includes(province)}
                      />
                      <span>
                        {province}
                        {!PROVINCES.includes(province) ? (
                          <span className="tiny" style={{ color: 'var(--danger-600)' }}>
                            {' '}(خارج از فهرست استان‌ها)
                          </span>
                        ) : elsewhere ? (
                          <span className="tiny muted"> ({elsewhere})</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              <span className="field-hint">
                هزینه‌ی ارسال هر آدرس از منطقه‌ای خوانده می‌شود که استانش در آن است.
              </span>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                name="is_default"
                defaultChecked={zoneForm.is_default}
              />
              منطقه پیش‌فرض (برای استان‌هایی که در هیچ منطقه‌ای نیستند)
            </label>
            <Button type="submit" loading={saving}>
              ذخیره
            </Button>
          </form>
        </Modal>
      ) : null}

      {rateForm ? (
        <Modal
          title={`نرخ ارسال برای «${rateForm.method.title}»`}
          onClose={() => setRateForm(null)}
        >
          <form onSubmit={saveRate} className="stack">
            <Field label="منطقه">
              <select
                className="select"
                name="zoneId"
                defaultValue={rateForm.rate?.zone?.id ?? zones[0]?.id}
                required
              >
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.title}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid cols-2">
              <Field label="هزینه پایه (تومان)" hint="شامل کیلوی اول">
                <input
                  className="input"
                  name="base_cost"
                  inputMode="numeric"
                  defaultValue={rateForm.rate?.base_cost ?? ''}
                  required
                />
              </Field>
              <Field label="هزینه هر کیلوی اضافه">
                <input
                  className="input"
                  name="per_kg_cost"
                  inputMode="numeric"
                  defaultValue={rateForm.rate?.per_kg_cost ?? ''}
                />
              </Field>
            </div>
            <div className="grid cols-2">
              <Field label="سقف ارسال رایگان" hint="خالی = بدون ارسال رایگان">
                <input
                  className="input"
                  name="free_shipping_threshold"
                  inputMode="numeric"
                  defaultValue={rateForm.rate?.free_shipping_threshold ?? ''}
                />
              </Field>
              <Field label="کارمزد پرداخت در محل">
                <input
                  className="input"
                  name="cash_on_delivery_fee"
                  inputMode="numeric"
                  defaultValue={rateForm.rate?.cash_on_delivery_fee ?? ''}
                />
              </Field>
            </div>
            <p className="tiny muted">
              فرستادن دوباره‌ی همین منطقه، نرخ موجود را به‌روز می‌کند.
            </p>
            <Button type="submit" loading={saving}>
              ذخیره نرخ
            </Button>
          </form>
        </Modal>
      ) : null}

      {removing ? (
        <Confirm
          title="حذف"
          message={`«${removing.label}» حذف شود؟`}
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </div>
  );
}
