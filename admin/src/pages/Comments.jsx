import { useCallback, useEffect, useState } from 'react';
import { Check, MessageSquare, Trash2, X } from 'lucide-react';
import { api, buildQuery, toPage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { translateError } from '../lib/errorMessages';
import { formatDate } from '../lib/format';
import {
  Confirm,
  ConnectionError,
  EmptyState,
  Pagination,
  TableSkeleton,
} from '../components/Primitives';

const STATUS = {
  pending: { label: 'در انتظار تأیید', tone: 'warning' },
  approved: { label: 'تأیید شده', tone: 'success' },
  rejected: { label: 'رد شده', tone: 'danger' },
};

export default function Comments() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('pending');
  const [removing, setRemoving] = useState(null);

  // Paged: a backlog of more than fifty waiting reviews never showed the
  // rest.
  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    api
      .get(`/comments${buildQuery({ status: status || undefined, page, limit: 30 })}`, {
        auth: true,
      })
      .then((data) => {
        const result = toPage(data, 30);
        setItems(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      })
      .catch(() => {
        setItems([]);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [status, page]);

  useEffect(load, [load]);

  const setCommentStatus = async (comment, next) => {
    try {
      await api.patch(`/comments/${comment.id}/status`, { status: next }, { auth: true });
      // Approving or rejecting also recomputes the product's rating on
      // the server, so the list is reloaded rather than patched locally.
      toast.success(next === 'approved' ? 'نظر تأیید شد' : 'نظر رد شد');
      load();
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/comments/${removing.id}`, undefined, { auth: true });
      toast.success('نظر حذف شد');
      setRemoving(null);
      load();
    } catch (error) {
      toast.error(translateError(error));
    }
  };

  return (
    <>
      <div className="toolbar">
        <select
          className="select"
          style={{ width: 190 }}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">همه نظرات</option>
          {Object.entries(STATUS).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
        <span className="small muted">{total.toLocaleString('fa-IR')} نظر</span>
      </div>

      <section className="card">
        {loading ? (
          <TableSkeleton cols={5} />
        ) : failed ? (
          <ConnectionError onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState icon={<MessageSquare size={26} />} title="نظری در این وضعیت نیست" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>کالا</th>
                  <th>کاربر</th>
                  <th>امتیاز</th>
                  <th>متن</th>
                  <th>تاریخ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((comment) => (
                  <tr key={comment.id}>
                    <td className="small">{comment.product?.title ?? '—'}</td>
                    <td className="small">
                      {comment.user?.display_name ?? '—'}
                      <div className="tiny muted">{comment.user?.mobile}</div>
                    </td>
                    <td className="small">
                      {comment.rate ? `${comment.rate.toLocaleString('fa-IR')} ★` : '—'}
                    </td>
                    <td className="small" style={{ maxWidth: 320 }}>
                      {comment.comment}
                    </td>
                    <td className="tiny muted">
                      {formatDate(comment.created_at ?? comment.createdAt)}
                    </td>
                    <td>
                      <div className="cell-actions">
                        {comment.status !== 'approved' ? (
                          <button
                            className="icon-btn"
                            title="تأیید"
                            onClick={() => setCommentStatus(comment, 'approved')}
                          >
                            <Check size={15} color="var(--success-600)" />
                          </button>
                        ) : null}
                        {comment.status !== 'rejected' ? (
                          <button
                            className="icon-btn"
                            title="رد"
                            onClick={() => setCommentStatus(comment, 'rejected')}
                          >
                            <X size={15} color="var(--warning-600)" />
                          </button>
                        ) : null}
                        <button
                          className="icon-btn danger"
                          title="حذف"
                          onClick={() => setRemoving(comment)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </section>

      {removing ? (
        <Confirm
          title="حذف نظر"
          message="این نظر حذف شود؟ امتیاز کالا دوباره محاسبه می‌شود."
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </>
  );
}
