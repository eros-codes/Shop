import { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { api, buildQuery } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { formatDate, formatToman } from '../lib/format';
import {
  Button,
  EmptyState,
  Field,
  Modal,
  TableSkeleton,
} from '../components/Primitives';
import { NEXT_RETURN_STATUS, RETURN_REASONS, RETURN_STATUS } from '../lib/status';

export default function Returns() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [resolving, setResolving] = useState(null);
  const [target, setTarget] = useState('');
  const [restock, setRestock] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get(`/returns${buildQuery({ status: status || undefined, limit: 50 })}`, {
        auth: true,
      })
      .then((data) => setItems(data?.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(load, [load]);

  const resolve = async () => {
    setSaving(true);
    try {
      await api.patch(
        `/returns/${resolving.id}/status`,
        {
          status: target,
          ...(target === 'refunded' ? { restock } : {}),
          ...(note.trim() ? { admin_note: note.trim() } : {}),
        },
        { auth: true },
      );
      toast.success('درخواست مرجوعی به‌روز شد');
      setResolving(null);
      setTarget('');
      setNote('');
      load();
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="toolbar">
        <select
          className="select"
          style={{ width: 200 }}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(RETURN_STATUS).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
        <span className="small muted">{items.length.toLocaleString('fa-IR')} درخواست</span>
      </div>

      <section className="card">
        {loading ? (
          <TableSkeleton cols={5} />
        ) : items.length === 0 ? (
          <EmptyState icon={<RotateCcw size={26} />} title="درخواست مرجوعی‌ای نیست" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>سفارش</th>
                  <th>مشتری</th>
                  <th>دلیل</th>
                  <th>وضعیت</th>
                  <th>مبلغ بازگشتی</th>
                  <th>تاریخ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((request) => {
                  const meta = RETURN_STATUS[request.status] ?? {
                    label: request.status,
                    tone: 'muted',
                  };
                  const next = NEXT_RETURN_STATUS[request.status] ?? [];
                  return (
                    <tr key={request.id}>
                      <td className="small strong">
                        {request.order?.invoice_number ?? `#${request.order?.id}`}
                      </td>
                      <td className="small">
                        {request.user?.display_name}
                        <div className="tiny muted">{request.user?.mobile}</div>
                      </td>
                      <td className="small">
                        {RETURN_REASONS[request.reason] ?? request.reason}
                        {request.description ? (
                          <div className="tiny muted">{request.description}</div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`badge badge-${meta.tone}`}>{meta.label}</span>
                      </td>
                      <td className="small">
                        {Number(request.refund_amount) > 0
                          ? formatToman(request.refund_amount)
                          : '—'}
                      </td>
                      <td className="tiny muted">{formatDate(request.created_at)}</td>
                      <td>
                        <div className="cell-actions">
                          {next.length > 0 ? (
                            <Button
                              size="sm"
                              variant="soft"
                              onClick={() => {
                                setResolving(request);
                                setTarget(next[0]);
                                setNote(request.admin_note ?? '');
                              }}
                            >
                              بررسی
                            </Button>
                          ) : (
                            <span className="tiny muted">بسته شده</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {resolving ? (
        <Modal
          title={`بررسی مرجوعی ${resolving.order?.invoice_number ?? `#${resolving.order?.id}`}`}
          onClose={() => setResolving(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setResolving(null)}>
                انصراف
              </Button>
              <Button onClick={resolve} loading={saving} disabled={!target}>
                ثبت
              </Button>
            </>
          }
        >
          <div className="stack">
            <Field label="وضعیت جدید">
              <select
                className="select"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                {(NEXT_RETURN_STATUS[resolving.status] ?? []).map((value) => (
                  <option key={value} value={value}>
                    {RETURN_STATUS[value]?.label ?? value}
                  </option>
                ))}
              </select>
            </Field>

            {target === 'refunded' ? (
              <>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={restock}
                    onChange={(event) => setRestock(event.target.checked)}
                  />
                  کالا قابل فروش مجدد است و به موجودی برگردد
                </label>
                <p className="tiny muted">
                  مبلغ کالا و سهم مالیات آن به کیف پول مشتری برمی‌گردد؛ هزینه ارسال
                  بازگردانده نمی‌شود.
                </p>
              </>
            ) : null}

            <Field label="یادداشت برای مشتری">
              <textarea
                className="textarea"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
