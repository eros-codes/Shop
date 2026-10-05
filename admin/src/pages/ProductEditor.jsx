import { useEffect, useMemo, useState, useRef } from 'react';
import { ImageOff, Plus, Trash2, Upload } from 'lucide-react';
import { api, request } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { imageUrl } from '../lib/format';
import { Button, Field, Modal } from '../components/Primitives';
import { useFieldErrors } from '../lib/useFieldErrors';

const EMPTY = {
  title: '',
  description: '',
  price: '',
  sale_price: '',
  stock: 0,
  weight_grams: '',
  brandId: '',
  categoryIds: [],
  is_published: true,
};

// A variant row as the form holds it: the attribute choices plus the
// numbers that belong to this one combination.
const emptyVariant = () => ({
  key: Math.random().toString(36).slice(2),
  title: '',
  sku: '',
  stock: 0,
  price: '',
  attributes: {},
});

export default function ProductEditor({ mode, productId, onClose, onSaved }) {
  const toast = useToast();
  const fieldErrors = useFieldErrors();
  const isEdit = mode === 'edit';

  const [form, setForm] = useState(EMPTY);
  const [variants, setVariants] = useState([emptyVariant()]);
  const [productAttributes, setProductAttributes] = useState({});
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  // setSaving only disables the button on the next render, so clicks landing
  // in the same React tick all get through. This ref closes that window - it
  // matters because a repeated submit fires side effects again and can leave
  // duplicate rows wherever the database has no unique constraint.
  const busyRef = useRef(false);
  const [tab, setTab] = useState('general');

  useEffect(() => {
    Promise.allSettled([
      api.get('/brands'),
      api.get('/categories'),
      api.get('/attributes'),
    ]).then(([brandsResult, categoriesResult, attributesResult]) => {
      if (brandsResult.status === 'fulfilled') {
        setBrands(brandsResult.value?.items ?? brandsResult.value ?? []);
      }
      if (categoriesResult.status === 'fulfilled') {
        setCategories(
          categoriesResult.value?.items ?? categoriesResult.value ?? [],
        );
      }
      if (attributesResult.status === 'fulfilled') {
        setAttributes(attributesResult.value ?? []);
      }
    });
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    api
      .get(`/products/${productId}`)
      .then((product) => {
        setForm({
          title: product.title ?? '',
          description: product.description ?? '',
          price: product.price ?? '',
          sale_price: product.sale_price ?? '',
          stock: product.stock ?? 0,
          weight_grams: product.weight_grams ?? '',
          brandId: product.brand?.id ?? '',
          categoryIds: (product.categories ?? []).map((category) => category.id),
          is_published: product.is_published ?? true,
        });
        setImages(product.images ?? []);
        loadedVariants.current = new Map(
          (product.variants ?? []).map((variant) => [
            variant.id,
            {
              title: variant.title ?? '',
              sku: variant.sku ?? '',
              stock: Number(variant.stock) || 0,
              price: variant.price ?? '',
              attributes: JSON.stringify(
                (variant.attributeValues ?? [])
                  .map((value) => [value.attribute.id, value.option.id])
                  .sort((a, b) => a[0] - b[0]),
              ),
            },
          ]),
        );
        setVariants(
          (product.variants ?? []).map((variant) => ({
            key: `v${variant.id}`,
            id: variant.id,
            title: variant.title,
            sku: variant.sku,
            stock: variant.stock,
            price: variant.price ?? '',
            attributes: Object.fromEntries(
              (variant.attributeValues ?? []).map((value) => [
                value.attribute.id,
                value.option.id,
              ]),
            ),
          })),
        );
        setProductAttributes(
          Object.fromEntries(
            (product.attributeValues ?? []).map((value) => [
              value.attribute.id,
              value.option?.id ??
                value.value_text ??
                value.value_number ??
                value.value_boolean,
            ]),
          ),
        );
      })
      .catch(() => toast.error('این کالا بارگذاری نشد'))
      .finally(() => setLoading(false));
  }, [isEdit, productId, toast]);

  const axes = useMemo(
    () => attributes.filter((attribute) => attribute.is_variant_axis),
    [attributes],
  );
  const descriptive = useMemo(
    () => attributes.filter((attribute) => !attribute.is_variant_axis),
    [attributes],
  );

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  // The variants as they were when the editor opened, keyed by id. Saving
  // used to PATCH every variant with the stock it had at that moment, so a
  // sale made while the editor was open was silently written back over -
  // even when the admin had only touched the description.
  const loadedVariants = useRef(new Map());

  const variantPayload = (variant) => ({
    ...(variant.title.trim() ? { title: variant.title.trim() } : {}),
    ...(variant.sku.trim() ? { sku: variant.sku.trim() } : {}),
    stock: Number(variant.stock) || 0,
    ...(variant.price !== '' ? { price: Number(variant.price) } : {}),
    attributes: Object.entries(variant.attributes)
      .filter(([, optionId]) => !!optionId)
      .map(([attributeId, optionId]) => ({
        attributeId: Number(attributeId),
        optionId: Number(optionId),
      })),
  });

  // Returns only the fields the admin actually changed, or null if nothing
  // did. Stock goes out with the value the editor loaded, so the server can
  // refuse the write if units were sold in the meantime.
  const changedFields = (variant, payload) => {
    const before = loadedVariants.current.get(variant.id);
    if (!before) return payload;
    const out = {};
    if ((payload.title ?? '') !== before.title) out.title = payload.title;
    if ((payload.sku ?? '') !== before.sku) out.sku = payload.sku;
    if (String(payload.price ?? '') !== String(before.price ?? '')) {
      if (payload.price !== undefined) out.price = payload.price;
    }
    const attrs = JSON.stringify(
      payload.attributes
        .map((a) => [a.attributeId, a.optionId])
        .sort((a, b) => a[0] - b[0]),
    );
    if (attrs !== before.attributes) out.attributes = payload.attributes;
    if (payload.stock !== before.stock) {
      out.stock = payload.stock;
      out.expected_stock = before.stock;
    }
    return Object.keys(out).length ? out : null;
  };

  const descriptivePayload = () =>
    Object.entries(productAttributes)
      .filter(([, value]) => value !== '' && value !== undefined && value !== null)
      .map(([attributeId, value]) => {
        const attribute = attributes.find(
          (item) => String(item.id) === String(attributeId),
        );
        if (!attribute) return null;
        if (attribute.type === 'select' || attribute.type === 'color') {
          return { attributeId: Number(attributeId), optionId: Number(value) };
        }
        if (attribute.type === 'number') {
          return { attributeId: Number(attributeId), value_number: Number(value) };
        }
        if (attribute.type === 'boolean') {
          return {
            attributeId: Number(attributeId),
            value_boolean: value === true || value === 'true',
          };
        }
        return { attributeId: Number(attributeId), value_text: String(value) };
      })
      .filter(Boolean);

  const save = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    let stage = 'product';
    try {
      const base = {
        title: form.title.trim(),
        description: form.description.trim(),
        price: Number(form.price) || 0,
        ...(form.sale_price !== '' ? { sale_price: Number(form.sale_price) } : {}),
        ...(form.weight_grams !== ''
          ? { weight_grams: Number(form.weight_grams) }
          : {}),
        ...(form.brandId ? { brandId: Number(form.brandId) } : {}),
        ...(form.categoryIds.length ? { categoryIds: form.categoryIds } : {}),
        is_published: form.is_published,
        attributes: descriptivePayload(),
      };

      fieldErrors.clear();
      if (isEdit) {
        stage = 'product';
        await api.patch(`/products/${productId}`, base, { auth: true });
        stage = 'variants';

        // Variants are their own resources: new rows are added, existing
        // ones patched. Stock stays where it belongs - on the variant.
        for (const variant of variants) {
          const payload = variantPayload(variant);
          if (variant.id) {
            const changed = changedFields(variant, payload);
            if (changed === null) continue; // untouched: leave it alone
            await api.patch(
              `/products/${productId}/variants/${variant.id}`,
              changed,
              { auth: true },
            );
          } else {
            await api.post(`/products/${productId}/variants`, payload, {
              auth: true,
            });
          }
        }
        toast.success('کالا به‌روز شد');
      } else {
        stage = 'product';
        await api.post(
          '/products',
          {
            ...base,
            stock: 0,
            variants: variants.map(variantPayload),
          },
          { auth: true },
        );
        toast.success('کالا ساخته شد');
      }
      onSaved();
    } catch (error) {
      // Only the product's own request maps onto these inputs. On create the
      // variants travel inside it as variants.N.*, which have no input of
      // their own here, so capture() reports them as not shown and the
      // message goes to the toast instead.
      if (stage === 'product' && fieldErrors.capture(error, ['title', 'description', 'price', 'sale_price', 'weight_grams', 'brandId', 'categoryIds'])) {
        toast.error('چند مورد از فرم نیاز به اصلاح دارد.');
      } else {
        toast.error(translateError(error));
      }
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const uploadImages = async (event) => {
    const files = [...(event.target.files ?? [])];
    if (files.length === 0 || !isEdit) return;
    const body = new FormData();
    files.forEach((file) => body.append('images', file));
    try {
      const updated = await request(`/products/${productId}/images`, {
        method: 'POST',
        body,
        auth: true,
      });
      setImages(updated?.images ?? []);
      toast.success('تصاویر آپلود شد');
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  const removeImage = async (imageId) => {
    try {
      await api.delete(`/products/${productId}/images/${imageId}`, undefined, {
        auth: true,
      });
      setImages((current) => current.filter((image) => image.id !== imageId));
      toast.success('تصویر حذف شد');
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  const removeVariant = async (variant) => {
    if (variant.id) {
      try {
        await api.delete(
          `/products/${productId}/variants/${variant.id}`,
          undefined,
          { auth: true },
        );
        toast.success('گزینه حذف شد');
      } catch (error) {
        toast.error(translateError(error));
        return;
      }
    }
    setVariants((current) => current.filter((item) => item.key !== variant.key));
  };

  return (
    <Modal
      wide
      title={isEdit ? 'ویرایش کالا' : 'کالای جدید'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={save} loading={saving} disabled={loading}>
            ذخیره
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="skeleton" style={{ height: 280 }} />
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div className="row" style={{ gap: 6, borderBottom: '1px solid var(--line)' }}>
            {[
              ['general', 'اطلاعات کلی'],
              ['variants', `گزینه‌ها (${variants.length.toLocaleString('fa-IR')})`],
              ['specs', 'مشخصات'],
              ...(isEdit ? [['images', 'تصاویر']] : []),
            ].map(([value, label]) => (
              <button
                key={value}
                className="btn btn-ghost btn-sm"
                style={{
                  border: 'none',
                  borderBottom:
                    tab === value ? '2px solid var(--brand-600)' : '2px solid transparent',
                  borderRadius: 0,
                  color: tab === value ? 'var(--brand-700)' : 'var(--ink-500)',
                }}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'general' ? (
            <div className="stack">
              <Field label="عنوان کالا"
            error={fieldErrors.of('title')}>
                <input
                  className="input"
                  value={form.title}
                  onChange={(event) => set('title', event.target.value)}
                />
              </Field>

              <Field label="توضیحات"
            error={fieldErrors.of('description')}>
                <textarea
                  className="textarea"
                  value={form.description}
                  onChange={(event) => set('description', event.target.value)}
                />
              </Field>

              <div className="grid cols-3">
                <Field label="قیمت (تومان)"
            error={fieldErrors.of('price')}>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={form.price}
                    onChange={(event) =>
                      set('price', event.target.value.replace(/\D/g, ''))
                    }
                  />
                </Field>
                <Field label="قیمت حراج"
            error={fieldErrors.of('sale_price')} hint="خالی یعنی بدون حراج">
                  <input
                    className="input"
                    inputMode="numeric"
                    value={form.sale_price}
                    onChange={(event) =>
                      set('sale_price', event.target.value.replace(/\D/g, ''))
                    }
                  />
                </Field>
                <Field label="وزن (گرم)"
            error={fieldErrors.of('weight_grams')} hint="برای محاسبه هزینه ارسال">
                  <input
                    className="input"
                    inputMode="numeric"
                    value={form.weight_grams}
                    onChange={(event) =>
                      set('weight_grams', event.target.value.replace(/\D/g, ''))
                    }
                  />
                </Field>
              </div>

              <div className="grid cols-2">
                <Field label="برند"
            error={fieldErrors.of('brandId')}>
                  <select
                    className="select"
                    value={form.brandId}
                    onChange={(event) => set('brandId', event.target.value)}
                  >
                    <option value="">بدون برند</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.title}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="دسته‌بندی‌ها"
            error={fieldErrors.of('categoryIds')} hint="می‌توانید چند مورد انتخاب کنید">
                  <select
                    className="select"
                    multiple
                    style={{ minHeight: 92 }}
                    value={form.categoryIds.map(String)}
                    onChange={(event) =>
                      set(
                        'categoryIds',
                        [...event.target.selectedOptions].map((option) =>
                          Number(option.value),
                        ),
                      )
                    }
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.title}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={(event) => set('is_published', event.target.checked)}
                />
                در فروشگاه نمایش داده شود
              </label>
            </div>
          ) : null}

          {tab === 'variants' ? (
            <div className="stack">
              <p className="tiny muted">
                موجودی و قیمت روی هر گزینه ثبت می‌شود. کالایی که فقط یک حالت دارد،
                یک گزینه با عنوان دلخواه می‌گیرد.
              </p>

              {variants.map((variant) => (
                <div className="card card-pad stack" key={variant.key} style={{ gap: 10 }}>
                  <div className="spread">
                    <span className="small strong">
                      {variant.title || 'گزینه بدون عنوان'}
                    </span>
                    <button
                      className="icon-btn danger"
                      onClick={() => removeVariant(variant)}
                      title="حذف گزینه"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {axes.length > 0 ? (
                    <div className="grid cols-3">
                      {axes.map((attribute) => (
                        <Field key={attribute.id} label={attribute.title}>
                          <select
                            className="select"
                            value={variant.attributes[attribute.id] ?? ''}
                            onChange={(event) =>
                              setVariants((current) =>
                                current.map((item) =>
                                  item.key === variant.key
                                    ? {
                                        ...item,
                                        attributes: {
                                          ...item.attributes,
                                          [attribute.id]: event.target.value,
                                        },
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            <option value="">—</option>
                            {(attribute.options ?? []).map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.value}
                              </option>
                            ))}
                          </select>
                        </Field>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid cols-4">
                    <Field label="عنوان" hint="خالی = از ویژگی‌ها ساخته می‌شود">
                      <input
                        className="input"
                        value={variant.title}
                        onChange={(event) =>
                          setVariants((current) =>
                            current.map((item) =>
                              item.key === variant.key
                                ? { ...item, title: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="کد انبار (SKU)">
                      <input
                        className="input"
                        value={variant.sku}
                        onChange={(event) =>
                          setVariants((current) =>
                            current.map((item) =>
                              item.key === variant.key
                                ? { ...item, sku: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="موجودی">
                      <input
                        className="input"
                        inputMode="numeric"
                        value={variant.stock}
                        onChange={(event) =>
                          setVariants((current) =>
                            current.map((item) =>
                              item.key === variant.key
                                ? { ...item, stock: event.target.value.replace(/\D/g, '') }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="قیمت اختصاصی" hint="خالی = قیمت کالا">
                      <input
                        className="input"
                        inputMode="numeric"
                        value={variant.price}
                        onChange={(event) =>
                          setVariants((current) =>
                            current.map((item) =>
                              item.key === variant.key
                                ? { ...item, price: event.target.value.replace(/\D/g, '') }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                </div>
              ))}

              <Button
                variant="soft"
                onClick={() => setVariants((current) => [...current, emptyVariant()])}
              >
                <Plus size={15} />
                افزودن گزینه
              </Button>
            </div>
          ) : null}

          {tab === 'specs' ? (
            <div className="stack">
              <p className="tiny muted">
                مشخصاتی که کالا را توصیف می‌کنند و موجودی را تقسیم نمی‌کنند.
              </p>
              {descriptive.length === 0 ? (
                <p className="small muted">
                  هنوز ویژگی توصیفی تعریف نشده است؛ از بخش «ویژگی‌ها» اضافه کنید.
                </p>
              ) : (
                <div className="grid cols-2">
                  {descriptive.map((attribute) => (
                    <Field
                      key={attribute.id}
                      label={`${attribute.title}${attribute.unit ? ` (${attribute.unit})` : ''}`}
                    >
                      {attribute.type === 'select' || attribute.type === 'color' ? (
                        <select
                          className="select"
                          value={productAttributes[attribute.id] ?? ''}
                          onChange={(event) =>
                            setProductAttributes((current) => ({
                              ...current,
                              [attribute.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">—</option>
                          {(attribute.options ?? []).map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.value}
                            </option>
                          ))}
                        </select>
                      ) : attribute.type === 'boolean' ? (
                        <select
                          className="select"
                          value={String(productAttributes[attribute.id] ?? '')}
                          onChange={(event) =>
                            setProductAttributes((current) => ({
                              ...current,
                              [attribute.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">—</option>
                          <option value="true">دارد</option>
                          <option value="false">ندارد</option>
                        </select>
                      ) : (
                        <input
                          className="input"
                          inputMode={attribute.type === 'number' ? 'numeric' : 'text'}
                          value={productAttributes[attribute.id] ?? ''}
                          onChange={(event) =>
                            setProductAttributes((current) => ({
                              ...current,
                              [attribute.id]: event.target.value,
                            }))
                          }
                        />
                      )}
                    </Field>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === 'images' && isEdit ? (
            <div className="stack">
              <label className="btn btn-soft" style={{ alignSelf: 'flex-start' }}>
                <Upload size={15} />
                آپلود تصویر
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={uploadImages}
                />
              </label>

              {images.length === 0 ? (
                <p className="small muted">
                  <ImageOff size={14} /> تصویری ثبت نشده است.
                </p>
              ) : (
                <div className="grid cols-4">
                  {images.map((image) => (
                    <div className="card card-pad stack" key={image.id} style={{ gap: 8 }}>
                      <img
                        src={imageUrl(image.url ?? image.path)}
                        alt=""
                        style={{ height: 110, objectFit: 'contain' }}
                      />
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeImage(image.id)}
                      >
                        <Trash2 size={14} />
                        حذف
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
