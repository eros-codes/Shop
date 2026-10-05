import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { getMetadataStorage } from 'class-validator';
import { ErrorCodes } from '../errors/error-codes';

// Every DTO validator used to answer in English - "title should not be
// empty", "Rate must not be greater than 5" - and those sentences went
// straight to a Persian-speaking customer. Translating ~600 decorator
// messages one by one would be brittle and every new DTO would leak English
// again, so the message is built here instead, from two things that never
// change: which constraint failed and which field it was on. The English
// text in the DTOs is left alone; it still shows up in logs for developers.

const FIELD_LABELS: Record<string, string> = {
  action: 'عملیات',
  actorId: 'کاربر انجام‌دهنده',
  address: 'نشانی',
  addressId: 'آدرس',
  admin_note: 'یادداشت مدیر',
  amount: 'مبلغ',
  attributeId: 'ویژگی',
  attributeOptions: 'گزینه‌های ویژگی',
  attributes: 'ویژگی‌ها',
  base_cost: 'هزینه‌ی پایه',
  brandId: 'برند',
  capacity: 'ظرفیت',
  cash_on_delivery_fee: 'کارمزد پرداخت در محل',
  categoryId: 'دسته‌بندی',
  categoryIds: 'دسته‌بندی‌ها',
  city: 'شهر',
  code: 'کد',
  comment: 'دیدگاه',
  currentPassword: 'رمز فعلی',
  description: 'توضیحات',
  discountCode: 'کد تخفیف',
  display_name: 'نام',
  entityId: 'شناسه',
  entityType: 'نوع موجودیت',
  estimated_days_max: 'حداکثر زمان تحویل',
  estimated_days_min: 'حداقل زمان تحویل',
  expected_stock: 'موجودی مورد انتظار',
  expires_at: 'تاریخ انقضا',
  free_shipping_threshold: 'حد ارسال رایگان',
  from: 'تاریخ شروع',
  goodsTotal: 'مبلغ کالاها',
  granularity: 'بازه‌ی گزارش',
  hex: 'کد رنگ',
  inStock: 'فقط کالاهای موجود',
  is_active: 'وضعیت فعال بودن',
  is_default: 'پیش‌فرض بودن',
  is_filterable: 'قابل فیلتر بودن',
  is_published: 'نمایش در فروشگاه',
  is_required: 'الزامی بودن',
  is_variant_axis: 'محور گزینه بودن',
  items: 'اقلام',
  limit: 'تعداد در صفحه',
  logo_url: 'نشانی لوگو',
  maxPrice: 'حداکثر قیمت',
  max_discount_amount: 'سقف تخفیف',
  message: 'پیام',
  minPrice: 'حداقل قیمت',
  min_order_amount: 'حداقل مبلغ سفارش',
  mobile: 'شماره موبایل',
  newPassword: 'رمز جدید',
  numeric_value: 'مقدار عددی',
  off_amount: 'مبلغ تخفیف',
  off_percent: 'درصد تخفیف',
  onSale: 'فقط کالاهای تخفیف‌دار',
  optionId: 'گزینه',
  options: 'گزینه‌ها',
  orderId: 'سفارش',
  orderItemId: 'قلم سفارش',
  page: 'شماره صفحه',
  parentId: 'دسته‌ی والد',
  password: 'رمز عبور',
  payOnDelivery: 'پرداخت در محل',
  payWithWallet: 'پرداخت با کیف پول',
  payWithZarinpal: 'پرداخت آنلاین',
  per_kg_cost: 'هزینه‌ی هر کیلوگرم',
  per_user_limit: 'سقف استفاده‌ی هر کاربر',
  postal_code: 'کد پستی',
  price: 'قیمت',
  productId: 'کالا',
  productIds: 'کالاها',
  product_id: 'کالا',
  province: 'استان',
  provinces: 'استان‌ها',
  quantity: 'تعداد',
  rate: 'امتیاز',
  reason: 'دلیل',
  receiver_mobile: 'موبایل گیرنده',
  reply_to: 'پاسخ به',
  restock: 'بازگشت به انبار',
  role: 'نقش',
  sale_ends_at: 'پایان حراج',
  sale_price: 'قیمت حراج',
  sale_starts_at: 'شروع حراج',
  search: 'عبارت جستجو',
  shippingMethodId: 'روش ارسال',
  sku: 'کد کالا (SKU)',
  slug: 'نامک',
  sortBy: 'مرتب‌سازی',
  sortOrder: 'ترتیب مرتب‌سازی',
  sort_order: 'ترتیب نمایش',
  starts_at: 'تاریخ شروع',
  status: 'وضعیت',
  stock: 'موجودی',
  subject: 'موضوع',
  supports_cash_on_delivery: 'پشتیبانی از پرداخت در محل',
  threshold: 'آستانه',
  title: 'عنوان',
  to: 'تاریخ پایان',
  tracking_code: 'کد رهگیری',
  type: 'نوع',
  unit: 'واحد',
  userId: 'کاربر',
  value: 'مقدار',
  value_boolean: 'مقدار بله/خیر',
  value_number: 'مقدار عددی',
  value_text: 'مقدار متنی',
  variantId: 'گزینه‌ی کالا',
  variant_id: 'گزینه‌ی کالا',
  variants: 'گزینه‌های کالا',
  weight_grams: 'وزن (گرم)',
  zoneId: 'منطقه‌ی ارسال',
};

// When a field breaks several rules at once, the most basic one is the one
// worth telling the user: "required" before "wrong type" before "too long".
const PRIORITY = [
  'whitelistValidation',
  'isDefined',
  'isNotEmpty',
  'isString',
  'isInt',
  'isNumber',
  'isBoolean',
  'isBooleanString',
  'isArray',
  'isObject',
  'isEnum',
  'isIn',
  'isDateString',
  'isUrl',
  'min',
  'max',
  'minLength',
  'maxLength',
  'isLength',
  'arrayMinSize',
  'arrayMaxSize',
  'arrayUnique',
  'matches',
];

