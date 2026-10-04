import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { translateError } from '../../lib/errorMessages';
import { Button, Field } from '../../components/ui/Primitives';

export default function ChangePassword() {
  const { changePassword, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await changePassword(form);
      // Changing it signs every session out on the server, so the
      // honest thing is to send the customer back to the sign-in page.
      toast.success('رمز عبور تغییر کرد؛ دوباره وارد شوید');
      await logout();
      navigate('/login', { replace: true });
    } catch (apiError) {
      setError(translateError(apiError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="card card-pad stack" style={{ maxWidth: 440 }}>
      <h1 style={{ fontSize: 17, fontWeight: 700 }}>تغییر رمز عبور</h1>

      <Field label="رمز عبور فعلی">
        <input
          className="input"
          type="password"
          value={form.currentPassword}
          onChange={(event) =>
            setForm((current) => ({ ...current, currentPassword: event.target.value }))
          }
          required
        />
      </Field>

      <Field
        label="رمز عبور جدید"
        error={error}
        hint="حداقل ۸ کاراکتر، شامل حرف بزرگ، حرف کوچک و عدد"
      >
        <input
          className="input"
          type="password"
          value={form.newPassword}
          onChange={(event) =>
            setForm((current) => ({ ...current, newPassword: event.target.value }))
          }
          required
        />
      </Field>

      <Button type="submit" variant="primary" loading={loading}>
        تغییر رمز عبور
      </Button>

      <p className="tiny muted">
        پس از تغییر رمز، همه‌ی دستگاه‌های واردشده از حساب خارج می‌شوند.
      </p>
    </form>
  );
}
