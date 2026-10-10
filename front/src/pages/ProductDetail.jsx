import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Heart,
  ImageOff,
  Minus,
  Package,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import { api } from '../lib/api';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import {
  basePrice,
  discountPercent,
  effectivePrice,
  formatToman,
  imageUrl,
} from '../lib/format';
import { useInView } from '../lib/useInView';
import ProductCard from '../components/product/ProductCard';
import {
  Breadcrumb,
  Button,
  EmptyState,
  Price,
  Stars,
} from '../components/ui/Primitives';

// A variant is described by its attribute values. Grouping them by
// attribute is what lets the page draw one row of buttons per attribute
// and grey out combinations the shop cannot actually sell.
function buildAxes(variants) {
  const axes = new Map();
  variants.forEach((variant) => {
    (variant.attributeValues ?? []).forEach(({ attribute, option }) => {
      if (!attribute || !option) return;
      if (!axes.has(attribute.id)) {
        axes.set(attribute.id, {
          id: attribute.id,
          title: attribute.title,
          type: attribute.type,
          options: new Map(),
        });
      }
      axes.get(attribute.id).options.set(option.id, option);
    });
  });
  return [...axes.values()].map((axis) => ({
    ...axis,
    options: [...axis.options.values()].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id,
    ),
  }));
}

function variantMatches(variant, selection) {
  return Object.entries(selection).every(([attributeId, optionId]) =>
    (variant.attributeValues ?? []).some(
      (value) =>
        String(value.attribute?.id) === String(attributeId) &&
        value.option?.id === optionId,
    ),
  );
}

