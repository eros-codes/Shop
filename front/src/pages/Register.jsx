import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { Button, Field } from '../components/ui/Primitives';
import { useFieldErrors } from '../lib/useFieldErrors';
import { RESEND_SECONDS, cooldownFrom, useCountdown } from '../lib/useCountdown';

export default function Register() {
  const { register, verifyOtp } = useAuth();
  const toast = useToast();
  const fieldErrors = useFieldErrors();
  const navigate = useNavigate();
  const [stage, setStage] = useState('form');
  const [form, setForm] = useState({ display_name: '', mobile: '', password: '' });
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useCountdown();

  const payload = () => ({
    display_name: form.display_name.trim(),
    mobile: form.mobile.trim(),
    password: form.password,
  });

  const submitForm = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    fieldErrors.clear();
    try {
      await register(payload());
      setStage('otp');
      setResendIn(RESEND_SECONDS);
      toast.success('کد تأیید برای شما پیامک شد');
    } catch (apiError) {
      setResendIn(cooldownFrom(apiError));
      // Field problems go under their own inputs; anything else (a number
      // that is already registered, say) keeps the general message.
      if (!fieldErrors.capture(apiError, ['display_name', 'mobile', 'password'])) setError(translateError(apiError));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      await register(payload());
      setCode('');
      setResendIn(RESEND_SECONDS);
      toast.success('کد تازه پیامک شد');
    } catch (apiError) {
      setResendIn(cooldownFrom(apiError));
      setError(translateError(apiError));
    } finally {
      setResending(false);
    }
  };

  const submitOtp = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await verifyOtp(form.mobile.trim(), code.trim());
      toast.success('حساب شما ساخته شد');
      navigate('/account', { replace: true });
    } catch (apiError) {
      setError(translateError(apiError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container auth-wrap">
      <div className="auth-card">
        {stage === 'form' ? (
          <>
            <h1 className="auth-title">ساخت حساب کاربری</h1>
            <p className="auth-sub">
              با شماره موبایل خود ثبت‌نام کنید؛ کد تأیید پیامک می‌شود.
            </p>

            <form onSubmit={submitForm} className="stack">
              <Field label="نام و نام خانوادگی"
                error={fieldErrors.of('display_name')}>
                <input
                  className="input"
                  value={form.display_name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      display_name: event.target.value,
                    }))
                  }
                  required
                />
              </Field>

              <Field label="شماره موبایل"
                error={fieldErrors.of('mobile')}>
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="09123456789"
                  value={form.mobile}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, mobile: event.target.value }))
                  }
                  required
                />
              </Field>

              <Field
                label="رمز عبور"
                error={fieldErrors.of('password') ?? error}
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
                دریافت کد تأیید
              </Button>
            </form>

            <p className="small muted" style={{ marginTop: 18, textAlign: 'center' }}>
              قبلاً ثبت‌نام کرده‌اید؟{' '}
              <Link to="/login" style={{ color: 'var(--brand-600)', fontWeight: 600 }}>
                وارد شوید
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="auth-title">کد تأیید را وارد کنید</h1>
            <p className="auth-sub">
              کد ۶ رقمی پیامک‌شده به {form.mobile} را وارد کنید.
            </p>

            <form onSubmit={submitOtp} className="stack">
              <Field error={error}>
                <input
                  className="input"
                  inputMode="numeric"
                  maxLength={6}
                  style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8 }}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  required
                />
              </Field>

              <Button type="submit" variant="primary" block loading={loading}>
                تأیید و ورود
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
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => setStage('form')}
              >
                تغییر شماره
              </button>
            </form>

            {/* A number that already has an account is sent no code - the
                API answers the same either way, so the page cannot tell
                which happened. This says it for both. */}
            <p className="small muted" style={{ marginTop: 18, textAlign: 'center', lineHeight: 1.9 }}>
              پیامکی نرسید؟ اگر قبلاً با این شماره ثبت‌نام کرده‌اید،{' '}
              <Link to="/login" style={{ color: 'var(--brand-600)', fontWeight: 600 }}>
                وارد شوید
              </Link>{' '}
              یا{' '}
              <Link to="/forgot-password" style={{ color: 'var(--brand-600)', fontWeight: 600 }}>
                رمز عبور را بازیابی کنید
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
