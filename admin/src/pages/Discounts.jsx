import { useCallback, useEffect, useState, useRef } from 'react';
import { Percent, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { formatDate, formatToman } from '../lib/format';
import { useFieldErrors } from '../lib/useFieldErrors';
import {
  Button,
  Confirm,
  ConnectionError,
  EmptyState,
  Field,
  Modal,
  TableSkeleton,
} from '../components/Primitives';

const toDateInput = (value) => (value ? String(value).slice(0, 10) : '');

export default function Discounts() {
  const toast = useToast();
  const fieldErrors = useFieldErrors();
  const [codes, setCodes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  // Tracked separately from the data so a dead connection is not rendered as
  // an empty table - the two look identical to the admin otherwise.
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [type, setType] = useState('percent');
  const [saving, setSaving] = useState(false);
  // setSaving only disables the button on the next render, so clicks landing
  // in the same React tick all get through. This ref closes that window - it
  // matters because a repeated submit fires side effects again and can leave
  // duplicate rows wherever the database has no unique constraint.
  const busyRef = useRef(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    api
      .get('/discount-codes?limit=100', { auth: true })
      .then((data) => setCodes(data?.items ?? data ?? []))
      .catch(() => {
        setCodes([]);
        setFailed(true);
      })
      .finally(() => setLoading(false));
    api.get('/categories').then((data) => setCategories(data?.items ?? data ?? [])).catch(() => {});
  }, []);

  useEffect(load, [load]);

  const save = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      code: String(form.get('code') ?? '').toUpperCase(),
      capacity: Number(form.get('capacity')),
      type,
      ...(type === 'percent'
        ? { off_percent: Number(form.get('off_percent')) }
        : { off_amount: Number(form.get('off_amount')) }),
      ...(form.get('max_discount_amount')
        ? { max_discount_amount: Number(form.get('max_discount_amount')) }
        : {}),
      ...(form.get('min_order_amount')
        ? { min_order_amount: Number(form.get('min_order_amount')) }
        : {}),
      ...(form.get('per_user_limit')
        ? { per_user_limit: Number(form.get('per_user_limit')) }
        : {}),
      ...(form.get('starts_at')
        ? { starts_at: new Date(form.get('starts_at')).toISOString() }
        : {}),
      ...(form.get('expires_at')
        ? { expires_at: new Date(form.get('expires_at')).toISOString() }
        : {}),
      categoryIds: [...(form.getAll('categoryIds') ?? [])].map(Number).filter(Boolean),
    };

    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      if (editing.id) {
        await api.patch(`/discount-codes/${editing.id}`, payload, { auth: true });
      } else {
        await api.post('/discount-codes', payload, { auth: true });
      }
      toast.success('کد تخفیف ذخیره شد');
      fieldErrors.clear();
      setEditing(null);
      load();
    } catch (error) {
      if (fieldErrors.capture(error, ['code', 'type', 'capacity', 'off_percent', 'off_amount', 'max_discount_amount', 'min_order_amount', 'starts_at', 'expires_at', 'per_user_limit'])) {
        toast.error('چند مورد از فرم نیاز به اصلاح دارد.');
      } else {
        toast.error(translateError(error));
      }
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/discount-codes/${removing.id}`, undefined, { auth: true });
      toast.success('کد تخفیف حذف شد');
      setRemoving(null);
      load();
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  return (
    <>
      <div className="toolbar">
        <span className="small muted">{codes.length.toLocaleString('fa-IR')} کد</span>
        <Button
          style={{ marginInlineStart: 'auto' }}
          onClick={() => {
            setType('percent');
            setEditing({});
          }}
        >
          <Plus size={16} />
          کد تخفیف جدید
        </Button>
      </div>

      <section className="card">
        {loading ? (
          <TableSkeleton cols={6} />
        ) : failed ? (
          <ConnectionError onRetry={load} />
        ) : codes.length === 0 ? (
          <EmptyState icon={<Percent size={26} />} title="کد تخفیفی ثبت نشده است" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>کد</th>
                  <th>تخفیف</th>
                  <th>شرط‌ها</th>
                  <th>ظرفیت</th>
                  <th>بازه</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => (
                  <tr key={code.id}>
                    <td className="strong">{code.code}</td>
                    <td className="small">
                      {code.type === 'fixed'
                        ? formatToman(code.off_amount)
                        : `٪${code.off_percent}`}
                      {code.max_discount_amount ? (
                        <div className="tiny muted">
                          سقف {formatToman(code.max_discount_amount)}
                        </div>
                      ) : null}
                    </td>
                    <td className="tiny muted">
                      {code.min_order_amount
                        ? `حداقل سبد ${formatToman(code.min_order_amount)}`
                        : '—'}
                      {code.per_user_limit
                        ? ` · هر کاربر ${code.per_user_limit.toLocaleString('fa-IR')} بار`
                        : ''}
                    </td>
                    <td className="small">
                      {Number(code.capacity ?? 0).toLocaleString('fa-IR')}
                    </td>
                    <td className="tiny muted">
                      {code.starts_at || code.expires_at
                        ? `${formatDate(code.starts_at)} تا ${formatDate(code.expires_at)}`
                        : 'بدون محدودیت'}
                    </td>
                    <td>
                      <div className="cell-actions">
                        <button
                          className="icon-btn"
                          onClick={() => {
                            setType(code.type ?? 'percent');
                            setEditing(code);
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => setRemoving(code)}
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

      {editing ? (
        <Modal
          wide
          title={editing.id ? 'ویرایش کد تخفیف' : 'کد تخفیف جدید'}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={save}
            onInput={(event) => fieldErrors.clearField(event.target.name)} className="stack">
            <div className="grid cols-3">
              <Field label="کد"
            error={fieldErrors.of('code')}>
                <input
                  className="input"
                  name="code"
                  defaultValue={editing.code}
                  style={{ textTransform: 'uppercase' }}
                  required
                />
              </Field>
              <Field label="نوع"
            error={fieldErrors.of('type')}>
                <select
                  className="select"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <option value="percent">درصدی</option>
                  <option value="fixed">مبلغ ثابت</option>
                </select>
              </Field>
              <Field label="ظرفیت کل"
            error={fieldErrors.of('capacity')}>
                <input
                  className="input"
                  name="capacity"
                  inputMode="numeric"
                  defaultValue={editing.capacity ?? 100}
                  required
                />
              </Field>
            </div>

            <div className="grid cols-3">
              {type === 'percent' ? (
                <Field label="درصد تخفیف"
            error={fieldErrors.of('off_percent')}>
                  <input
                    className="input"
                    name="off_percent"
                    inputMode="numeric"
                    defaultValue={editing.off_percent ?? 10}
                  />
                </Field>
              ) : (
                <Field label="مبلغ تخفیف (تومان)"
            error={fieldErrors.of('off_amount')}>
                  <input
                    className="input"
                    name="off_amount"
                    inputMode="numeric"
                    defaultValue={editing.off_amount ?? ''}
                  />
                </Field>
              )}

              <Field label="سقف تخفیف"
            error={fieldErrors.of('max_discount_amount')} hint="برای کدهای درصدی">
                <input
                  className="input"
                  name="max_discount_amount"
                  inputMode="numeric"
                  defaultValue={editing.max_discount_amount ?? ''}
                />
              </Field>

              <Field label="حداقل مبلغ سبد"
            error={fieldErrors.of('min_order_amount')}>
                <input
                  className="input"
                  name="min_order_amount"
                  inputMode="numeric"
                  defaultValue={editing.min_order_amount ?? ''}
                />
              </Field>
            </div>

            <div className="grid cols-3">
              <Field label="شروع کمپین"
            error={fieldErrors.of('starts_at')}>
                <input
                  className="input"
                  type="date"
                  name="starts_at"
                  defaultValue={toDateInput(editing.starts_at)}
                />
              </Field>
              <Field label="پایان کمپین"
            error={fieldErrors.of('expires_at')}>
                <input
                  className="input"
                  type="date"
                  name="expires_at"
                  defaultValue={toDateInput(editing.expires_at)}
                />
              </Field>
              <Field label="سقف استفاده هر کاربر"
            error={fieldErrors.of('per_user_limit')}>
                <input
                  className="input"
                  name="per_user_limit"
                  inputMode="numeric"
                  defaultValue={editing.per_user_limit ?? ''}
                />
              </Field>
            </div>

            <Field
              label="محدود به دسته‌بندی‌ها"
              hint="خالی یعنی روی همه‌ی کالاها اعمال می‌شود"
            >
              <select
                className="select"
                name="categoryIds"
                multiple
                style={{ minHeight: 100 }}
                defaultValue={(editing.categories ?? []).map((category) =>
                  String(category.id),
                )}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.title}
                  </option>
                ))}
              </select>
            </Field>

            <Button type="submit" loading={saving}>
              ذخیره
            </Button>
          </form>
        </Modal>
      ) : null}

      {removing ? (
        <Confirm
          title="حذف کد تخفیف"
          message={`کد «${removing.code}» حذف شود؟`}
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </>
  );
}
