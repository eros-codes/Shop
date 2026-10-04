import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { translateError } from '../lib/errorMessages';
import { Button, Field } from '../components/Primitives';

export default function Login() {
  const { login, isAuthenticated, ready } = useAuth();
  const [form, setForm] = useState({ mobile: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (ready && isAuthenticated) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(form.mobile.trim(), form.password);
    } catch (apiError) {
      setError(
        apiError?.code === 'FORBIDDEN'
          ? 'این حساب دسترسی مدیریت ندارد.'
          : translateError(apiError),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card stack" onSubmit={submit}>
        <div className="row" style={{ gap: 10, marginBottom: 6 }}>
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'var(--brand-50)',
              color: 'var(--brand-700)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <ShieldCheck size={21} />
          </span>
          <div>
            <div className="strong" style={{ fontSize: 17 }}>
              پنل مدیریت تل‌کال
            </div>
            <div className="tiny muted">ورود مخصوص مدیران فروشگاه</div>
          </div>
        </div>

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

        <Field label="رمز عبور">
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

        {error ? (
          <div
            className="small"
            style={{
              color: 'var(--danger-600)',
              background: 'var(--danger-50)',
              padding: '9px 12px',
              borderRadius: 9,
            }}
          >
            {error}
          </div>
        ) : null}

        <Button block loading={loading} type="submit">
          ورود به پنل
        </Button>
      </form>
    </div>
  );
}
