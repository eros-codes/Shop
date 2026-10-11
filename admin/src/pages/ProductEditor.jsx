import { useEffect, useMemo, useState, useRef } from 'react';
import { ImageOff, Plus, Trash2, Upload } from 'lucide-react';
import { api, request } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { digitsOnly, imageAt } from '../lib/format';
import { Button, Confirm, Field, Modal } from '../components/Primitives';
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
  sale_price: '',
  is_active: true,
  attributes: {},
});

// What a saved variant looked like, to compare the form against later.
const snapshotOf = (payload) => ({
  title: payload.title ?? '',
  sku: payload.sku ?? '',
  stock: payload.stock,
  price: payload.price ?? '',
  sale_price: payload.sale_price ?? '',
  is_active: payload.is_active !== false,
  attributes: JSON.stringify(
    payload.attributes.map((a) => [a.attributeId, a.optionId]).sort((a, b) => a[0] - b[0]),
  ),
});

export default function ProductEditor({ mode, productId, initialTab, onClose, onSaved }) {
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
  const [tab, setTab] = useState(initialTab ?? 'general');
  const [uploading, setUploading] = useState(false);
  const [removingVariant, setRemovingVariant] = useState(null);
  const [priceError, setPriceError] = useState(null);

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
      .get(`/products/${productId}?includeDrafts=true`, { auth: true })
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
              sale_price: variant.sale_price ?? '',
              is_active: variant.is_active !== false,
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
            sale_price: variant.sale_price ?? '',
            is_active: variant.is_active !== false,
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
    ...(variant.sale_price !== '' ? { sale_price: Number(variant.sale_price) } : {}),
    is_active: variant.is_active !== false,
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
    // An emptied price or sale price goes out as null so it is actually
    // cleared; left out, the old one stayed whatever the form showed.
    if (String(payload.price ?? '') !== String(before.price ?? '')) {
      out.price = payload.price ?? null;
    }
    if (String(payload.sale_price ?? '') !== String(before.sale_price ?? '')) {
      out.sale_price = payload.sale_price ?? null;
    }
    if (payload.is_active !== before.is_active) out.is_active = payload.is_active;
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
    // An empty price used to go out as 0 - a product published for free.
    if (form.price === '') {
      setPriceError('قیمت کالا را وارد کنید.');
      setTab('general');
      return;
    }
    setPriceError(null);
    busyRef.current = true;
    setSaving(true);
    let stage = 'product';
    try {
      const base = {
        title: form.title.trim(),
        description: form.description.trim(),
        price: Number(form.price) || 0,
        // When editing, an emptied field is sent as null so it is actually
        // cleared - leaving it out kept the old sale running and the old
        // brand attached, whatever the form showed.
        ...(form.sale_price !== ''
          ? { sale_price: Number(form.sale_price) }
          : isEdit
            ? { sale_price: null }
            : {}),
        ...(form.weight_grams !== ''
          ? { weight_grams: Number(form.weight_grams) }
          : {}),
        ...(form.brandId
          ? { brandId: Number(form.brandId) }
          : isEdit
            ? { brandId: null }
            : {}),
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
        //
        // Each one that goes through is recorded as saved straight away. If
        // a later one fails and the admin presses save again, the ones
        // already written are not sent twice - a repeated stock change used
        // to come back as "stock changed meanwhile", and a repeated new row
        // was a duplicate.
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
            loadedVariants.current.set(variant.id, snapshotOf(payload));
          } else {
            const known = new Set(variants.map((item) => item.id).filter(Boolean));
            const product = await api.post(`/products/${productId}/variants`, payload, {
              auth: true,
            });
            const added = (product?.variants ?? []).filter((item) => !known.has(item.id));
            if (added.length === 1) {
              const id = added[0].id;
              loadedVariants.current.set(id, snapshotOf(payload));
              setVariants((current) =>
                current.map((item) => (item.key === variant.key ? { ...item, id } : item)),
              );
              variant.id = id;
            }
          }
        }
        toast.success('کالا به‌روز شد');
        onSaved();
      } else {
        stage = 'product';
        const created = await api.post(
          '/products',
          {
            ...base,
            stock: 0,
            variants: variants.map(variantPayload),
          },
          { auth: true },
        );
        // Pictures can only go onto a product that exists, so the editor
        // used to close here and the admin had to find the new product and
        // open it again. It now carries on to the pictures.
        toast.success('کالا ساخته شد؛ حالا تصاویرش را اضافه کنید');
        onSaved(created?.id ?? null);
      }
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
    const input = event.target;
    const files = [...(input.files ?? [])];
    // Cleared at once, so picking the same file again (after a failed
    // upload, say) still fires a change.
    input.value = '';
    if (files.length === 0 || !isEdit) return;
    const body = new FormData();
    files.forEach((file) => body.append('images', file));
    setUploading(true);
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
    } finally {
      setUploading(false);
    }
  };

  const makeCover = async (imageId) => {
    try {
      const updated = await api.patch(
        `/products/${productId}/images/${imageId}/cover`,
        {},
        { auth: true },
      );
      setImages(updated?.images ?? []);
      toast.success('تصویر اصلی تغییر کرد');
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

  // A saved variant is deleted on the server at once - not on "save" like
  // everything else in this form - so it is asked about first. One stray tap
  // on the bin used to take a colour off sale.
  const removeVariant = async (variant) => {
    if (variant.id) {
      setRemovingVariant(null);
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
            error={priceError ?? fieldErrors.of('price')}>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={form.price}
                    onChange={(event) => {
                      setPriceError(null);
                      set('price', digitsOnly(event.target.value));
                    }}
                  />
                </Field>
                <Field
                  label="قیمت حراج"
                  error={fieldErrors.of('sale_price')}
                  hint="خالی یعنی بدون حراج. گزینه‌ای که قیمت اختصاصی دارد، حراج خودش را لازم دارد."
                >
                  <input
                    className="input"
                    inputMode="numeric"
                    value={form.sale_price}
                    onChange={(event) => set('sale_price', digitsOnly(event.target.value))}
                  />
                </Field>
                <Field label="وزن (گرم)"
            error={fieldErrors.of('weight_grams')} hint="برای محاسبه هزینه ارسال">
                  <input
                    className="input"
                    inputMode="numeric"
                    value={form.weight_grams}
                    onChange={(event) => set('weight_grams', digitsOnly(event.target.value))}
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
                      {variant.is_active === false ? (
                        <span className="badge badge-muted" style={{ marginInlineStart: 8 }}>
                          غیرفعال
                        </span>
                      ) : null}
                    </span>
                    {/* Off sale for now - out of production, waiting for
                        stock - without deleting it. Deleting was the only
                        way, and it cannot be undone. */}
                    <label className="checkbox tiny" style={{ marginInlineStart: 'auto' }}>
                      <input
                        type="checkbox"
                        checked={variant.is_active !== false}
                        onChange={(event) =>
                          setVariants((current) =>
                            current.map((item) =>
                              item.key === variant.key
                                ? { ...item, is_active: event.target.checked }
                                : item,
                            ),
                          )
                        }
                      />
                      در فروش
                    </label>
                    <button
                      className="icon-btn danger"
                      onClick={() =>
                        variant.id ? setRemovingVariant(variant) : removeVariant(variant)
                      }
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

                  <div className="grid cols-4 variant-fields">
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
                                ? { ...item, stock: digitsOnly(event.target.value) }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="قیمت اختصاصی" hint="خالی = قیمت و حراج کالا">
                      <input
                        className="input"
                        inputMode="numeric"
                        value={variant.price}
                        onChange={(event) =>
                          setVariants((current) =>
                            current.map((item) =>
                              item.key === variant.key
                                ? { ...item, price: digitsOnly(event.target.value) }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    {/* With its own price, a variant ignores the product's
                        sale price - the API prices it from these two alone.
                        There was no field for it, so such a variant could
                        never be put on sale. */}
                    {variant.price !== '' ? (
                      <Field label="حراج اختصاصی" hint="خالی = بدون حراج">
                        <input
                          className="input"
                          inputMode="numeric"
                          value={variant.sale_price}
                          onChange={(event) =>
                            setVariants((current) =>
                              current.map((item) =>
                                item.key === variant.key
                                  ? { ...item, sale_price: digitsOnly(event.target.value) }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>
                    ) : null}
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
              <label
                className="btn btn-soft"
                style={{ alignSelf: 'flex-start' }}
                aria-disabled={uploading}
              >
                {uploading ? <span className="spinner" /> : <Upload size={15} />}
                {uploading ? 'در حال آپلود…' : 'آپلود تصویر'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  disabled={uploading}
                  onChange={uploadImages}
                />
              </label>

              {images.length === 0 ? (
                <p className="small muted">
                  <ImageOff size={14} /> تصویری ثبت نشده است.
                </p>
              ) : (
                <div className="grid cols-4">
                  {images.map((image, index) => (
                    <div className="card card-pad stack" key={image.id} style={{ gap: 8 }}>
                      <img
                        src={imageAt(image, 200)}
                        alt=""
                        style={{ height: 110, objectFit: 'contain' }}
                      />
                      {/* The first picture is the one every listing shows. */}
                      {index === 0 ? (
                        <span className="badge badge-success" style={{ alignSelf: 'center' }}>
                          تصویر اصلی
                        </span>
                      ) : (
                        <Button variant="soft" size="sm" onClick={() => makeCover(image.id)}>
                          تصویر اصلی شود
                        </Button>
                      )}
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

      {removingVariant ? (
        <Confirm
          title="حذف گزینه"
          message={`گزینه‌ی «${removingVariant.title || 'بدون عنوان'}» همین حالا حذف شود؟ سفارش‌های گذشته دست‌نخورده می‌مانند.`}
          onConfirm={() => removeVariant(removingVariant)}
          onClose={() => setRemovingVariant(null)}
        />
      ) : null}
    </Modal>
  );
}
