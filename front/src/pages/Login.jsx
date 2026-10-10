import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { Button, Field } from '../components/ui/Primitives';

// Where to go after signing in, from ?next=. Only a path on this site:
// "//evil.com" and "/\evil.com" both start with a slash, and browsers
// read either as another host - a sign-in link that lands the customer on
// a look-alike shop.
function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value
    : '/account';
}

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ mobile: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(form.mobile.trim(), form.password);
      toast.success('خوش آمدید');
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (apiError) {
      setError(translateError(apiError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">ورود به حساب کاربری</h1>
        <p className="auth-sub">برای تکمیل خرید و پیگیری سفارش‌ها وارد شوید.</p>

        <form onSubmit={submit} className="stack">
          <Field label="شماره موبایل" id="mobile">
            <input
              id="mobile"
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

          <Field label="رمز عبور" id="password" error={error}>
            <input
              id="password"
              className="input"
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              required
            />
          </Field>

          <div className="spread">
            <Link className="small" style={{ color: 'var(--brand-600)' }} to="/forgot-password">
              رمز عبور را فراموش کرده‌اید؟
            </Link>
          </div>

          <Button type="submit" variant="primary" block loading={loading}>
            ورود
          </Button>
        </form>

        <p className="small muted" style={{ marginTop: 18, textAlign: 'center' }}>
          حساب ندارید؟{' '}
          <Link to="/register" style={{ color: 'var(--brand-600)', fontWeight: 600 }}>
            ثبت‌نام کنید
          </Link>
        </p>
      </div>
    </div>
  );
}
