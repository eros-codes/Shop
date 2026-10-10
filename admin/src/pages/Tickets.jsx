import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Headphones, Trash2 } from 'lucide-react';
import { api, buildQuery } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { formatDateTime, toPersianDigits } from '../lib/format';
import { notifyTicketsChanged } from '../lib/tickets';
import { TICKET_STATUS, ticketSubject } from '../lib/status';
import {
  Confirm,
  ConnectionError,
  EmptyState,
  Pagination,
  SearchBox,
  TableSkeleton,
} from '../components/Primitives';
import TicketDrawer from './TicketDrawer';

export default function Tickets() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  // Tracked separately from the data so a dead connection is not rendered as
  // an inbox with nothing in it.
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const status = params.get('status') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    api
      .get(`/tickets${buildQuery({ status: status || undefined, page, limit: 20 })}`, {
        auth: true,
      })
      .then((data) =>
        setResult({
          items: data?.items ?? [],
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 1,
        }),
      )
      .catch(() => {
        setResult({ items: [], total: 0, totalPages: 1 });
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

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/tickets/${removing.id}`, undefined, { auth: true });
      toast.success('تیکت حذف شد');
      setRemoving(null);
      load();
      notifyTicketsChanged();
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      setDeleting(false);
    }
  };

  // The API has no text search for tickets, so this narrows the page on
  // screen - the same as the orders list does.
  const term = search.trim();
  const rows = term
    ? result.items.filter(
        (ticket) =>
          String(ticket.id).includes(term) ||
          (ticket.title ?? '').includes(term) ||
          (ticket.user?.mobile ?? '').includes(term) ||
          (ticket.user?.display_name ?? '').includes(term),
      )
    : result.items;

  return (
    <>
      <div className="toolbar">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="شماره تیکت، عنوان، نام یا موبایل…"
        />

        <select
          className="select"
          style={{ width: 190 }}
          value={status}
          onChange={(event) => update({ status: event.target.value, page: '' })}
        >
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(TICKET_STATUS).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>

        <span className="small muted" style={{ marginInlineStart: 'auto' }}>
          {result.total.toLocaleString('fa-IR')} تیکت
        </span>
      </div>

      <section className="card">
        {loading ? (
          <TableSkeleton cols={6} />
        ) : failed ? (
          <ConnectionError onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Headphones size={26} />}
            title={status === 'open' ? 'تیکتی در انتظار پاسخ نیست' : 'تیکتی پیدا نشد'}
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>تیکت</th>
                  <th>مشتری</th>
                  <th>وضعیت</th>
                  <th>پیام‌ها</th>
                  <th>تاریخ ثبت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((ticket) => {
                  const meta = TICKET_STATUS[ticket.status] ?? {
                    label: ticket.status,
                    tone: 'muted',
                  };
                  return (
                    <tr key={ticket.id}>
                      <td style={{ maxWidth: 340 }}>
                        <button
                          type="button"
                          className="strong"
                          style={{
                            border: 'none',
                            background: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            textAlign: 'start',
                            overflowWrap: 'anywhere',
                          }}
                          onClick={() => setOpenId(ticket.id)}
                        >
                          {ticket.title}
                        </button>
                        <div className="tiny muted">
                          #{toPersianDigits(ticket.id)} — {ticketSubject(ticket.subject)}
                        </div>
                      </td>
                      <td>
                        <div className="small">{ticket.user?.display_name ?? '—'}</div>
                        <div className="tiny muted">{ticket.user?.mobile}</div>
                      </td>
                      <td>
                        <span className={`badge badge-${meta.tone}`}>{meta.label}</span>
                      </td>
                      <td className="small">
                        {((ticket.repliesCount ?? 0) + 1).toLocaleString('fa-IR')}
                      </td>
                      <td className="tiny muted">{formatDateTime(ticket.created_at)}</td>
                      <td>
                        <div className="cell-actions">
                          <button
                            className="icon-btn"
                            onClick={() => setOpenId(ticket.id)}
                            title="مشاهده و پاسخ"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            className="icon-btn danger"
                            onClick={() => setRemoving(ticket)}
                            title="حذف"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={result.totalPages}
          onChange={(next) => update({ page: next })}
        />
      </section>

      {openId ? (
        <TicketDrawer
          ticketId={openId}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      ) : null}

      {removing ? (
        <Confirm
          title="حذف تیکت"
          message={`گفتگوی «${removing.title}» با همه‌ی پاسخ‌هایش حذف شود؟ مشتری هم دیگر آن را نمی‌بیند.`}
          onConfirm={remove}
          onClose={() => setRemoving(null)}
          loading={deleting}
        />
      ) : null}
    </>
  );
}
