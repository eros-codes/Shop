import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Headphones, MessageSquare, Plus } from 'lucide-react';
import { api, buildQuery } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { ConnectionError, EmptyState, Pagination } from '../../components/ui/Primitives';
import { TICKET_STATUS, ticketSubject } from './orderStatus';

const FILTERS = [
  { value: '', label: 'همه' },
  ...Object.entries(TICKET_STATUS).map(([value, meta]) => ({ value, label: meta.label })),
];

export default function Tickets() {
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState({ items: [], totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const status = params.get('status') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    api
      .get(`/tickets${buildQuery({ status: status || undefined, page, limit: 10 })}`, {
        auth: true,
      })
      .then((data) =>
        setResult({ items: data?.items ?? [], totalPages: data?.totalPages ?? 1 }),
      )
      .catch(() => {
        setResult({ items: [], totalPages: 1 });
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(load, [load]);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    });
    setParams(next);
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>تیکت‌های پشتیبانی</h1>
        <Link className="btn btn-soft btn-sm" to="/account/tickets/new">
          <Plus size={15} />
          تیکت جدید
        </Link>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map((filter) => (
          <button
            key={filter.value || 'all'}
            type="button"
            className="chip"
            data-active={status === filter.value}
            onClick={() => update({ status: filter.value, page: '' })}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 220, borderRadius: 16 }} />
      ) : failed ? (
        <div className="card">
          <ConnectionError onRetry={load} />
        </div>
      ) : result.items.length === 0 ? (
        <div className="card">
          {status ? (
            <EmptyState
              icon={<Headphones size={28} />}
              title="تیکتی با این وضعیت ندارید"
            />
          ) : (
            <EmptyState
              icon={<Headphones size={28} />}
              title="هنوز تیکتی ثبت نکرده‌اید"
              description="سؤال یا مشکلی دارید؟ تیکت ثبت کنید تا کارشناسان پشتیبانی همین‌جا پاسخ دهند."
              action={
                <Link className="btn btn-primary" to="/account/tickets/new">
                  ثبت تیکت جدید
                </Link>
              }
            />
          )}
        </div>
      ) : (
        <>
          {result.items.map((ticket) => {
            const meta = TICKET_STATUS[ticket.status] ?? {
              label: ticket.status,
              tone: 'muted',
            };
            return (
              <Link
                key={ticket.id}
                to={`/account/tickets/${ticket.id}`}
                className="order-card"
              >
                <div className="spread" style={{ flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                    <div className="strong" style={{ overflowWrap: 'anywhere' }}>
                      {ticket.title}
                    </div>
                    <div className="tiny muted">
                      {ticketSubject(ticket.subject)} — ثبت در {formatDate(ticket.created_at)}
                    </div>
                  </div>

                  <span className="row tiny muted" style={{ gap: 5 }}>
                    <MessageSquare size={14} />
                    {((ticket.repliesCount ?? 0) + 1).toLocaleString('fa-IR')} پیام
                  </span>

                  <span className={`badge badge-${meta.tone}`}>{meta.label}</span>
                </div>
              </Link>
            );
          })}

          <Pagination
            page={page}
            totalPages={result.totalPages}
            onChange={(next) => update({ page: next })}
          />
        </>
      )}
    </div>
  );
}
