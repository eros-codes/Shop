import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Heart, ImageOff, Settings2, ShoppingCart } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import {
  basePrice,
  coverImage,
  discountPercent,
  effectivePrice,
  formatToman,
  toPersianDigits,
} from '../../lib/format';

// A single sale used to be enough to earn the "پرفروش" badge, which put it on
// almost every product and made it mean nothing. Tune this to taste.
const HOT_SALES_THRESHOLD = 5;

// A 5.0 from a single review reads as noise, not endorsement. Below this many
// reviews the card shows nothing rather than weak social proof.
const MIN_REVIEWS_FOR_STARS = 3;

export default function ProductCard({ product }) {
  const navigate = useNavigate();
  const { add } = useCart();
  const wishlist = useWishlist();

  const [justAdded, setJustAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const href = `/product/${product.slug ?? product.id}`;
  const image = coverImage(product);
  const now = effectivePrice(product);
  const was = basePrice(product);
  const off = discountPercent(product);
  const inStock = Number(product.stock ?? 0) > 0;
  const ratingCount = Number(product.rating_count ?? 0);

  const variants = product.variants ?? [];
  const sellable = variants.filter((variant) => variant.is_active !== false);
  // One option can go straight into the basket; several have to be picked by
  // the customer, so the button says so instead of pretending to add.
  const needsChoice = sellable.length > 1;
  const singleVariant = sellable.length === 1 ? sellable[0] : null;

  const onCta = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!inStock || busy) return;

    if (needsChoice) {
      navigate(href);
      return;
    }

    setBusy(true);
    try {
      await add(product, singleVariant, 1);
      setJustAdded(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setJustAdded(false), 1600);
    } finally {
      setBusy(false);
    }
  };

  let ctaIcon = <ShoppingCart size={16} />;
  let ctaLabel = 'افزودن به سبد';
  if (!inStock) {
    ctaLabel = 'ناموجود';
  } else if (justAdded) {
    ctaIcon = <Check size={16} />;
    ctaLabel = 'به سبد اضافه شد';
  } else if (needsChoice) {
    ctaIcon = <Settings2 size={16} />;
    ctaLabel = 'انتخاب گزینه‌ها';
  }

  return (
    <article className="product-card fade-in">
      <div className="product-top">
        <Link to={href} className="product-media" aria-label={product.title}>
          {image ? (
            <img src={image} alt={product.title} loading="lazy" />
          ) : (
            <span className="placeholder">
              <ImageOff size={34} />
            </span>
          )}

          <div className="product-flags">
            {off > 0 ? <span className="flag flag-off">٪{toPersianDigits(off)}</span> : null}
            {Number(product.sales_count ?? 0) >= HOT_SALES_THRESHOLD ? (
              <span className="flag flag-hot">پرفروش</span>
            ) : null}
          </div>

          {!inStock ? <span className="out-of-stock-veil">ناموجود</span> : null}
        </Link>

        <button
          type="button"
          className="wish-btn"
          data-active={wishlist.has(product.id)}
          onClick={() => wishlist.toggle(product.id)}
          aria-pressed={wishlist.has(product.id)}
          aria-label={
            wishlist.has(product.id)
              ? 'حذف از علاقه‌مندی‌ها'
              : 'افزودن به علاقه‌مندی‌ها'
          }
        >
          <Heart size={15} fill={wishlist.has(product.id) ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="product-body">
        <Link to={href} className="product-title">
          {product.title}
        </Link>

        <div className="product-meta">
          <span className="product-brand">{product.brand?.title ?? ''}</span>
          {ratingCount >= MIN_REVIEWS_FOR_STARS ? (
            <span className="product-rating">
              <span className="stars" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    style={{ opacity: star <= Math.round(Number(product.rating_avg)) ? 1 : 0.22 }}
                  >
                    ★
                  </span>
                ))}
              </span>
              <span className="tiny muted">
                {toPersianDigits(Number(product.rating_avg).toFixed(1))}
              </span>
            </span>
          ) : null}
        </div>

        {/* Row 1 + row 2: each price line owns the full card width, so a long
            Toman figure next to a struck-through one can never overflow. */}
        <div className="product-price">
          <div className="pp-top">
            {inStock && off > 0 ? (
              <span className="pp-was">{formatToman(was, { withUnit: false })}</span>
            ) : null}
          </div>

          <div className="pp-now">
            {inStock ? (
              <>
                <span className="pp-amount">{formatToman(now, { withUnit: false })}</span>
                <span className="pp-unit">تومان</span>
              </>
            ) : (
              <span className="pp-gone">فعلاً موجود نیست</span>
            )}
          </div>
        </div>

        {/* Row 3 */}
        <button
          type="button"
          className="product-cta"
          data-state={justAdded ? 'done' : undefined}
          onClick={onCta}
          disabled={!inStock || busy}
        >
          {inStock ? ctaIcon : null}
          <span>{ctaLabel}</span>
        </button>
      </div>
    </article>
  );
}
