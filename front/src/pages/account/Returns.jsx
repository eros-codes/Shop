import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate, formatToman } from '../../lib/format';
import { EmptyState } from '../../components/ui/Primitives';
import { RETURN_STATUS } from './orderStatus';

export default function Returns() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/returns?limit=50', { auth: true })
      .then((data) => setReturns(data?.items ?? []))
      .catch(() => setReturns([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />;
  }

  if (returns.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<RotateCcw size={28} />}
          title="درخواست مرجوعی ندارید"
          description="از صفحه‌ی سفارش تحویل‌شده می‌توانید درخواست مرجوعی ثبت کنید."
        />
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {returns.map((request) => {
        const status = RETURN_STATUS[request.status] ?? {
          label: request.status,
          tone: 'muted',
        };
        return (
          <div className="card card-pad spread" key={request.id} style={{ flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div className="strong small">
                مرجوعی سفارش {request.order?.invoice_number ?? `#${request.order?.id}`}
              </div>
              <div className="tiny muted">ثبت در {formatDate(request.created_at)}</div>
              {request.admin_note ? (
                <div className="tiny muted">پاسخ پشتیبانی: {request.admin_note}</div>
              ) : null}
            </div>
            <span className={`badge badge-${status.tone}`}>{status.label}</span>
            {Number(request.refund_amount) > 0 ? (
              <span className="strong small" style={{ color: 'var(--success-600)' }}>
                {formatToman(request.refund_amount)} بازگشت داده شد
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
