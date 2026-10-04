import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { Button, Field } from '../components/ui/Primitives';

export default function Register() {
  const { register, verifyOtp } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [stage, setStage] = useState('form');
  const [form, setForm] = useState({ display_name: '', mobile: '', password: '' });
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submitForm = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register({
        display_name: form.display_name.trim(),
        mobile: form.mobile.trim(),
        password: form.password,
      });
      setStage('otp');
      toast.success('کد تأیید برای شما پیامک شد');
    } catch (apiError) {
      setError(translateError(apiError));
    } finally {
      setLoading(false);
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
              <Field label="نام و نام خانوادگی">
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

              <Field label="شماره موبایل">
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
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => setStage('form')}
              >
                تغییر شماره
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
