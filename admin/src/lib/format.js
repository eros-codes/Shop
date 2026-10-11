// Every price in this shop is an integer number of Toman, and Iranian
// shops print them with Persian digits and thousands separators.
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(value) {
  return String(value ?? '').replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

// The other way round, for what is typed. A Persian keyboard gives ۰-۹ (or
// Arabic ٠-٩), and a plain /\D/ filter threw every one of them away: a
// price typed on a Persian layout came out empty, or as NaN.
export function toAsciiDigits(value) {
  return String(value ?? '').replace(/[۰-۹٠-٩]/g, (digit) =>
    String(digit.charCodeAt(0) & 0xf),
  );
}

export function digitsOnly(value) {
  return toAsciiDigits(value).replace(/\D/g, '');
}

// A number field read from a form: Persian digits accepted, empty is null.
export function numberOrNull(value) {
  const digits = digitsOnly(value);
  return digits === '' ? null : Number(digits);
}

// The calendar day in Tehran for a stored moment, as <input type="date">
// wants it. Slicing the ISO string gave the UTC day, which is the day
// before for anything stored as a Tehran midnight.
export function tehranDateInput(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

// A picked day as a moment: its first second in Tehran, or its last. Iran
// has kept +03:30 all year since 2022.
export function tehranDayStart(day) {
  return day ? new Date(`${day}T00:00:00+03:30`).toISOString() : null;
}

export function tehranDayEnd(day) {
  return day ? new Date(`${day}T23:59:59+03:30`).toISOString() : null;
}

export function formatToman(amount, { withUnit = true } = {}) {
  const number = Number(amount ?? 0);
  const grouped = toPersianDigits(number.toLocaleString('en-US'));
  // A no-break space: a price must never wrap with its unit on the next line.
  return withUnit ? `${grouped}\u00a0تومان` : grouped;
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
