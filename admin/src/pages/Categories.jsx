import { useCallback, useEffect, useState, useRef } from 'react';
import { FolderTree, Pencil, Plus, Sliders, Trash2 } from 'lucide-react';
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

function flatten(nodes, depth = 0, out = []) {
  (nodes ?? []).forEach((node) => {
    out.push({ ...node, depth });
    flatten(node.children, depth + 1, out);
  });
  return out;
}

export default function Categories() {
  const toast = useToast();
  const [tree, setTree] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [attributesFor, setAttributesFor] = useState(null);
  const [links, setLinks] = useState([]);
  const [saving, setSaving] = useState(false);
  // setSaving only disables the button on the next render, so clicks landing
  // in the same React tick all get through. This ref closes that window - it
  // matters because a repeated submit fires side effects again and can leave
  // duplicate rows wherever the database has no unique constraint.
  const busyRef = useRef(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/categories/tree')
      .then((data) => setTree(data ?? []))
      .catch(() => setTree([]))
      .finally(() => setLoading(false));
    api.get('/attributes').then(setAttributes).catch(() => {});
  }, []);

  useEffect(load, [load]);

  const rows = flatten(tree);

  const save = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      title: form.get('title'),
      ...(form.get('slug') ? { slug: form.get('slug') } : {}),
      ...(form.get('parentId') ? { parentId: Number(form.get('parentId')) } : {}),
    };
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      if (editing.id) {
        await api.patch(`/categories/${editing.id}`, payload, { auth: true });
      } else {
        await api.post('/categories', payload, { auth: true });
      }
      toast.success('دسته‌بندی ذخیره شد');
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
      await api.delete(`/categories/remove/${removing.id}`, undefined, { auth: true });
      toast.success('دسته‌بندی حذف شد');
      setRemoving(null);
      load();
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  const openAttributes = async (category) => {
    setAttributesFor(category);
    try {
      const data = await api.get(`/categories/${category.id}/attributes`);
      setLinks(data ?? []);
    } catch {
      setLinks([]);
    }
  };

  const attach = async (attributeId, isRequired) => {
    try {
      const data = await api.post(
        `/categories/${attributesFor.id}/attributes`,
        { attributeId: Number(attributeId), is_required: isRequired },
        { auth: true },
      );
      setLinks(data ?? []);
      toast.success('ویژگی به دسته‌بندی وصل شد');
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  const detach = async (attributeId) => {
    try {
      await api.delete(
        `/categories/${attributesFor.id}/attributes/${attributeId}`,
        undefined,
        { auth: true },
      );
      setLinks((current) => current.filter((link) => link.attribute.id !== attributeId));
      toast.success('ویژگی جدا شd');
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  return (
    <>
      <div className="toolbar">
        <span className="small muted">
          {rows.length.toLocaleString('fa-IR')} دسته‌بندی
        </span>
        <Button style={{ marginInlineStart: 'auto' }} onClick={() => setEditing({})}>
          <Plus size={16} />
          دسته‌بندی جدید
        </Button>
      </div>

      <section className="card">
        {loading ? (
          <TableSkeleton cols={3} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<FolderTree size={26} />} title="دسته‌بندی ثبت نشده است" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>عنوان</th>
                  <th>شناسه</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <span
                        className="small"
                        style={{ paddingInlineStart: category.depth * 20 }}
                      >
                        {category.depth > 0 ? '↳ ' : ''}
                        <span className="strong">{category.title}</span>
                      </span>
                    </td>
                    <td className="tiny muted">{category.slug}</td>
                    <td>
                      <div className="cell-actions">
                        <button
                          className="icon-btn"
                          title="ویژگی‌های این دسته"
                          onClick={() => openAttributes(category)}
                        >
                          <Sliders size={15} />
                        </button>
                        <button className="icon-btn" onClick={() => setEditing(category)}>
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => setRemoving(category)}
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
          title={editing.id ? 'ویرایش دسته‌بندی' : 'دسته‌بندی جدید'}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={save} className="stack">
            <Field label="عنوان">
              <input className="input" name="title" defaultValue={editing.title} required />
            </Field>
            <Field label="شناسه (slug)" hint="خالی بگذارید تا از عنوان ساخته شود">
              <input className="input" name="slug" defaultValue={editing.slug} />
            </Field>
            <Field label="دسته‌بندی والد">
              <select
                className="select"
                name="parentId"
                defaultValue={editing.parent?.id ?? ''}
              >
                <option value="">بدون والد (سطح اول)</option>
                {rows
                  .filter((row) => row.id !== editing.id)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {'— '.repeat(row.depth)}
                      {row.title}
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

      {attributesFor ? (
        <Modal
          title={`ویژگی‌های «${attributesFor.title}»`}
          onClose={() => setAttributesFor(null)}
        >
          <div className="stack">
            <p className="tiny muted">
              ویژگی‌هایی که فرم ساخت کالا در این دسته می‌پرسد. ویژگی «اجباری» باید
              برای هر گزینه‌ی کالا انتخاب شود.
            </p>

            {links.length === 0 ? (
              <p className="small muted">هنوز ویژگی‌ای وصل نشده است.</p>
            ) : (
              links.map((link) => (
                <div className="spread card card-pad" key={link.id}>
                  <div>
                    <div className="small strong">{link.attribute.title}</div>
                    <div className="tiny muted">
                      {link.attribute.is_variant_axis ? 'محور تنوع' : 'توصیفی'}
                      {link.is_required ? ' — اجباری' : ''}
                    </div>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => detach(link.attribute.id)}
                  >
                    جدا کردن
                  </Button>
                </div>
              ))
            )}

            <div className="divider" />

            <form
              className="row"
              style={{ gap: 8 }}
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                if (!form.get('attributeId')) return;
                attach(form.get('attributeId'), form.get('required') === 'on');
                event.currentTarget.reset();
              }}
            >
              <select className="select" name="attributeId" style={{ flex: 1 }}>
                <option value="">ویژگی را انتخاب کنید…</option>
                {attributes
                  .filter(
                    (attribute) =>
                      !links.some((link) => link.attribute.id === attribute.id),
                  )
                  .map((attribute) => (
                    <option key={attribute.id} value={attribute.id}>
                      {attribute.title}
                    </option>
                  ))}
              </select>
              <label className="checkbox">
                <input type="checkbox" name="required" />
                اجباری
              </label>
              <Button type="submit" size="sm">
                افزودن
              </Button>
            </form>
          </div>
        </Modal>
      ) : null}

      {removing ? (
        <Confirm
          title="حذف دسته‌بندی"
          message={`«${removing.title}» حذف شود؟ دسته‌ای که زیرمجموعه دارد حذف نمی‌شود.`}
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </>
  );
}
