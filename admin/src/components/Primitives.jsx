import { useEffect } from 'react';
import { Inbox, Search, WifiOff, X } from 'lucide-react';

export function Button({
  variant = 'primary',
  size,
  block,
  loading,
  children,
  className = '',
  disabled,
  ...rest
}) {
  const classes = [
    'btn',
    variant === 'primary' ? '' : `btn-${variant}`,
    size === 'sm' ? 'btn-sm' : '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <label className={error ? 'field has-error' : 'field'}>
      {label ? <span className="field-label">{label}</span> : null}
      {children}
      {error ? <span className="field-error">{error}</span> : null}
      {!error && hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Modal({ title, children, footer, onClose, wide }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2 className="card-title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="بستن">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'جستجو…' }) {
  return (
    <div className="search-box">
      <Search size={16} />
      <input
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

// A request that failed is not an empty table. Every list screen used to
// collapse the two in a `.catch(() => setItems([]))`, so an admin whose API
// was unreachable saw a shop with no orders, no products and no users - and
// nothing on screen to say the panel simply could not reach the server.
export function ConnectionError({ onRetry }) {
  return (
    <EmptyState
      icon={<WifiOff size={26} />}
      title="ارتباط با سرور برقرار نشد"
      description="اتصال خود را بررسی کنید و دوباره تلاش کنید. اگر مشکل ادامه داشت، سرویس ممکن است در دسترس نباشد."
      action={
        <Button variant="primary" onClick={onRetry ?? (() => window.location.reload())}>
          تلاش دوباره
        </Button>
      }
    />
  );
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon ?? <Inbox size={26} />}</span>
      <div>
        <div className="strong" style={{ color: 'var(--ink-900)' }}>
          {title}
        </div>
        {description ? <div className="small muted">{description}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div style={{ padding: 16 }}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div className="row" key={rowIndex} style={{ gap: 12, marginBottom: 12 }}>
          {Array.from({ length: cols }).map((__, colIndex) => (
            <div
              key={colIndex}
              className="skeleton"
              style={{ height: 14, flex: colIndex === 0 ? 2 : 1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages < 2) return null;
  const pages = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(totalPages, from + 4);
  for (let i = from; i <= to; i += 1) pages.push(i);

  return (
    <div className="pagination">
      <button className="page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        قبلی
      </button>
      {pages.map((item) => (
        <button
          key={item}
          className={`page-btn${item === page ? ' is-active' : ''}`}
          onClick={() => onChange(item)}
        >
          {item.toLocaleString('fa-IR')}
        </button>
      ))}
      <button
        className="page-btn"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        بعدی
      </button>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel = 'حذف', onConfirm, onClose, loading }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="small">{message}</p>
    </Modal>
  );
}
