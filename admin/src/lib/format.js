// Every price in this shop is an integer number of Toman, and Iranian
// shops print them with Persian digits and thousands separators.
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(value) {
  return String(value ?? '').replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

export function formatToman(amount, { withUnit = true } = {}) {
  const number = Number(amount ?? 0);
  const grouped = toPersianDigits(number.toLocaleString('en-US'));
  return withUnit ? `${grouped} تومان` : grouped;
}

export function formatDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      dateStyle: 'medium',
      timeZone: 'Asia/Tehran',
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

export function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Tehran',
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

// What the customer actually pays for one unit right now.
export function effectivePrice(product, variant) {
  const now = Date.now();
  const saleWindowOpen =
    (!product?.sale_starts_at || now >= new Date(product.sale_starts_at).getTime()) &&
    (!product?.sale_ends_at || now <= new Date(product.sale_ends_at).getTime());

  if (variant && variant.price !== null && variant.price !== undefined) {
    if (variant.sale_price != null && saleWindowOpen) return Number(variant.sale_price);
    return Number(variant.price);
  }
  if (product?.sale_price != null && saleWindowOpen) return Number(product.sale_price);
  return Number(product?.price ?? 0);
}

export function basePrice(product, variant) {
  if (variant && variant.price !== null && variant.price !== undefined) {
    return Number(variant.price);
  }
  return Number(product?.price ?? 0);
}

export function discountPercent(product, variant) {
  const base = basePrice(product, variant);
  const now = effectivePrice(product, variant);
  if (!base || now >= base) return 0;
  return Math.round(((base - now) / base) * 100);
}

// The API serves uploads from its own origin; in development that is
// proxied, so a root-relative path just works.
export function imageUrl(path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return path.startsWith('/') ? path : `/${path}`;
}

// The listing and the product page answer differently: a list item
// carries a single `coverImage`, a full product carries its `images`.
// Reading only one of them is why product cards came back blank.
export function coverImage(product) {
  const cover = product?.coverImage;
  if (cover) {
    return imageUrl(typeof cover === 'string' ? cover : (cover.url ?? cover.path));
  }

  const images = product?.images ?? [];
  const first = images.find((image) => image.is_cover) ?? images[0];
  return imageUrl(first?.url ?? first?.path ?? null);
}
