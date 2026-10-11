import { useCallback, useEffect, useState, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { api, buildQuery } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { formatDate, formatToman, toPersianDigits } from '../lib/format';
import {
  Button,
  ConnectionError,
  EmptyState,
  Field,
  Modal,
  Pagination,
  TableSkeleton,
} from '../components/Primitives';
import { NEXT_RETURN_STATUS, RETURN_REASONS, RETURN_STATUS } from '../lib/status';

export default function Returns() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('');
  const [resolving, setResolving] = useState(null);
  const [target, setTarget] = useState('');
  const [restock, setRestock] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // setSaving only disables the button on the next render, so clicks landing
  // in the same React tick all get through. This ref closes that window - it
  // matters because a repeated submit fires side effects again and can leave
  // duplicate rows wherever the database has no unique constraint.
  const busyRef = useRef(false);

  // Paged: the list stopped at the fifty newest requests.
  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    api
      .get(`/returns${buildQuery({ status: status || undefined, page, limit: 20 })}`, {
        auth: true,
      })
      .then((data) => {
        setItems(data?.items ?? []);
        setTotal(data?.total ?? 0);
        setTotalPages(data?.totalPages ?? 1);
      })
      .catch(() => {
        setItems([]);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(load, [load]);

  const resolve = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
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
      busyRef.current = false;
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
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(RETURN_STATUS).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
        <span className="small muted">{total.toLocaleString('fa-IR')} درخواست</span>
      </div>

      <section className="card">
        {loading ? (
          <TableSkeleton cols={5} />
        ) : failed ? (
          <ConnectionError onRetry={load} />
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
                        <bdi className="nowrap">
                          {request.order?.invoice_number ?? `#${request.order?.id}`}
                        </bdi>
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
                                // A damaged item going back on sale is a choice
                                // to make, not a default.
                                setRestock(request.reason !== 'damaged');
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
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </section>

      {resolving ? (
        <Modal
          title={`بررسی مرجوعی ⁨${resolving.order?.invoice_number ?? `#${resolving.order?.id}`}⁩`}
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
            {/* What is coming back. The dialog used to ask for a decision
                without saying which items, or how many. */}
            <div className="card card-pad stack" style={{ gap: 6 }}>
              <div className="tiny muted">کالاهای مرجوعی</div>
              {(resolving.items ?? []).map((line) => (
                <div className="spread small" key={line.id}>
                  <span>
                    {line.orderItem?.product?.title ?? 'کالا'}
                    {line.orderItem?.variant_title ? (
                      <span className="muted"> — {line.orderItem.variant_title}</span>
                    ) : null}
                  </span>
                  <span className="strong">×{toPersianDigits(line.quantity)}</span>
                </div>
              ))}
              {resolving.description ? (
                <div className="tiny muted">توضیح مشتری: {resolving.description}</div>
              ) : null}
            </div>

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
