// "pending" is only ever a cash-on-delivery order waiting for the shop to
// take it on; an online order that is not paid yet is "awaiting_payment".
export const ORDER_STATUS = {
  pending: { label: 'در انتظار تأیید', tone: 'warning' },
  awaiting_payment: { label: 'در انتظار پرداخت', tone: 'warning' },
  paid: { label: 'پرداخت شده', tone: 'success' },
  processing: { label: 'در حال آماده‌سازی', tone: '' },
  sent: { label: 'ارسال شده', tone: '' },
  delivered: { label: 'تحویل شده', tone: 'success' },
  cancelled: { label: 'لغو شده', tone: 'danger' },
};

// What an admin may move an order to next, mirroring the API's own state
// machine - offering a transition the server will refuse is just a way
// to produce error toasts.
export const NEXT_STATUS = {
  pending: ['paid', 'cancelled'],
  awaiting_payment: ['cancelled'],
  paid: ['processing', 'cancelled'],
  processing: ['sent', 'cancelled'],
  sent: ['delivered'],
  delivered: [],
  cancelled: [],
};

// Cash on delivery is paid at the door, so it has two more ways forward
// (see allowedNextStatuses in the API): straight into preparation, and
// back from "sent" when the customer refuses the parcel.
export function nextStatuses(order) {
  const base = NEXT_STATUS[order?.status] ?? [];
  if (order?.payment_method !== 'cash_on_delivery') return base;
  if (order.status === 'pending') return ['processing', ...base];
  if (order.status === 'sent' && !order.payed_time) return [...base, 'cancelled'];
  return base;
}

// How a move reads for this order - "cancelled" from "sent" is a parcel
// that came back, and "paid" before shipping is money taken early.
export function transitionLabel(order, status) {
  const cod = order?.payment_method === 'cash_on_delivery';
  if (cod && order.status === 'pending' && status === 'processing') {
    return 'تأیید و شروع آماده‌سازی';
  }
  if (cod && order.status === 'pending' && status === 'paid') {
    return 'وجه پیش از ارسال دریافت شد';
  }
  if (cod && order.status === 'sent' && status === 'cancelled') {
    return 'تحویل نشد / برگشت مرسوله';
  }
  if (cod && status === 'delivered') return 'تحویل شد و وجه دریافت شد';
  return ORDER_STATUS[status]?.label ?? status;
}

export const RETURN_STATUS = {
  requested: { label: 'در انتظار بررسی', tone: 'warning' },
  approved: { label: 'تأیید شده', tone: '' },
  received: { label: 'کالا دریافت شد', tone: '' },
  refunded: { label: 'بازپرداخت شد', tone: 'success' },
  rejected: { label: 'رد شده', tone: 'danger' },
  cancelled: { label: 'لغو شده', tone: 'muted' },
};

export const NEXT_RETURN_STATUS = {
  requested: ['approved', 'rejected'],
  approved: ['received', 'rejected'],
  received: ['refunded'],
  refunded: [],
  rejected: [],
  cancelled: [],
};

export const RETURN_REASONS = {
  damaged: 'کالا آسیب‌دیده بود',
  wrong_item: 'کالای اشتباه ارسال شد',
  not_as_described: 'مطابق توضیحات نبود',
  changed_mind: 'منصرف شدم',
  other: 'دلیل دیگر',
};

export const PAYMENT_METHODS = {
  wallet: 'کیف پول',
  zarinpal: 'درگاه اینترنتی',
  cash_on_delivery: 'پرداخت در محل',
};

// "Open" means the customer is waiting on support: the API moves a ticket
// back to open whenever the customer writes, and to answered when support
// replies.
export const TICKET_STATUS = {
  open: { label: 'در انتظار پاسخ', tone: 'warning' },
  answered: { label: 'پاسخ داده شده', tone: 'success' },
  closed: { label: 'بسته شده', tone: 'muted' },
};

// The storefront files a ticket under one of these keys. Anything else - a
// ticket opened straight through the API - is shown as it was written.
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
