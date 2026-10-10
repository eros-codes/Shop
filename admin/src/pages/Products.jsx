import { useCallback, useEffect, useState } from 'react';
import { ImageOff, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, buildQuery } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { coverImage, formatToman } from '../lib/format';
import {
  Button,
  Confirm,
  EmptyState,
  Pagination,
  SearchBox,
  TableSkeleton,
} from '../components/Primitives';
import ProductEditor from './ProductEditor';

export default function Products() {
  const toast = useToast();
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(
        // Drafts too: the public listing hides them, the panel is where
        // they are worked on.
        `/products${buildQuery({
          page,
          limit: 20,
          search: search.trim() || undefined,
          includeDrafts: 'true',
        })}`,
        { auth: true },
      )
      .then((data) =>
        setResult({
          items: data?.items ?? [],
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 1,
        }),
      )
      .catch(() => setResult({ items: [], total: 0, totalPages: 1 }))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const remove = async () => {
    setDeleteLoading(true);
    try {
      await api.delete(`/products/${removing.id}`, undefined, { auth: true });
      toast.success('کالا حذف شد');
      setRemoving(null);
      load();
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <div className="toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="نام کالا…" />
        <span className="small muted">
          {result.total.toLocaleString('fa-IR')} کالا
        </span>
        <Button
          style={{ marginInlineStart: 'auto' }}
          onClick={() => setEditing({ mode: 'create' })}
        >
          <Plus size={16} />
          کالای جدید
        </Button>
      </div>

      <section className="card">
        {loading ? (
          <TableSkeleton cols={6} />
        ) : result.items.length === 0 ? (
          <EmptyState
            icon={<Package size={26} />}
            title="کالایی پیدا نشد"
            action={
              <Button onClick={() => setEditing({ mode: 'create' })}>
                <Plus size={16} />
                افزودن کالا
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 60 }} />
                  <th>عنوان</th>
                  <th>برند</th>
                  <th>قیمت</th>
                  <th>موجودی</th>
                  <th>گزینه‌ها</th>
                  <th>وضعیت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.items.map((product) => {
                  const image = coverImage(product);
                  return (
                    <tr key={product.id}>
                      <td>
                        <span className="thumb">
                          {image ? (
                            <img src={image} alt="" />
                          ) : (
                            <ImageOff size={16} color="var(--ink-300)" />
                          )}
                        </span>
                      </td>
                      <td>
                        <div className="strong small">{product.title}</div>
                        <div className="tiny muted">{product.slug}</div>
                      </td>
                      <td className="small">{product.brand?.title ?? '—'}</td>
                      <td className="small">
                        {formatToman(product.price)}
                        {product.sale_price ? (
                          <div className="tiny" style={{ color: 'var(--accent-600)' }}>
                            حراج: {formatToman(product.sale_price)}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`badge badge-${
                            product.stock === 0
                              ? 'danger'
                              : product.stock <= 5
                                ? 'warning'
                                : 'success'
                          }`}
                        >
                          {Number(product.stock ?? 0).toLocaleString('fa-IR')}
                        </span>
                      </td>
                      <td className="small">
                        {(product.variants ?? []).length.toLocaleString('fa-IR')}
                      </td>
                      <td>
                        <span
                          className={`badge badge-${product.is_published ? 'success' : 'muted'}`}
                        >
                          {product.is_published ? 'منتشر شده' : 'پیش‌نویس'}
                        </span>
                      </td>
                      <td>
                        <div className="cell-actions">
                          <button
                            className="icon-btn"
                            title="ویرایش"
                            onClick={() => setEditing({ mode: 'edit', id: product.id })}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="icon-btn danger"
                            title="حذف"
                            onClick={() => setRemoving(product)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} totalPages={result.totalPages} onChange={setPage} />
      </section>

      {editing ? (
        <ProductEditor
          mode={editing.mode}
          productId={editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}

      {removing ? (
        <Confirm
          title="حذف کالا"
          message={`«${removing.title}» حذف شود؟ سفارش‌های گذشته دست‌نخورده می‌مانند.`}
          onConfirm={remove}
          onClose={() => setRemoving(null)}
          loading={deleteLoading}
        />
      ) : null}
    </>
  );
}
