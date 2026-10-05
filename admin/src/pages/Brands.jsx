import { useCallback, useEffect, useState, useRef } from 'react';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
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

export default function Brands() {
  const toast = useToast();
  const fieldErrors = useFieldErrors();
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  // Tracked separately from the data so a dead connection is not rendered as
  // an empty table - the two look identical to the admin otherwise.
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(null);
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
    api
      .get('/brands')
      .then((data) => setBrands(data?.items ?? data ?? []))
      .catch(() => {
        setBrands([]);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const save = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      title: form.get('title'),
      ...(form.get('slug') ? { slug: form.get('slug') } : {}),
      ...(form.get('description') ? { description: form.get('description') } : {}),
    };
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      if (editing.id) {
        await api.patch(`/brands/${editing.id}`, payload, { auth: true });
      } else {
        await api.post('/brands', payload, { auth: true });
      }
      toast.success('برند ذخیره شد');
      fieldErrors.clear();
      setEditing(null);
      load();
    } catch (error) {
      if (fieldErrors.capture(error, ['title', 'slug', 'description'])) {
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
      await api.delete(`/brands/${removing.id}`, undefined, { auth: true });
      toast.success('برند حذف شد');
      setRemoving(null);
      load();
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  return (
    <>
      <div className="toolbar">
        <span className="small muted">
          {brands.length.toLocaleString('fa-IR')} برند
        </span>
        <Button style={{ marginInlineStart: 'auto' }} onClick={() => setEditing({})}>
          <Plus size={16} />
          برند جدید
        </Button>
      </div>

      <section className="card">
        {loading ? (
          <TableSkeleton cols={3} />
        ) : failed ? (
          <ConnectionError onRetry={load} />
        ) : brands.length === 0 ? (
          <EmptyState icon={<Tags size={26} />} title="برندی ثبت نشده است" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>عنوان</th>
                  <th>شناسه (slug)</th>
                  <th>توضیح</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {brands.map((brand) => (
                  <tr key={brand.id}>
                    <td className="strong small">{brand.title}</td>
                    <td className="tiny muted">{brand.slug}</td>
                    <td className="small muted">{brand.description ?? '—'}</td>
                    <td>
                      <div className="cell-actions">
                        <button className="icon-btn" onClick={() => setEditing(brand)}>
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => setRemoving(brand)}
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
          title={editing.id ? 'ویرایش برند' : 'برند جدید'}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={save}
            onInput={(event) => fieldErrors.clearField(event.target.name)} className="stack" id="brand-form">
            <Field label="عنوان"
            error={fieldErrors.of('title')}>
              <input className="input" name="title" defaultValue={editing.title} required />
            </Field>
            <Field label="شناسه (slug)"
            error={fieldErrors.of('slug')} hint="خالی بگذارید تا از عنوان ساخته شود">
              <input className="input" name="slug" defaultValue={editing.slug} />
            </Field>
            <Field label="توضیح"
            error={fieldErrors.of('description')}>
              <textarea
                className="textarea"
                name="description"
                defaultValue={editing.description ?? ''}
              />
            </Field>
            <Button type="submit" loading={saving}>
              ذخیره
            </Button>
          </form>
        </Modal>
      ) : null}

      {removing ? (
        <Confirm
          title="حذف برند"
          message={`«${removing.title}» حذف شود؟`}
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </>
  );
}
