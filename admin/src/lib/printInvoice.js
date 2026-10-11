import { formatToman } from './format';
import { PAYMENT_METHODS } from './status';

const persianDate = (value) => {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      dateStyle: 'long',
      timeZone: 'Asia/Tehran',
    }).format(new Date(value));
  } catch {
    return '';
  }
};

const STYLE = `
  @page { size: A5; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Vazirmatn, Tahoma, sans-serif; color: #111; margin: 0; font-size: 12px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .row { display: flex; justify-content: space-between; gap: 12px; }
  .muted { color: #555; }
  .box { border: 1px solid #bbb; border-radius: 6px; padding: 8px 10px; margin: 10px 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th, td { border: 1px solid #bbb; padding: 5px 6px; text-align: start; }
  th { background: #f2f2f2; }
  .num { white-space: nowrap; }
  .total { font-weight: 700; font-size: 13px; }
`;

// The order as a printable invoice / packing slip, in a window of its own.
// Built node by node with textContent - names and addresses are typed by
// customers, and none of it may become markup in a page of ours.
export function printInvoice(order, { shopName = 'تل‌کال' } = {}) {
  const win = window.open('', '_blank', 'width=720,height=900');
  if (!win) return false;
  const doc = win.document;
  doc.open();
  doc.write('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"></head><body></body></html>');
  doc.close();
  doc.title = `فاکتور ${order.invoice_number ?? `#${order.id}`}`;

  const el = (tag, text, className) => {
    const node = doc.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  };
  const style = el('style', STYLE);
  doc.head.appendChild(style);
  const body = doc.body;

  const header = el('div', undefined, 'row');
  const titles = el('div');
  titles.appendChild(el('h1', `${shopName} — فاکتور فروش`));
  titles.appendChild(el('div', `شماره: ${order.invoice_number ?? `#${order.id}`}`, 'muted'));
  header.appendChild(titles);
  const dates = el('div');
  dates.appendChild(el('div', `تاریخ سفارش: ${persianDate(order.createdAt ?? order.created_at)}`));
  if (order.payed_time) dates.appendChild(el('div', `پرداخت: ${persianDate(order.payed_time)}`, 'muted'));
  header.appendChild(dates);
  body.appendChild(header);

  const address = order.shippingAddressSnapshot ?? {};
  const to = el('div', undefined, 'box');
  to.appendChild(el('div', `گیرنده: ${order.user?.display_name ?? ''} — ${address.receiver_mobile ?? order.user?.mobile ?? ''}`));
  to.appendChild(
    el('div', `نشانی: ${[address.province, address.city, address.address].filter(Boolean).join('، ')}`),
  );
  if (address.postal_code) to.appendChild(el('div', `کد پستی: ${address.postal_code}`));
  to.appendChild(
    el(
      'div',
      `ارسال: ${order.shipping_method_title ?? '—'} — پرداخت: ${PAYMENT_METHODS[order.payment_method] ?? '—'}`,
      'muted',
    ),
  );
  body.appendChild(to);

  const table = el('table');
  const head = el('tr');
  ['ردیف', 'کالا', 'گزینه', 'تعداد', 'قیمت واحد', 'جمع'].forEach((label) => head.appendChild(el('th', label)));
  table.appendChild(head);
  (order.items ?? []).forEach((item, index) => {
    const row = el('tr');
    row.appendChild(el('td', (index + 1).toLocaleString('fa-IR')));
    row.appendChild(el('td', item.product?.title ?? ''));
    row.appendChild(el('td', [item.variant_title, item.variant_sku].filter(Boolean).join(' — ')));
    row.appendChild(el('td', Number(item.quantity).toLocaleString('fa-IR')));
    row.appendChild(el('td', formatToman(item.price), 'num'));
    row.appendChild(el('td', formatToman(item.price * item.quantity), 'num'));
    table.appendChild(row);
  });
  body.appendChild(table);

  const totals = el('div', undefined, 'box');
  const line = (label, value, className) => {
    const row = el('div', undefined, `row ${className ?? ''}`);
    row.appendChild(el('span', label));
    row.appendChild(el('span', value, 'num'));
    totals.appendChild(row);
  };
  line('جمع کالاها', formatToman(order.items_total));
  if (Number(order.discount_amount) > 0) line('تخفیف', `−${formatToman(order.discount_amount)}`);
  line('هزینه ارسال', formatToman(order.shipping_cost));
  if (Number(order.cod_fee) > 0) line('کارمزد پرداخت در محل', formatToman(order.cod_fee));
  line('مالیات بر ارزش افزوده', formatToman(order.tax_amount));
  line('مبلغ کل', formatToman(order.total_price), 'total');
  if (order.payment_method === 'cash_on_delivery' && !order.payed_time) {
    line('دریافت از مشتری هنگام تحویل', formatToman(order.total_price), 'total');
  }
  body.appendChild(totals);

  win.focus();
  // A beat for the layout (and the font) before the print dialog.
  win.setTimeout(() => win.print(), 300);
  return true;
}
