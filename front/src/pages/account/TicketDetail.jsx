import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Headphones, Lock, Send, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { translateError } from '../../lib/errorMessages';
import { useFieldErrors } from '../../lib/useFieldErrors';
import { formatDateTime, toPersianDigits } from '../../lib/format';
import { Button, ConnectionError, EmptyState, Field } from '../../components/ui/Primitives';
import { TICKET_STATUS, ticketSubject } from './orderStatus';

const STATUS_NOTE = {
  open: 'پیام شما ثبت شده و کارشناسان پشتیبانی به‌زودی پاسخ می‌دهند.',
  answered: 'کارشناس پشتیبانی پاسخ داده است. اگر سؤال دیگری دارید، همین‌جا بنویسید.',
};

// Replies come back oldest first, at most 100 a page. Reading only the
// first page would silently drop the newest messages - the very ones the
// customer opened the page to see.
async function fetchReplies(ticketId) {
  const first = await api.get(`/tickets/${ticketId}/replies?limit=100`, { auth: true });
  const totalPages = first?.totalPages ?? 1;
  if (totalPages <= 1) return first?.items ?? [];
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      api.get(`/tickets/${ticketId}/replies?limit=100&page=${index + 2}`, { auth: true }),
    ),
  );
  return [first, ...rest].flatMap((data) => data?.items ?? []);
}

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const fieldErrors = useFieldErrors();
  const [ticket, setTicket] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  // "This ticket does not exist" and "we could not reach the server" need
  // different words, and only one of them is worth retrying.
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const head = await api.get(`/tickets/${id}`, { auth: true });
      // A reply has an id of its own; land on the conversation it belongs to.
      if (head?.reply_to?.id) {
        navigate(`/account/tickets/${head.reply_to.id}`, { replace: true });
        return;
      }
      setReplies(await fetchReplies(id));
      setTicket(head);
    } catch (error) {
      setTicket(null);
      setFailed(!error?.status || error.status >= 500);
    }
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const sendReply = async (event) => {
    event.preventDefault();
    const description = text.trim();
    if (!description || busyRef.current) return;
    busyRef.current = true;
    setSending(true);
    try {
      // Every message is a ticket of its own in the API, so a reply carries
      // the conversation's title and subject along with its text.
      await api.post(
        '/tickets',
        {
          title: ticket.title,
          subject: ticket.subject,
          description,
          reply_to: ticket.id,
        },
        { auth: true },
      );
      setText('');
      fieldErrors.clear();
      await load();
    } catch (error) {
      if (!fieldErrors.capture(error, ['description'])) {
        toast.error(translateError(error));
      }
      // Closed by support while the customer was typing: show it as closed.
      if (error?.code === 'TICKET_CLOSED') load();
    } finally {
      busyRef.current = false;
      setSending(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/tickets/${ticket.id}`, undefined, { auth: true });
      toast.success('تیکت حذف شد');
      navigate('/account/tickets', { replace: true });
    } catch (error) {
      toast.error(translateError(error));
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="skeleton" style={{ height: 320, borderRadius: 16 }} />;
  }

  if (!ticket) {
    return (
      <div className="card">
        {failed ? (
          <ConnectionError onRetry={load} />
        ) : (
          <EmptyState
            title="این تیکت پیدا نشد"
            action={
              <Link className="btn btn-primary" to="/account/tickets">
                بازگشت به تیکت‌ها
              </Link>
            }
          />
        )}
      </div>
    );
  }

  const meta = TICKET_STATUS[ticket.status] ?? { label: ticket.status, tone: 'muted' };
  const closed = ticket.status === 'closed';
  const ownerId = ticket.user?.id;
  // The opening message is the ticket itself; everything after it is a reply.
  const messages = [ticket, ...replies];

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card card-pad">
        <Link to="/account/tickets" className="row tiny muted" style={{ gap: 4 }}>
          <ArrowRight size={14} />
          همه تیکت‌ها
        </Link>
        <div className="spread" style={{ flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
          <div style={{ minWidth: 0, flex: '1 1 240px' }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, overflowWrap: 'anywhere' }}>
              {ticket.title}
            </h1>
            <div className="tiny muted">
              تیکت #{toPersianDigits(ticket.id)} — {ticketSubject(ticket.subject)} — ثبت در{' '}
              {formatDateTime(ticket.created_at)}
            </div>
          </div>
          <span className={`badge badge-${meta.tone}`}>{meta.label}</span>
        </div>
        {STATUS_NOTE[ticket.status] ? (
          <p className="small muted" style={{ marginTop: 10 }}>
            {STATUS_NOTE[ticket.status]}
          </p>
        ) : null}
      </div>

      <div className="ticket-thread">
        {messages.map((message) => {
          const own = message.user?.id === ownerId;
          return (
            <div className="ticket-msg" data-own={own} key={message.id}>
              <div className="ticket-msg-head">
                {own ? (
                  <span className="tiny strong">شما</span>
                ) : (
                  <span className="row tiny strong" style={{ gap: 5, color: 'var(--brand-700)' }}>
                    <Headphones size={14} />
                    پشتیبانی تل‌کال
                  </span>
                )}
                <span className="tiny muted">{formatDateTime(message.created_at)}</span>
              </div>
              <p className="ticket-msg-body">{message.description}</p>
            </div>
          );
        })}
      </div>

      {closed ? (
        <div className="card card-pad spread" style={{ flexWrap: 'wrap', gap: 10 }}>
          <span className="row small muted" style={{ gap: 8 }}>
            <Lock size={16} />
            این تیکت بسته شده است. اگر هنوز مشکلی دارید، تیکت تازه‌ای ثبت کنید.
          </span>
          <Link className="btn btn-soft btn-sm" to="/account/tickets/new">
            ثبت تیکت جدید
          </Link>
        </div>
      ) : (
        <form
          onSubmit={sendReply}
          onInput={() => fieldErrors.clearField('description')}
          className="card card-pad stack"
        >
          <Field label="پاسخ شما" id="ticket-reply" error={fieldErrors.of('description')}>
            <textarea
              id="ticket-reply"
              className="textarea"
              value={text}
              maxLength={5000}
              onChange={(event) => setText(event.target.value)}
              placeholder="پیام خود را بنویسید…"
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            loading={sending}
            disabled={!text.trim()}
            style={{ alignSelf: 'flex-start' }}
          >
            <Send size={15} />
            ارسال پاسخ
          </Button>
        </form>
      )}

      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        {confirmDelete ? (
          <>
            <span className="small">این گفتگو با همه‌ی پیام‌هایش حذف شود؟</span>
            <Button variant="danger" size="sm" loading={deleting} onClick={remove}>
              بله، حذف شود
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              انصراف
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} />
            حذف این تیکت
          </Button>
        )}
      </div>
    </div>
  );
}
