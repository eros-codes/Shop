import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { Button, Field } from '../components/ui/Primitives';
import { RESEND_SECONDS, cooldownFrom, useCountdown } from '../lib/useCountdown';

export default function ForgotPassword() {
  const { forgotPassword, resetPassword } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [stage, setStage] = useState('request');
  const [mobile, setMobile] = useState('');
  const [form, setForm] = useState({ code: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useCountdown();

  const request = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await forgotPassword(mobile.trim());
      setStage('reset');
      setResendIn(RESEND_SECONDS);
      // The API answers the same way whether or not the number has an
      // account, so this message does too.
      toast.success('اگر این شماره حساب داشته باشد، کد بازیابی پیامک شد');
    } catch (apiError) {
      setResendIn(cooldownFrom(apiError));
      setError(translateError(apiError));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      await forgotPassword(mobile.trim());
      setForm((current) => ({ ...current, code: '' }));
      setResendIn(RESEND_SECONDS);
      toast.success('اگر این شماره حساب داشته باشد، کد تازه پیامک شد');
    } catch (apiError) {
      setResendIn(cooldownFrom(apiError));
      setError(translateError(apiError));
    } finally {
      setResending(false);
    }
  };

  const reset = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await resetPassword({
        mobile: mobile.trim(),
        code: form.code.trim(),
        password: form.password,
      });
      toast.success('رمز عبور تغییر کرد؛ حالا وارد شوید');
      navigate('/login', { replace: true });
    } catch (apiError) {
      setError(translateError(apiError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">بازیابی رمز عبور</h1>
        <p className="auth-sub">
          {stage === 'request'
            ? 'شماره موبایل حساب‌تان را وارد کنید تا کد بازیابی بفرستیم.'
            : 'کد پیامک‌شده و رمز عبور جدید را وارد کنید.'}
        </p>

        {stage === 'request' ? (
          <form onSubmit={request} className="stack">
            <Field label="شماره موبایل" error={error}>
              <input
                className="input"
                inputMode="numeric"
                placeholder="09123456789"
                value={mobile}
                onChange={(event) => setMobile(event.target.value)}
                required
              />
            </Field>
            <Button type="submit" variant="primary" block loading={loading}>
              ارسال کد بازیابی
            </Button>
          </form>
        ) : (
          <form onSubmit={reset} className="stack">
            <Field label="کد تأیید">
              <input
                className="input"
                inputMode="numeric"
                maxLength={6}
                style={{ textAlign: 'center', fontSize: 20, letterSpacing: 6 }}
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    code: event.target.value.replace(/\D/g, ''),
                  }))
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
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                required
              />
            </Field>
            <Button type="submit" variant="primary" block loading={loading}>
              تغییر رمز عبور
            </Button>
            <Button
              type="button"
              variant="ghost"
              block
              loading={resending}
              disabled={resendIn > 0}
              onClick={resend}
            >
              {resendIn > 0
                ? `ارسال دوباره کد تا ${resendIn.toLocaleString('fa-IR')} ثانیه دیگر`
                : 'ارسال دوباره کد'}
            </Button>
          </form>
        )}

        <p className="small muted" style={{ marginTop: 18, textAlign: 'center' }}>
          <Link to="/login" style={{ color: 'var(--brand-600)' }}>
            بازگشت به ورود
          </Link>
        </p>
      </div>
    </div>
  );
}