export default function ProductDetail() {
  const { slug } = useParams();
  const { add } = useCart();
  const wishlist = useWishlist();
  const { isAuthenticated } = useAuth();
  const toast = useToast();

  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [tab, setTab] = useState('specs');
  const [adding, setAdding] = useState(false);
  const buyBoxRef = useRef(null);
  // On a phone the buy box is a long scroll away once the customer is
  // reading specs or reviews; a bar at the bottom takes over the moment
  // the box itself leaves the screen.
  const buyBoxVisible = useInView(buyBoxRef, [product?.id, loading]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelection({});
    setQuantity(1);
    setActiveImage(0);

    const path = /^\d+$/.test(slug) ? `/products/${slug}` : `/products/slug/${slug}`;

    api
      .get(path)
      .then((data) => {
        if (cancelled) return;
        setProduct(data);
        void api
          .get(`/products/${data.id}/related?limit=8`)
          .then((items) => !cancelled && setRelated(items ?? []))
          .catch(() => {});
        void api
          .get(`/comments?productId=${data.id}&limit=20`)
          .then((items) => !cancelled && setComments(items?.items ?? []))
          .catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setProduct(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const variants = useMemo(
    () => (product?.variants ?? []).filter((variant) => variant.is_active !== false),
    [product],
  );
  const axes = useMemo(() => buildAxes(variants), [variants]);

  // With every axis answered there is exactly one variant; with a single
  // unnamed option (a product that was never split) that one is it.
  const selectedVariant = useMemo(() => {
    if (variants.length === 0) return null;
    if (axes.length === 0) return variants[0];
    if (Object.keys(selection).length !== axes.length) return null;
    return variants.find((variant) => variantMatches(variant, selection)) ?? null;
  }, [variants, axes, selection]);

  // Pre-select the first combination that is actually in stock, so the
  // page opens on something buyable rather than on an empty picker.
  useEffect(() => {
    if (axes.length === 0 || Object.keys(selection).length > 0) return;
    const first =
      variants.find((variant) => Number(variant.stock) > 0) ?? variants[0];
    if (!first) return;
    const next = {};
    (first.attributeValues ?? []).forEach(({ attribute, option }) => {
      if (attribute && option) next[attribute.id] = option.id;
    });
    if (Object.keys(next).length) setSelection(next);
  }, [axes, variants, selection]);

  const optionAvailability = (axisId, optionId) => {
    const hypothetical = { ...selection, [axisId]: optionId };
    const candidates = variants.filter((variant) =>
      variantMatches(variant, hypothetical),
    );
    if (candidates.length === 0) return 'missing';
    return candidates.some((variant) => Number(variant.stock) > 0)
      ? 'available'
      : 'sold-out';
  };

  const images = product?.images ?? [];
  const price = effectivePrice(product, selectedVariant);
  const was = basePrice(product, selectedVariant);
  const off = discountPercent(product, selectedVariant);
  const stock = selectedVariant
    ? Number(selectedVariant.stock)
    : Number(product?.stock ?? 0);
  const canBuy = !!product && (axes.length === 0 || !!selectedVariant) && stock > 0;
  const needsChoice = axes.length > 0 && !selectedVariant;

  const descriptiveValues = product?.attributeValues ?? [];

  const addToCart = async () => {
    if (!canBuy) return;
    setAdding(true);
    await add(product, selectedVariant, quantity);
    setAdding(false);
  };

  const submitComment = async (event) => {
    event.preventDefault();
    // Held before the await: React clears event.currentTarget once the
    // handler yields, and resetting through it then threw - the review was
    // saved but the customer was shown an error.
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api.post(
        '/comments',
        {
          productId: product.id,
          comment: form.get('comment'),
          rate: Number(form.get('rate')),
        },
        { auth: true },
      );
      toast.success('نظر شما ثبت شد و پس از تأیید نمایش داده می‌شود');
      formElement.reset();
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  if (loading) {
    return (
      <div className="container page">
        <div className="pdp">
          <div className="skeleton" style={{ aspectRatio: '1 / 1', borderRadius: 22 }} />
          <div className="stack">
            <div className="skeleton" style={{ height: 28, width: '70%' }} />
            <div className="skeleton" style={{ height: 18, width: '40%' }} />
            <div className="skeleton" style={{ height: 160, marginTop: 20 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container page">
        <div className="card">
          <EmptyState
            title="این کالا پیدا نشد"
            description="ممکن است حذف شده باشد یا آدرس اشتباه باشد."
            action={
              <Link className="btn btn-primary" to="/products">
                بازگشت به فروشگاه
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container page">
      <Breadcrumb
        items={[
          { label: 'فروشگاه', to: '/products' },
          ...(product.categories?.length
            ? [
                {
                  label: product.categories[0].title,
                  to: `/products?categoryId=${product.categories[0].id}`,
                },
              ]
            : []),
          { label: product.title },
        ]}
      />

      <div className="pdp">
        <div className="gallery">
          <div className="gallery-main">
            {images[activeImage] ? (
              <img
                src={imageUrl(images[activeImage].url ?? images[activeImage].path)}
                alt={product.title}
              />
            ) : (
              <span className="muted">
                <ImageOff size={44} />
              </span>
            )}
            {off > 0 ? (
              <span
                className="badge badge-accent"
                style={{ position: 'absolute', top: 16, insetInlineStart: 16 }}
              >
                ٪{off} تخفیف
              </span>
            ) : null}
          </div>

          {images.length > 1 ? (
            <div className="gallery-thumbs">
              {images.map((image, index) => (
                <button
                  key={image.id ?? index}
                  className="gallery-thumb"
                  data-active={index === activeImage}
                  onClick={() => setActiveImage(index)}
                >
                  <img src={imageUrl(image.url ?? image.path)} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <h1 className="pdp-title">{product.title}</h1>

          <div className="pdp-meta">
            {product.brand ? (
              <Link to={`/products?brandId=${product.brand.id}`} className="badge">
                {product.brand.title}
              </Link>
            ) : null}
            {Number(product.rating_count) > 0 ? (
              <Stars value={product.rating_avg} count={product.rating_count} />
            ) : (
              <span className="small muted">هنوز امتیازی ثبت نشده</span>
            )}
            {selectedVariant?.sku ? (
              <span className="small muted">کد کالا: {selectedVariant.sku}</span>
            ) : null}
          </div>

          {axes.map((axis) => (
            <div className="variant-group" key={axis.id}>
              <div className="variant-label">
                {axis.title}:
                <span>
                  {axis.options.find((option) => option.id === selection[axis.id])
                    ?.value ?? 'انتخاب کنید'}
                </span>
              </div>
              <div className="variant-options">
                {axis.options.map((option) => {
                  const state = optionAvailability(axis.id, option.id);
                  return (
                    <button
                      key={option.id}
                      className="variant-option"
                      data-selected={selection[axis.id] === option.id}
                      data-unavailable={state !== 'available'}
                      disabled={state === 'missing'}
                      onClick={() =>
                        setSelection((current) => ({
                          ...current,
                          [axis.id]: option.id,
                        }))
                      }
                      title={
                        state === 'sold-out'
                          ? 'این ترکیب موجود نیست'
                          : state === 'missing'
                            ? 'این ترکیب وجود ندارد'
                            : undefined
                      }
                    >
                      {axis.type === 'color' && option.hex ? (
                        <span className="swatch" style={{ background: option.hex }} />
                      ) : null}
                      {option.value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="buy-box" ref={buyBoxRef}>
            <div className="buy-price">
              {stock > 0 ? (
                <Price now={price} was={was} off={off} />
              ) : (
                <span className="strong" style={{ color: 'var(--danger-600)' }}>
                  {selectedVariant || axes.length === 0
                    ? 'این گزینه موجود نیست'
                    : 'لطفاً یک گزینه انتخاب کنید'}
                </span>
              )}

              {stock > 0 && stock <= 5 ? (
                <span className="badge badge-warning">تنها {stock} عدد باقی مانده</span>
              ) : null}
            </div>

            <div className="row buy-actions">
              <div className="qty">
                <button
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  disabled={quantity <= 1}
                  aria-label="کاهش"
                >
                  <Minus size={15} />
                </button>
                <span>{quantity.toLocaleString('fa-IR')}</span>
                <button
                  onClick={() => setQuantity((value) => Math.min(stock || 1, value + 1))}
                  disabled={quantity >= stock}
                  aria-label="افزایش"
                >
                  <Plus size={15} />
                </button>
              </div>

              <Button
                variant="primary"
                size="lg"
                onClick={addToCart}
                disabled={!canBuy}
                loading={adding}
                className="buy-cta"
              >
                <ShoppingCart size={18} />
                افزودن به سبد خرید
              </Button>

              <button
                className="icon-btn buy-wish"
                data-active={wishlist.has(product.id)}
                onClick={() => wishlist.toggle(product.id)}
                aria-label="علاقه‌مندی"
              >
                <Heart
                  size={19}
                  fill={wishlist.has(product.id) ? 'var(--accent-600)' : 'none'}
                  color={wishlist.has(product.id) ? 'var(--accent-600)' : undefined}
                />
              </button>
            </div>

            {selectedVariant && Number(product.weight_grams) > 0 ? (
              <div className="small muted" style={{ marginTop: 14 }}>
                وزن با بسته‌بندی: {formatToman(product.weight_grams, { withUnit: false })} گرم
              </div>
            ) : null}
          </div>

          <div className="grid auto-grid pdp-trust" style={{ marginTop: 16 }}>
            {[
              { icon: Truck, title: 'ارسال سریع', sub: 'به سراسر ایران' },
              { icon: ShieldCheck, title: 'ضمانت اصالت', sub: 'کالای اورجینال' },
              { icon: RotateCcw, title: '۷ روز مرجوعی', sub: 'بدون قید و شرط' },
              { icon: Package, title: 'بسته‌بندی ایمن', sub: 'تحویل سالم' },
            ].map((item) => (
              <div className="card card-pad row" key={item.title} style={{ gap: 10 }}>
                <item.icon size={22} color="var(--brand-600)" />
                <div>
                  <div className="small strong">{item.title}</div>
                  <div className="tiny muted">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="section">
        <div className="tabs">
          <button
            className="tab"
            data-active={tab === 'specs'}
            onClick={() => setTab('specs')}
          >
            مشخصات
          </button>
          <button
            className="tab"
            data-active={tab === 'description'}
            onClick={() => setTab('description')}
          >
            توضیحات
          </button>
          <button
            className="tab"
            data-active={tab === 'comments'}
            onClick={() => setTab('comments')}
          >
            نظرات ({comments.length.toLocaleString('fa-IR')})
          </button>
        </div>

        <div className="card card-pad">
          {tab === 'specs' ? (
            descriptiveValues.length === 0 && !product.weight_grams ? (
              <p className="muted small">مشخصات فنی برای این کالا ثبت نشده است.</p>
            ) : (
              <table className="spec-table">
                <tbody>
                  {descriptiveValues.map((value) => (
                    <tr key={value.id}>
                      <td>{value.attribute?.title}</td>
                      <td>
                        {value.option?.value ??
                          value.value_text ??
                          (value.value_number !== null && value.value_number !== undefined
                            ? `${value.value_number} ${value.attribute?.unit ?? ''}`
                            : value.value_boolean
                              ? 'دارد'
                              : 'ندارد')}
                      </td>
                    </tr>
                  ))}
                  {product.weight_grams ? (
                    <tr>
                      <td>وزن</td>
                      <td>{product.weight_grams.toLocaleString('fa-IR')} گرم</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )
          ) : null}

          {tab === 'description' ? (
            <p style={{ lineHeight: 2.1, whiteSpace: 'pre-line' }}>
              {product.description || 'توضیحی برای این کالا ثبت نشده است.'}
            </p>
          ) : null}

          {tab === 'comments' ? (
            <div>
              {isAuthenticated ? (
                <form onSubmit={submitComment} className="stack" style={{ marginBottom: 20 }}>
                  <div className="row" style={{ gap: 10 }}>
                    <span className="small strong">امتیاز شما:</span>
                    <select name="rate" className="select" style={{ width: 120 }} defaultValue="5">
                      {[5, 4, 3, 2, 1].map((value) => (
                        <option key={value} value={value}>
                          {value} ستاره
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    name="comment"
                    className="textarea"
                    placeholder="تجربه‌تان از این کالا را بنویسید…"
                    required
                  />
                  <Button type="submit" variant="soft" style={{ alignSelf: 'flex-start' }}>
                    ثبت نظر
                  </Button>
                </form>
              ) : (
                <p className="small muted">
                  برای ثبت نظر ابتدا <Link to="/login" style={{ color: 'var(--brand-600)' }}>وارد شوید</Link>.
                </p>
              )}

              {comments.length === 0 ? (
                <p className="muted small">هنوز نظری برای این کالا ثبت نشده است.</p>
              ) : (
                comments.map((comment) => (
                  <div className="comment" key={comment.id}>
                    <div className="spread">
                      <span className="strong small">
                        {comment.user?.display_name ?? 'کاربر تل‌کال'}
                      </span>
                      <Stars value={comment.rate} />
                    </div>
                    <p className="small" style={{ marginTop: 6 }}>
                      {comment.comment}
                    </p>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      </section>

      {related.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">کالاهای مشابه</h2>
          </div>
          <div className="product-grid">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mobile-bar" data-hidden={buyBoxVisible} aria-hidden={buyBoxVisible}>
        <div className="mobile-bar-info">
          {stock > 0 ? (
            <Price now={price} was={was} off={off} />
          ) : (
            <span className="small strong" style={{ color: 'var(--danger-600)' }}>
              {needsChoice ? 'یک گزینه انتخاب کنید' : 'ناموجود'}
            </span>
          )}
        </div>
        <Button
          variant="primary"
          onClick={
            needsChoice
              ? () => buyBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              : addToCart
          }
          disabled={!needsChoice && !canBuy}
          loading={adding}
          tabIndex={buyBoxVisible ? -1 : 0}
        >
          <ShoppingCart size={17} />
          {needsChoice ? 'انتخاب گزینه' : canBuy ? 'افزودن به سبد' : 'ناموجود'}
        </Button>
      </div>
    </div>
  );
}
