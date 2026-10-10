import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { translateError } from '../../lib/errorMessages';
import { useFieldErrors } from '../../lib/useFieldErrors';
import { Button, Field } from '../../components/ui/Primitives';
import { TICKET_SUBJECTS } from './orderStatus';

export default function NewTicket() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fieldErrors = useFieldErrors();
  const [saving, setSaving] = useState(false);
  // Opening a ticket twice is exactly what the API's cooldown is there to
  // stop, so a double click should not get as far as asking it.
  const busyRef = useRef(false);

  // Other pages link here with the form already filled in - the order page
  // sends ?subject=order&title=… so the customer only has to describe it.
  const initialSubject = TICKET_SUBJECTS[params.get('subject')] ? params.get('subject') : '';
  const initialTitle = (params.get('title') ?? '').slice(0, 255);

  const submit = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    const form = new FormData(event.currentTarget);
    busyRef.current = true;
    setSaving(true);
    try {
      const ticket = await api.post(
        '/tickets',
        {
          subject: form.get('subject'),
          title: String(form.get('title') ?? '').trim(),
          description: String(form.get('description') ?? '').trim(),
        },
        { auth: true },
      );
      toast.success('تیکت ثبت شد؛ پاسخ کارشناسان همین‌جا نمایش داده می‌شود.');
      navigate(ticket?.id ? `/account/tickets/${ticket.id}` : '/account/tickets', {
        replace: true,
      });
    } catch (error) {
      if (fieldErrors.capture(error, ['subject', 'title', 'description'])) {
        toast.error('چند مورد از فرم نیاز به اصلاح دارد.');
      } else {
        toast.error(translateError(error));
      }
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <Link to="/account/tickets" className="row tiny muted" style={{ gap: 4 }}>
          <ArrowRight size={14} />
          همه تیکت‌ها
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>ثبت تیکت جدید</h1>
      </div>

      <form
        onSubmit={submit}
        onInput={(event) => fieldErrors.clearField(event.target.name)}
        className="card card-pad stack"
      >
        <Field label="موضوع" id="ticket-subject" error={fieldErrors.of('subject')}>
          <select
            id="ticket-subject"
            className="select"
            name="subject"
            defaultValue={initialSubject}
            required
          >
            <option value="" disabled>
              انتخاب کنید…
            </option>
            {Object.entries(TICKET_SUBJECTS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="عنوان" id="ticket-title" error={fieldErrors.of('title')}>
          <input
            id="ticket-title"
            className="input"
            name="title"
            defaultValue={initialTitle}
            maxLength={255}
            placeholder="خلاصه‌ی مشکل در یک جمله"
            aria-invalid={fieldErrors.of('title') ? 'true' : undefined}
            required
          />
        </Field>

        <Field
          label="شرح مشکل"
          id="ticket-description"
          error={fieldErrors.of('description')}
          hint="اگر به سفارش خاصی مربوط است، شماره‌ی آن را هم بنویسید."
        >
          <textarea
            id="ticket-description"
            className="textarea"
            name="description"
            maxLength={5000}
            style={{ minHeight: 160 }}
            required
          />
        </Field>

        <Button type="submit" variant="primary" loading={saving} style={{ alignSelf: 'flex-start' }}>
          <Send size={15} />
          ثبت تیکت
        </Button>
      </form>
    </div>
  );
}
