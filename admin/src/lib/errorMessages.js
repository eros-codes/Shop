// The API answers with a stable `code`; the Persian sentence lives here.
//
// This is the whole reason the backend returns codes: matching on
// English message text would break the first time a sentence is
// reworded, and the customer would be shown English either way.
const MESSAGES = {
  VALIDATION_FAILED: 'اطلاعات واردشده کامل یا درست نیست.',
  BAD_REQUEST: 'درخواست نامعتبر است.',
  UNAUTHORIZED: 'برای این کار باید وارد حساب‌تان شوید.',
  FORBIDDEN: 'به این بخش دسترسی ندارید.',
  NOT_FOUND: 'موردی که دنبالش بودید پیدا نشد.',
  CONFLICT: 'این مورد از قبل وجود دارد.',
  TOO_MANY_REQUESTS: 'تعداد درخواست‌ها زیاد بود؛ کمی بعد دوباره تلاش کنید.',
  INTERNAL_ERROR: 'خطایی در سرور رخ داد. لطفاً دوباره تلاش کنید.',

  DEMO_ACCOUNT_LOCKED:
    'این یک حساب نمایشی مشترک است؛ در دمو نمی‌شود رمز، نقش یا خودِ آن را تغییر داد.',
  STOCK_CHANGED:
    'موجودی این گزینه از وقتی صفحه را باز کردید تغییر کرده (احتمالاً فروش رفته). صفحه را تازه کنید و دوباره ذخیره کنید.',
  INSUFFICIENT_STOCK: 'موجودی کافی نیست.',
  OUT_OF_STOCK: 'این کالا موجود نیست.',
  VARIANT_REQUIRED: 'لطفاً یکی از گزینه‌های این کالا را انتخاب کنید.',
  VARIANT_NOT_FOUND: 'این گزینه پیدا نشد.',
  VARIANT_NOT_FOR_SALE: 'این گزینه در حال حاضر قابل سفارش نیست.',
  DUPLICATE_VARIANT_COMBINATION: 'این ترکیب از قبل تعریف شده است.',
  REQUIRED_ATTRIBUTE_MISSING: 'یکی از ویژگی‌های ضروری انتخاب نشده است.',
  INVALID_ATTRIBUTE_VALUE: 'مقدار انتخاب‌شده برای این ویژگی معتبر نیست.',

  SHIPPING_METHOD_REQUIRED: 'لطفاً روش ارسال را انتخاب کنید.',
  SHIPPING_METHOD_UNAVAILABLE: 'این روش ارسال برای آدرس انتخابی موجود نیست.',
  PAYMENT_METHOD_REQUIRED: 'لطفاً یک روش پرداخت انتخاب کنید.',
  COD_NOT_SUPPORTED: 'پرداخت در محل برای این روش ارسال ممکن نیست.',
  COD_LIMIT_EXCEEDED: 'مبلغ سفارش برای پرداخت در محل زیاد است؛ لطفاً آنلاین پرداخت کنید.',
  IDEMPOTENCY_KEY_REQUIRED: 'درخواست ناقص بود؛ دوباره تلاش کنید.',
  ORDER_NOT_EDITABLE: 'این سفارش دیگر قابل ویرایش نیست.',
  INVALID_STATUS_TRANSITION: 'این تغییر وضعیت ممکن نیست.',

  INSUFFICIENT_WALLET_BALANCE: 'موجودی کیف پول کافی نیست.',
  WALLET_INACTIVE: 'کیف پول شما غیرفعال است.',
  PAYMENT_GATEWAY_UNAVAILABLE: 'درگاه پرداخت در دسترس نیست؛ کمی بعد تلاش کنید.',
  AMOUNT_TOO_LARGE: 'مبلغ از حد مجاز بیشتر است.',
  FILE_TOO_LARGE:
    'حجم فایل بیشتر از حد مجاز است؛ تصویری کوچک‌تر از ۵ مگابایت انتخاب کنید.',

  DISCOUNT_NOT_FOUND: 'کد تخفیف معتبر نیست.',
  DISCOUNT_EXHAUSTED: 'ظرفیت این کد تخفیف تمام شده است.',
  DISCOUNT_NOT_STARTED: 'این کد تخفیف هنوز فعال نشده است.',
  DISCOUNT_EXPIRED: 'این کد تخفیف منقضی شده است.',
  DISCOUNT_MIN_ORDER_NOT_MET: 'مبلغ سبد شما به حداقل این کد تخفیف نمی‌رسد.',
  DISCOUNT_USER_LIMIT_REACHED: 'شما قبلاً از این کد تخفیف استفاده کرده‌اید.',
  DISCOUNT_NOT_APPLICABLE: 'این کد به کالاهای سبد شما تعلق نمی‌گیرد.',

  INVALID_CREDENTIALS: 'شماره موبایل یا رمز عبور درست نیست.',
  OTP_INCORRECT: 'کد واردشده درست نیست.',
  OTP_EXPIRED: 'کد منقضی شده است؛ لطفاً کد جدید بگیرید.',
  OTP_ATTEMPTS_EXCEEDED: 'تعداد تلاش‌ها زیاد بود؛ لطفاً کد جدید بگیرید.',
  OTP_NOT_FOUND: 'درخواستی برای این شماره ثبت نشده است.',
  CURRENT_PASSWORD_INCORRECT: 'رمز عبور فعلی درست نیست.',

  RETURN_WINDOW_CLOSED: 'مهلت مرجوع‌کردن این سفارش گذشته است.',
  RETURN_NOT_ALLOWED: 'این سفارش قابل مرجوع‌کردن نیست.',
  RETURN_QUANTITY_EXCEEDED: 'تعداد مرجوعی بیشتر از چیزی است که خریده‌اید.',
  REFUND_EXCEEDS_PAID: 'مبلغ بازگشتی از مبلغ پرداختی بیشتر است.',

  NETWORK_ERROR: 'ارتباط با سرور برقرار نشد. اینترنت یا سرور را بررسی کنید.',
};

// Some failures are more useful with the numbers the API sent back.
function withDetails(code, details) {
  if (!details) return null;
  if (code === 'INSUFFICIENT_STOCK' && details.available !== undefined) {
    return details.available > 0
      ? `تنها ${details.available} عدد از این گزینه موجود است.`
      : 'این گزینه موجود نیست.';
  }
  if (code === 'INSUFFICIENT_WALLET_BALANCE' && details.balance !== undefined) {
    return 'موجودی کیف پول کافی نیست؛ ابتدا کیف پول را شارژ کنید.';
  }
  if (code === 'OTP_INCORRECT' && details.attemptsLeft !== undefined) {
    return `کد واردشده درست نیست. ${details.attemptsLeft} تلاش دیگر باقی مانده است.`;
  }
  return null;
}

export function translateError(error) {
  if (!error) return MESSAGES.INTERNAL_ERROR;
  const { code, details, fieldErrors } = error;

  const detailed = withDetails(code, details);
  if (detailed) return detailed;

  if (code === 'VALIDATION_FAILED' && fieldErrors?.length) {
    // Field errors come straight from the server's DTO validators, which
    // are written in English. Showing one verbatim put "Title cannot be
    // empty" in front of a Persian-speaking user. Only pass it through when
    // it is already Persian; otherwise fall back to the generic wording.
    const first = fieldErrors.find((m) => /[\u0600-\u06FF]/.test(m));
    if (first) return first;
  }

  return MESSAGES[code] ?? error.message ?? MESSAGES.INTERNAL_ERROR;
}

export default MESSAGES;
