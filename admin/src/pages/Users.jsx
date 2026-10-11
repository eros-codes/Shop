import { useCallback, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ShieldCheck, ShoppingBag, Users as UsersIcon, Wallet } from 'lucide-react';
import { api, buildQuery, toPage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { translateError } from '../lib/errorMessages';
import { digitsOnly, formatDate, formatToman } from '../lib/format';
import WalletHistory from '../components/WalletHistory';
import { useFieldErrors } from '../lib/useFieldErrors';
import {
  Button,
  Confirm,
  ConnectionError,
  EmptyState,
  Field,
  Modal,
  Pagination,
  SearchBox,
  TableSkeleton,
} from '../components/Primitives';

export default function Users() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Granting or taking away admin rights is asked about first: it was one
  // click, right next to "wallet", with nothing to undo it.
  const [roleChange, setRoleChange] = useState(null);
  const [charged, setCharged] = useState(0);
  // Charge or withdraw. Taking money out (paying a balance back to the
  // customer's card, undoing a mistaken charge) had no place in the panel.
  const [direction, setDirection] = useState('charge');
  const [note, setNote] = useState('');
  // Money leaving a customer's wallet is asked about once more first.
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  // A new account made by staff - another admin, or a customer who
  // ordered by phone. It used to take the person signing up themselves.
  const [creating, setCreating] = useState(false);
  const fieldErrors = useFieldErrors();
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
    setFailed(false);
    api
      .get(`/users${buildQuery({ page, limit: 20, search: search.trim() || undefined })}`, {
        auth: true,
      })
      .then((data) =>
        setResult(toPage(data, 20)),
      )
      .catch(() => {
        setResult({ items: [], total: 0, totalPages: 1 });
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const changeRole = async () => {
    const { user, role } = roleChange;
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}/role`, { role }, { auth: true });
      toast.success('نقش کاربر تغییر کرد؛ نشست‌های او بسته شد');
      setRoleChange(null);
      load();
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      setSaving(false);
    }
  };

  // Opened if the customer has none yet - "charge wallet" used to answer
  // "not found" for anyone who had never had a refund.
  const openWallet = async (user) => {
    try {
      const wallet = await api.post(`/wallets/user/${user.id}`, {}, { auth: true });
      setCharging({ user, wallet });
      setAmount('');
      setNote('');
      setDirection('charge');
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  const submitAdjustment = (event) => {
    event.preventDefault();
    if (direction === 'withdraw') setConfirmingWithdraw(true);
    else adjust();
  };

  const adjust = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      const wallet = await api.patch(
        `/wallets/${charging.wallet.id}/${direction === 'charge' ? 'charge' : 'withdraw'}`,
        { amount: Number(amount), ...(note.trim() ? { note: note.trim() } : {}) },
        { auth: true },
      );
      toast.success(
        direction === 'charge'
          ? 'کیف پول شارژ شد (در گزارش فعالیت ثبت شد)'
          : 'از کیف پول برداشت شد (در گزارش فعالیت ثبت شد)',
      );
      setCharging((current) => ({ ...current, wallet: wallet ?? current.wallet }));
      setAmount('');
      setNote('');
      setCharged((value) => value + 1);
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      busyRef.current = false;
      setSaving(false);
      setConfirmingWithdraw(false);
    }
  };

  const createUser = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      await api.post(
        '/users',
        {
          mobile: String(form.get('mobile') ?? '').trim(),
          display_name: String(form.get('display_name') ?? '').trim(),
          password: String(form.get('password') ?? ''),
          role: form.get('role') || 'user',
        },
        { auth: true },
      );
      toast.success('حساب ساخته شد');
      fieldErrors.clear();
      setCreating(false);
      load();
    } catch (error) {
      if (fieldErrors.capture(error, ['mobile', 'display_name', 'password', 'role'])) {
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
    <>
      <div className="toolbar">
        <SearchBox
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="نام یا موبایل…"
        />
        <span className="small muted">
          {result.total.toLocaleString('fa-IR')} کاربر
        </span>
        <Button
          style={{ marginInlineStart: 'auto' }}
          onClick={() => {
            fieldErrors.clear();
            setCreating(true);
          }}
        >
          <Plus size={16} />
          کاربر جدید
        </Button>
      </div>

      <section className="card">
        {loading ? (
          <TableSkeleton cols={5} />
        ) : failed ? (
          <ConnectionError onRetry={load} />
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
                        <Link
                          className="btn btn-ghost btn-sm"
                          to={`/orders?search=${encodeURIComponent(user.mobile)}`}
                        >
                          <ShoppingBag size={14} />
                          سفارش‌ها
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => openWallet(user)}>
                          <Wallet size={14} />
                          کیف پول
                        </Button>
                        <Button
                          size="sm"
                          variant={user.role === 'admin' ? 'danger' : 'soft'}
                          // Your own role is not yours to change here (the API
                          // refuses it too) - that is how a shop ends up with
                          // no admin at all.
                          disabled={String(user.id) === String(me?.id)}
                          title={
                            String(user.id) === String(me?.id)
                              ? 'نقش حساب خودتان را نمی‌توانید تغییر دهید'
                              : undefined
                          }
                          onClick={() =>
                            setRoleChange({
                              user,
                              role: user.role === 'admin' ? 'user' : 'admin',
                            })
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
          <form onSubmit={submitAdjustment} className="stack">
            <div className="card card-pad spread">
              <span className="small muted">موجودی فعلی</span>
              <span className="strong">{formatToman(charging.wallet.amount)}</span>
            </div>

            <div className="row" style={{ gap: 6 }}>
              {[
                ['charge', 'شارژ'],
                ['withdraw', 'برداشت'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`btn btn-sm ${direction === value ? '' : 'btn-ghost'}`}
                  onClick={() => setDirection(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <Field
              label={direction === 'charge' ? 'مبلغ شارژ (تومان)' : 'مبلغ برداشت (تومان)'}
              hint="دستی است و با نام شما در گزارش فعالیت ثبت می‌شود"
            >
              <input
                className="input"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(digitsOnly(event.target.value))}
                required
              />
            </Field>

            <Field
              label="توضیح"
              hint="در صورت‌حساب کیف پول مشتری نمایش داده می‌شود؛ مثلاً «واریز به کارت مشتری»"
            >
              <input
                className="input"
                value={note}
                maxLength={255}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>

            <Button
              type="submit"
              variant={direction === 'charge' ? 'primary' : 'danger'}
              loading={saving}
              disabled={!Number(amount)}
            >
              {direction === 'charge' ? 'شارژ کیف پول' : 'برداشت از کیف پول'}
            </Button>

            <div className="divider" />
            <div className="small strong">تراکنش‌ها</div>
            <WalletHistory walletId={charging.wallet.id} refreshKey={charged} />
          </form>
        </Modal>
      ) : null}

      {creating ? (
        <Modal title="کاربر جدید" onClose={() => setCreating(false)}>
          <form
            onSubmit={createUser}
            onInput={(event) => fieldErrors.clearField(event.target.name)}
            className="stack"
          >
            <Field label="شماره موبایل" error={fieldErrors.of('mobile')}>
              <input
                className="input"
                name="mobile"
                inputMode="numeric"
                placeholder="09123456789"
                dir="ltr"
                required
              />
            </Field>
            <Field label="نام" error={fieldErrors.of('display_name')}>
              <input className="input" name="display_name" required />
            </Field>
            <Field
              label="رمز عبور"
              error={fieldErrors.of('password')}
              hint="حداقل ۸ کاراکتر، شامل حرف و عدد؛ به خود شخص بدهید تا عوضش کند"
            >
              <input className="input" name="password" type="password" required />
            </Field>
            <Field label="نقش" error={fieldErrors.of('role')}>
              <select className="select" name="role" defaultValue="user">
                <option value="user">مشتری</option>
                <option value="admin">مدیر</option>
              </select>
            </Field>
            <Button type="submit" loading={saving}>
              ساخت حساب
            </Button>
          </form>
        </Modal>
      ) : null}

      {confirmingWithdraw && charging ? (
        <Confirm
          title="برداشت از کیف پول"
          message={`${formatToman(Number(amount))} از کیف پول «${
            charging.user.display_name ?? charging.user.mobile
          }» کم می‌شود. این پول را خودتان باید به مشتری برگردانید (مثلاً واریز به کارتش). ادامه می‌دهید؟`}
          confirmLabel="برداشت"
          onConfirm={adjust}
          onClose={() => setConfirmingWithdraw(false)}
          loading={saving}
        />
      ) : null}

      {roleChange ? (
        <Confirm
          title={roleChange.role === 'admin' ? 'دادن دسترسی مدیر' : 'سلب دسترسی مدیر'}
          message={
            roleChange.role === 'admin'
              ? `«${roleChange.user.display_name ?? roleChange.user.mobile}» به همه‌ی بخش‌های پنل، از سفارش‌ها تا کیف پول‌ها، دسترسی پیدا می‌کند. ادامه می‌دهید؟`
              : `دسترسی مدیر «${roleChange.user.display_name ?? roleChange.user.mobile}» گرفته و از همه‌ی دستگاه‌هایش خارج می‌شود. ادامه می‌دهید؟`
          }
          confirmLabel={roleChange.role === 'admin' ? 'مدیر شود' : 'سلب دسترسی'}
          onConfirm={changeRole}
          onClose={() => setRoleChange(null)}
          loading={saving}
        />
      ) : null}
    </>
  );
}