const fa = (value: unknown): string =>
  typeof value === 'number' ? value.toLocaleString('fa-IR') : String(value);

export function labelFor(property: string): string {
  return FIELD_LABELS[property] ?? `«${property}»`;
}

// The numbers behind a constraint (the 5 and the 1000 in a length rule) are
// read from class-validator's own metadata, so the Persian sentence states
// the real limit even where the DTO's English message never mentioned it.
function constraintValues(
  target: object | undefined,
  property: string,
  key: string,
): unknown[] {
  if (!target) return [];
  const metadata = getMetadataStorage().getTargetValidationMetadatas(
    target.constructor,
    '',
    true,
    false,
  );
  const hit = metadata.find(
    (entry) =>
      entry.propertyName === property && (entry.name ?? entry.type) === key,
  );
  return (hit?.constraints as unknown[] | undefined) ?? [];
}

export function persianMessage(
  key: string,
  property: string,
  values: unknown[] = [],
): string {
  const label = labelFor(property);
  const [first, second] = values;

  switch (key) {
    case 'whitelistValidation':
      return `فیلد «${property}» مجاز نیست.`;
    case 'isDefined':
    case 'isNotEmpty':
      return `${label} الزامی است.`;
    case 'isString':
      return `${label} باید متن باشد.`;
    case 'isInt':
      return `${label} باید عدد صحیح باشد.`;
    case 'isNumber':
      return `${label} باید عدد باشد.`;
    case 'isBoolean':
    case 'isBooleanString':
      return `${label} باید بله یا خیر باشد.`;
    case 'isArray':
      return `${label} باید یک فهرست باشد.`;
    case 'isObject':
      return `${label} معتبر نیست.`;
    case 'isEnum':
    case 'isIn':
      return `مقدار ${label} مجاز نیست.`;
    case 'isDateString':
      return `${label} باید یک تاریخ معتبر باشد.`;
    case 'isUrl':
      return `${label} باید یک نشانی اینترنتی معتبر باشد.`;
    case 'min':
      if (first === 0) return `${label} نمی‌تواند منفی باشد.`;
      return first === undefined
        ? `${label} خیلی کم است.`
        : `${label} نباید کمتر از ${fa(first)} باشد.`;
    case 'max':
      return first === undefined
        ? `${label} خیلی زیاد است.`
        : `${label} نباید بیشتر از ${fa(first)} باشد.`;
    case 'minLength':
      return first === undefined
        ? `${label} خیلی کوتاه است.`
        : `${label} باید حداقل ${fa(first)} کاراکتر باشد.`;
    case 'maxLength':
      return first === undefined
        ? `${label} خیلی طولانی است.`
        : `${label} نباید بیشتر از ${fa(first)} کاراکتر باشد.`;
    case 'isLength':
      if (first !== undefined && second !== undefined) {
        return `${label} باید بین ${fa(first)} تا ${fa(second)} کاراکتر باشد.`;
      }
      return first === undefined
        ? `طول ${label} مجاز نیست.`
        : `${label} باید حداقل ${fa(first)} کاراکتر باشد.`;
    case 'arrayMinSize':
      return `${label} باید حداقل ${fa(first ?? 1)} مورد داشته باشد.`;
    case 'arrayMaxSize':
      return first === undefined
        ? `${label} مورد بیش از حد دارد.`
        : `${label} نباید بیش از ${fa(first)} مورد داشته باشد.`;
    case 'arrayUnique':
      return `${label} نباید مورد تکراری داشته باشد.`;
    case 'matches':
      return `قالب ${label} درست نیست.`;
    default:
      return `${label} معتبر نیست.`;
  }
}

export interface FieldError {
  path: string;
  message: string;
}

// One sentence per field, nested DTOs included (items.0.quantity).
export function toFieldErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldError[] {
  const out: FieldError[] = [];
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const keys = Object.keys(error.constraints ?? {});
    // A field that was simply left out fails whatever type check it carries
    // ("must be a string"), which is true but unhelpful. If nothing was sent,
    // the honest thing to say is that it is required. Optional fields never
    // get here empty - class-validator skips them - so this only fires for
    // fields that really are mandatory.
    const missing =
      error.value === undefined || error.value === null || error.value === '';
    if (keys.length && missing && !keys.includes('whitelistValidation')) {
      out.push({ path, message: persianMessage('isNotEmpty', error.property) });
    } else if (keys.length) {
      const key =
        [...keys].sort((a, b) => {
          const ia = PRIORITY.indexOf(a);
          const ib = PRIORITY.indexOf(b);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        })[0] ?? keys[0];
      out.push({
        path,
        message: persianMessage(
          key,
          error.property,
          constraintValues(error.target, error.property, key),
        ),
      });
    }
    if (error.children?.length) {
      out.push(...toFieldErrors(error.children, path));
    }
  }
  return out;
}

// The single place the global pipe is configured. main.ts and the e2e
// harness both build it from here, so the tests can never drift from what
// production runs.
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const fields = toFieldErrors(errors);
      return new BadRequestException({
        // Kept as an array: the exception filter already turns an array of
        // messages into VALIDATION_FAILED with one entry per field, and
        // both clients read it from there.
        message: fields.map((field) => field.message),
        code: ErrorCodes.VALIDATION_FAILED,
        // Keyed by path so a form can put each message under its own input.
        details: {
          fields: Object.fromEntries(
            fields.map((field) => [field.path, field.message]),
          ),
        },
      });
    },
  });
}
