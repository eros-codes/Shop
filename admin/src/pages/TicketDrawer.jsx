import { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, Lock, Send } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { useFieldErrors } from '../lib/useFieldErrors';
import { formatDateTime, toPersianDigits } from '../lib/format';
import { fetchReplies, notifyTicketsChanged } from '../lib/tickets';
import { TICKET_STATUS, ticketSubject } from '../lib/status';
import { Button, Field, Modal } from '../components/Primitives';

export default function TicketDrawer({ ticketId, onClose, onChanged }) {
  const toast = useToast();
  const fieldErrors = useFieldErrors();
  const [ticket, setTicket] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  // "This ticket was not found" is a different thing to say than "we could
  // not reach the server", and the admin needs to know which one it is.
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  // State only disables a button on the next render, so a fast double click
  // would post the same answer to the customer twice.
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [head, thread] = await Promise.all([
        api.get(`/tickets/${ticketId}`, { auth: true }),
        fetchReplies(ticketId),
      ]);
      setTicket(head);
      setReplies(thread);
    } catch (error) {
      setTicket(null);
      setFailed(!error?.status || error.status >= 500);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const changed = () => {
    onChanged?.();
    notifyTicketsChanged();
  };

  const sendReply = async (event) => {
    event.preventDefault();
    const description = text.trim();
    if (!description || busyRef.current) return;
    busyRef.current = true;
    setSending(true);
    try {
      // Every message is a ticket of its own in the API, so a reply carries
      // the conversation's title and subject along with its text. The API
      // marks the thread "answered" when support replies.
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
      toast.success('پاسخ برای مشتری ثبت شد');
      await load();
      changed();
    } catch (error) {
      if (!fieldErrors.capture(error, ['description'])) {
        toast.error(translateError(error));
      }
    } finally {
      busyRef.current = false;
      setSending(false);
    }
  };

  const setStatus = async (status) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatusSaving(true);
    try {
      await api.patch(`/tickets/${ticket.id}`, { status }, { auth: true });
      toast.success(status === 'closed' ? 'تیکت بسته شد' : 'تیکت بازگشایی شد');
      await load();
      changed();
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      busyRef.current = false;
      setStatusSaving(false);
    }
  };

  const meta = TICKET_STATUS[ticket?.status] ?? { label: ticket?.status, tone: 'muted' };
  const closed = ticket?.status === 'closed';
  const ownerId = ticket?.user?.id;
  // The opening message is the ticket itself; everything after it is a reply.
  const messages = ticket ? [ticket, ...replies] : [];

  return (
    <Modal
      wide
      title={loading ? 'در حال بارگذاری…' : `تیکت #${toPersianDigits(ticketId)}`}
      onClose={onClose}
      footer={
        ticket ? (
          closed ? (
            <Button variant="soft" onClick={() => setStatus('open')} loading={statusSaving}>
              بازگشایی تیکت
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setStatus('closed')} loading={statusSaving}>
              <Lock size={15} />
              بستن تیکت
            </Button>
          )
        ) : null
      }
    >
      {loading ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : !ticket ? (
        <p className="small muted">
          {failed
            ? 'ارتباط با سرور برقرار نشد؛ لطفاً دوباره تلاش کنید.'
            : 'این تیکت پیدا نشد.'}
        </p>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div>
            <div className="strong" style={{ fontSize: 15, overflowWrap: 'anywhere' }}>
              {ticket.title}
            </div>
          </div>

          <div className="grid cols-4">
            <div>
              <div className="tiny muted">وضعیت</div>
              <span className={`badge badge-${meta.tone}`}>{meta.label}</span>
            </div>
            <div>
              <div className="tiny muted">موضوع</div>
              <div className="small strong">{ticketSubject(ticket.subject)}</div>
            </div>
            <div>
              <div className="tiny muted">مشتری</div>
              <div className="small strong">{ticket.user?.display_name ?? '—'}</div>
              <div className="tiny muted">{ticket.user?.mobile}</div>
            </div>
            <div>
              <div className="tiny muted">ثبت</div>
              <div className="small">{formatDateTime(ticket.created_at)}</div>
            </div>
          </div>

          <div className="thread">
            {messages.map((message) => {
              // Support's own answers sit on the start side, like a chat.
              const fromSupport = message.user?.id !== ownerId;
              return (
                <div className="thread-msg" data-own={fromSupport} key={message.id}>
                  <div className="thread-msg-head">
                    {fromSupport ? (
                      <span className="row tiny strong" style={{ gap: 5, color: 'var(--brand-700)' }}>
                        <Headphones size={13} />
                        {message.user?.display_name ?? 'پشتیبانی'}
                      </span>
                    ) : (
                      <span className="tiny strong">
                        {ticket.user?.display_name ?? 'مشتری'}
                        <span className="muted"> (مشتری)</span>
                      </span>
                    )}
                    <span className="tiny muted">{formatDateTime(message.created_at)}</span>
                  </div>
                  <p className="thread-msg-body">{message.description}</p>
                </div>
              );
            })}
          </div>

          {closed ? (
            <div className="card card-pad row small muted" style={{ gap: 8 }}>
              <Lock size={16} />
              این تیکت بسته است. برای پاسخ‌دادن، ابتدا آن را بازگشایی کنید.
            </div>
          ) : (
            <form
              className="card card-pad stack"
              onSubmit={sendReply}
              onInput={() => fieldErrors.clearField('description')}
            >
              <Field
                label="پاسخ به مشتری"
                error={fieldErrors.of('description')}
                hint="با ارسال پاسخ، وضعیت تیکت «پاسخ داده شده» می‌شود."
              >
                <textarea
                  className="textarea"
                  value={text}
                  maxLength={5000}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="پاسخ خود را بنویسید…"
                />
              </Field>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button type="submit" loading={sending} disabled={!text.trim()}>
                  <Send size={15} />
                  ارسال پاسخ
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
