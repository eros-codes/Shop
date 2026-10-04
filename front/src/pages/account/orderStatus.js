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
