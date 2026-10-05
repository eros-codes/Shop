import { useCallback, useEffect, useState, useRef } from 'react';
import { Pencil, Plus, Sliders, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import {
  Button,
  Confirm,
  EmptyState,
  Field,
  Modal,
  TableSkeleton,
} from '../components/Primitives';

const TYPES = {
  select: 'انتخابی',
  color: 'رنگ',
  number: 'عددی',
  text: 'متنی',
  boolean: 'بله / خیر',
};

export default function Attributes() {
  const toast = useToast();
  const [attributes, setAttributes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [optionsFor, setOptionsFor] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [saving, setSaving] = useState(false);
  // setSaving only disables the button on the next render, so clicks landing
  // in the same React tick all get through. This ref closes that window - it
  // matters because a repeated submit fires side effects again and can leave
  // duplicate rows wherever the database has no unique constraint.
  const busyRef = useRef(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/attributes')
      .then((data) => setAttributes(data ?? []))
      .catch(() => setAttributes([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const save = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      title: form.get('title'),
      ...(form.get('code') ? { code: form.get('code') } : {}),
      type: form.get('type'),
      ...(form.get('unit') ? { unit: form.get('unit') } : {}),
      is_variant_axis: form.get('is_variant_axis') === 'on',
      is_filterable: form.get('is_filterable') === 'on',
    };
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      if (editing.id) {
        await api.patch(`/attributes/${editing.id}`, payload, { auth: true });
      } else {
        await api.post('/attributes', payload, { auth: true });
      }
      toast.success('ویژگی ذخیره شد');
      setEditing(null);
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
      await api.delete(`/attributes/${removing.id}`, undefined, { auth: true });
      toast.success('ویژگی حذف شد');
      setRemoving(null);
      load();
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  const addOption = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      value: form.get('value'),
      ...(form.get('slug') ? { slug: form.get('slug') } : {}),
      ...(form.get('hex') ? { hex: form.get('hex') } : {}),
      ...(form.get('sort_order') ? { sort_order: Number(form.get('sort_order')) } : {}),
    };
    try {
      await api.post(`/attributes/${optionsFor.id}/options`, payload, { auth: true });
      const refreshed = await api.get(`/attributes/${optionsFor.id}`);
      setOptionsFor(refreshed);
      load();
      event.target.reset();
      toast.success('مقدار اضافه شد');
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  const removeOption = async (optionId) => {
    try {
      await api.delete(
        `/attributes/${optionsFor.id}/options/${optionId}`,
        undefined,
        { auth: true },
      );
      const refreshed = await api.get(`/attributes/${optionsFor.id}`);
      setOptionsFor(refreshed);
      load();
      toast.success('مقدار حذف شد');
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  return (
    <>
      <div className="toolbar">
        <span className="small muted">
          {attributes.length.toLocaleString('fa-IR')} ویژگی
        </span>
        <Button
          style={{ marginInlineStart: 'auto' }}
          onClick={() => setEditing({ type: 'select', is_filterable: true })}
        >
          <Plus size={16} />
          ویژگی جدید
        </Button>
      </div>

      <section className="card">
        {loading ? (
          <TableSkeleton cols={5} />
        ) : attributes.length === 0 ? (
          <EmptyState
            icon={<Sliders size={26} />}
            title="هنوز ویژگی‌ای تعریف نشده"
            description="رنگ، سایز، حافظه… همان‌هایی که کالا با آن‌ها فروخته می‌شود."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>عنوان</th>
                  <th>نوع</th>
                  <th>نقش</th>
                  <th>مقادیر</th>
                  <th>فیلتر</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {attributes.map((attribute) => (
                  <tr key={attribute.id}>
                    <td>
                      <div className="strong small">{attribute.title}</div>
                      <div className="tiny muted">
                        {attribute.code}
                        {attribute.unit ? ` — ${attribute.unit}` : ''}
                      </div>
                    </td>
                    <td className="small">{TYPES[attribute.type] ?? attribute.type}</td>
                    <td>
                      <span
                        className={`badge badge-${attribute.is_variant_axis ? '' : 'muted'}`}
                      >
                        {attribute.is_variant_axis ? 'محور تنوع' : 'توصیفی'}
                      </span>
                    </td>
                    <td className="small">
                      {(attribute.options ?? []).length > 0 ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setOptionsFor(attribute)}
                        >
                          {(attribute.options ?? []).length.toLocaleString('fa-IR')} مقدار
                        </button>
                      ) : (
                        <button
                          className="btn btn-soft btn-sm"
                          onClick={() => setOptionsFor(attribute)}
                        >
                          افزودن مقدار
                        </button>
                      )}
                    </td>
                    <td className="small">{attribute.is_filterable ? 'دارد' : '—'}</td>
                    <td>
                      <div className="cell-actions">
                        <button className="icon-btn" onClick={() => setEditing(attribute)}>
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => setRemoving(attribute)}
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
          title={editing.id ? 'ویرایش ویژگی' : 'ویژگی جدید'}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={save} className="stack">
            <div className="grid cols-2">
              <Field label="عنوان">
                <input className="input" name="title" defaultValue={editing.title} required />
              </Field>
              <Field label="کد" hint="خالی = از عنوان ساخته می‌شود">
                <input className="input" name="code" defaultValue={editing.code} />
              </Field>
            </div>

            <div className="grid cols-2">
              <Field label="نوع">
                <select className="select" name="type" defaultValue={editing.type ?? 'select'}>
                  {Object.entries(TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="واحد" hint="مثلاً GB یا میلی‌لیتر">
                <input className="input" name="unit" defaultValue={editing.unit ?? ''} />
              </Field>
            </div>

            <label className="checkbox">
              <input
                type="checkbox"
                name="is_variant_axis"
                defaultChecked={editing.is_variant_axis}
              />
              محور تنوع است (موجودی و قیمت را تقسیم می‌کند)
            </label>
            <p className="tiny muted" style={{ marginTop: -6 }}>
              فقط ویژگی‌های «انتخابی» و «رنگ» می‌توانند محور باشند؛ محور به فهرست
              ثابتی از مقادیر نیاز دارد.
            </p>

            <label className="checkbox">
              <input
                type="checkbox"
                name="is_filterable"
                defaultChecked={editing.is_filterable ?? true}
              />
              در فیلترهای فروشگاه نمایش داده شود
            </label>

            <Button type="submit" loading={saving}>
              ذخیره
            </Button>
          </form>
        </Modal>
      ) : null}

      {optionsFor ? (
        <Modal
          title={`مقادیر «${optionsFor.title}»`}
          onClose={() => setOptionsFor(null)}
        >
          <div className="stack">
            {(optionsFor.options ?? []).length === 0 ? (
              <p className="small muted">هنوز مقداری تعریف نشده است.</p>
            ) : (
              (optionsFor.options ?? []).map((option) => (
                <div className="spread card card-pad" key={option.id}>
                  <div className="row" style={{ gap: 9 }}>
                    {option.hex ? (
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          background: option.hex,
                          border: '1px solid var(--line-strong)',
                        }}
                      />
                    ) : null}
                    <div>
                      <div className="small strong">{option.value}</div>
                      <div className="tiny muted">
                        {option.slug}
                        {option.sort_order
                          ? ` — ترتیب ${option.sort_order.toLocaleString('fa-IR')}`
                          : ''}
                      </div>
                    </div>
                  </div>
                  <button
                    className="icon-btn danger"
                    onClick={() => removeOption(option.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}

            <div className="divider" />

            <form onSubmit={addOption} className="stack">
              <div className="grid cols-2">
                <Field label="مقدار">
                  <input className="input" name="value" required />
                </Field>
                <Field label="ترتیب نمایش" hint="سایزها الفبایی مرتب نمی‌شوند">
                  <input className="input" name="sort_order" inputMode="numeric" />
                </Field>
              </div>
              <div className="grid cols-2">
                <Field label="کد (slug)">
                  <input className="input" name="slug" />
                </Field>
                <Field label="کد رنگ" hint="برای ویژگی‌های رنگ، مثل ‎#1d4ed8">
                  <input className="input" name="hex" placeholder="#000000" />
                </Field>
              </div>
              <Button type="submit" variant="soft">
                <Plus size={15} />
                افزودن مقدار
              </Button>
            </form>
          </div>
        </Modal>
      ) : null}

      {removing ? (
        <Confirm
          title="حذف ویژگی"
          message={`«${removing.title}» حذف شود؟ ویژگی‌ای که گزینه‌های کالا بر پایه‌اش ساخته شده حذف نمی‌شود.`}
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </>
  );
}
