// The order lifecycle, as the storefront names it.
export const ORDER_STATUS = {
  pending: { label: 'در انتظار پرداخت', tone: 'warning' },
  awaiting_payment: { label: 'در انتظار پرداخت', tone: 'warning' },
  paid: { label: 'پرداخت شد', tone: 'success' },
  processing: { label: 'در حال آماده‌سازی', tone: '' },
  sent: { label: 'ارسال شد', tone: '' },
  delivered: { label: 'تحویل داده شد', tone: 'success' },
  cancelled: { label: 'لغو شد', tone: 'danger' },
};

export const TIMELINE = ['paid', 'processing', 'sent', 'delivered'];

export const RETURN_STATUS = {
  requested: { label: 'در انتظار بررسی', tone: 'warning' },
  approved: { label: 'تأیید شد', tone: '' },
  received: { label: 'کالا دریافت شد', tone: '' },
  refunded: { label: 'مبلغ بازگشت داده شد', tone: 'success' },
  rejected: { label: 'رد شد', tone: 'danger' },
  cancelled: { label: 'لغو شد', tone: 'muted' },
};

// "Open" means the ball is in support's court: the API moves a ticket back
// to open whenever the customer writes, and to answered when support does.
export const TICKET_STATUS = {
  open: { label: 'در انتظار پاسخ', tone: 'warning' },
  answered: { label: 'پاسخ داده شد', tone: 'success' },
  closed: { label: 'بسته شد', tone: 'muted' },
};

// Stored in the ticket's `subject` as the key, so the admin panel can show
// the same wording. Anything else - a ticket opened straight through the
// API - is shown as it was written.
export const TICKET_SUBJECTS = {
  order: 'پیگیری سفارش',
  payment: 'پرداخت و کیف پول',
  return: 'مرجوعی و ضمانت',
  product: 'سؤال درباره‌ی کالا',
  account: 'حساب کاربری',
  other: 'سایر موارد',
};

export function ticketSubject(value) {
  return TICKET_SUBJECTS[value] ?? value ?? '—';
}
