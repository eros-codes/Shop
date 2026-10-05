import { useCallback, useEffect, useState, useRef } from 'react';
import { ShieldCheck, Users as UsersIcon, Wallet } from 'lucide-react';
import { api, buildQuery, toPage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { formatDate, formatToman } from '../lib/format';
import {
  Button,
  EmptyState,
  Field,
  Modal,
  Pagination,
  SearchBox,
  TableSkeleton,
} from '../components/Primitives';

export default function Users() {
  const toast = useToast();
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [charging, setCharging] = useState(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  // setSaving only disables the button on the next render, so clicks landing
  // in the same React tick all get through. This ref closes that window - it
  // matters because a repeated submit fires side effects again and can leave
  // duplicate rows wherever the database has no unique constraint.
  const busyRef = useRef(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(`/users${buildQuery({ page, limit: 20, search: search.trim() || undefined })}`, {
        auth: true,
      })
      .then((data) =>
        setResult(toPage(data, 20)),
      )
      .catch(() => setResult({ items: [], total: 0, totalPages: 1 }))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const changeRole = async (user, role) => {
    try {
      await api.patch(`/users/${user.id}/role`, { role }, { auth: true });
      toast.success('نقش کاربر تغییر کرد؛ نشست‌های او بسته شد');
      load();
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  const openWallet = async (user) => {
    try {
      const wallet = await api.get(`/wallets/user/${user.id}`, { auth: true });
      setCharging({ user, wallet });
      setAmount('');
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  const charge = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      await api.patch(
        `/wallets/${charging.wallet.id}/charge`,
        { amount: Number(amount) },
        { auth: true },
      );
      toast.success('کیف پول شارژ شد (در گزارش فعالیت ثبت شد)');
      setCharging(null);
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <div className="toolbar">
        <SearchBox value={search} onChange={setSearch} placeholder="نام یا موبایل…" />
        <span className="small muted">
          {result.total.toLocaleString('fa-IR')} کاربر
        </span>
      </div>

      <section className="card">
        {loading ? (
          <TableSkeleton cols={5} />
        ) : result.items.length === 0 ? (
          <EmptyState icon={<UsersIcon size={26} />} title="کاربری پیدا نشد" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>کاربر</th>
                  <th>موبایل</th>
                  <th>نقش</th>
                  <th>عضویت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.items.map((user) => (
                  <tr key={user.id}>
                    <td className="strong small">{user.display_name ?? '—'}</td>
                    <td className="small">{user.mobile}</td>
                    <td>
                      <span
                        className={`badge badge-${user.role === 'admin' ? '' : 'muted'}`}
                      >
                        {user.role === 'admin' ? 'مدیر' : 'مشتری'}
                      </span>
                    </td>
                    <td className="tiny muted">
                      {formatDate(user.created_at ?? user.createdAt)}
                    </td>
                    <td>
                      <div className="cell-actions">
                        <Button size="sm" variant="ghost" onClick={() => openWallet(user)}>
                          <Wallet size={14} />
                          کیف پول
                        </Button>
                        <Button
                          size="sm"
                          variant={user.role === 'admin' ? 'danger' : 'soft'}
                          onClick={() =>
                            changeRole(user, user.role === 'admin' ? 'user' : 'admin')
                          }
                        >
                          <ShieldCheck size={14} />
                          {user.role === 'admin' ? 'سلب دسترسی مدیر' : 'مدیر کردن'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} totalPages={result.totalPages} onChange={setPage} />
      </section>

      {charging ? (
        <Modal
          title={`کیف پول ${charging.user.display_name ?? charging.user.mobile}`}
          onClose={() => setCharging(null)}
        >
          <form onSubmit={charge} className="stack">
            <div className="card card-pad spread">
              <span className="small muted">موجودی فعلی</span>
              <span className="strong">{formatToman(charging.wallet.amount)}</span>
            </div>

            <Field
              label="مبلغ شارژ (تومان)"
              hint="این یک شارژ دستی است و در گزارش فعالیت با نام شما ثبت می‌شود"
            >
              <input
                className="input"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
                required
              />
            </Field>

            <Button type="submit" loading={saving}>
              شارژ کیف پول
            </Button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
