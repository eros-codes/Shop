import { useCallback, useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { api, buildQuery } from '../lib/api';
import { formatDateTime } from '../lib/format';
import {
  EmptyState,
  Pagination,
  TableSkeleton,
} from '../components/Primitives';

const ACTIONS = {
  'order.status_changed': 'تغییر وضعیت سفارش',
  'order.refunded_late_payment': 'بازگشت وجه پرداخت دیرهنگام',
  'wallet.admin_charged': 'شارژ دستی کیف پول',
  'user.role_changed': 'تغییر نقش کاربر',
  'product.pricing_changed': 'تغییر قیمت یا موجودی کالا',
  'discount_code.created': 'ساخت کد تخفیف',
  'discount_code.updated': 'ویرایش کد تخفیف',
  'discount_code.deleted': 'حذف کد تخفیف',
  'return.requested': 'ثبت درخواست مرجوعی',
  'return.approved': 'تأیید مرجوعی',
  'return.rejected': 'رد مرجوعی',
  'return.received': 'دریافت کالای مرجوعی',
  'return.refunded': 'بازپرداخت مرجوعی',
};

export default function AuditLog() {
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(
        `/audit-logs${buildQuery({ page, limit: 25, action: action || undefined })}`,
        { auth: true },
      )
      .then((data) =>
        setResult({
          items: data?.items ?? [],
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 1,
        }),
      )
      .catch(() => setResult({ items: [], total: 0, totalPages: 1 }))
      .finally(() => setLoading(false));
  }, [page, action]);

  useEffect(load, [load]);

  return (
    <>
      <div className="toolbar">
        <select
          className="select"
          style={{ width: 260 }}
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
        >
          <option value="">همه فعالیت‌ها</option>
          {Object.entries(ACTIONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span className="small muted">
          {result.total.toLocaleString('fa-IR')} رویداد
        </span>
        <span className="tiny muted" style={{ marginInlineStart: 'auto' }}>
          این گزارش فقط خواندنی است و پاک نمی‌شود.
        </span>
      </div>

      <section className="card">
        {loading ? (
          <TableSkeleton cols={4} />
        ) : result.items.length === 0 ? (
          <EmptyState icon={<ScrollText size={26} />} title="رویدادی ثبت نشده است" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>زمان</th>
                  <th>فعالیت</th>
                  <th>مورد</th>
                  <th>انجام‌دهنده</th>
                  <th>جزئیات</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((entry) => (
                  <tr key={entry.id}>
                    <td className="tiny muted">{formatDateTime(entry.created_at)}</td>
                    <td className="small strong">
                      {ACTIONS[entry.action] ?? entry.action}
                    </td>
                    <td className="tiny muted">
                      {entry.entity_type}
                      {entry.entity_id ? ` #${entry.entity_id}` : ''}
                    </td>
                    <td className="small">
                      {entry.actor?.display_name ?? entry.actor_label ?? 'سیستم'}
                    </td>
                    <td className="tiny muted" style={{ maxWidth: 320 }}>
                      {entry.changes ? JSON.stringify(entry.changes) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} totalPages={result.totalPages} onChange={setPage} />
      </section>
    </>
  );
}
