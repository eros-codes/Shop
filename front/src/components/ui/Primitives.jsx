import { Link } from 'react-router-dom';
import { Loader2, PackageSearch } from 'lucide-react';
import { formatToman } from '../../lib/format';

export function Spinner({ size = 18 }) {
  return <Loader2 size={size} className="spin" style={{ animation: 'spin 0.8s linear infinite' }} />;
}

export function Button({
  as: As = 'button',
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
    `btn-${variant}`,
    size ? `btn-${size}` : '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <As className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" /> : null}
      {children}
    </As>
  );
}

export function Field({ label, error, hint, children, id }) {
  return (
    <div className="field">
      {label ? (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? <span className="field-error">{error}</span> : null}
      {!error && hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function Price({ now, was, off, size }) {
  return (
    <div className="price">
      {off > 0 ? <span className="price-off">٪{off}</span> : null}
      <span className="price-now" style={size ? { fontSize: size } : undefined}>
        {formatToman(now)}
      </span>
      {was && was > now ? (
        <span className="price-was">{formatToman(was, { withUnit: false })}</span>
      ) : null}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <PackageSearch size={30} />}</div>
      <div>
        <div className="strong" style={{ fontSize: 16, color: 'var(--ink-900)' }}>
          {title}
        </div>
        {description ? <div className="small muted">{description}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Breadcrumb({ items }) {
  return (
    <nav className="breadcrumb" aria-label="مسیر">
      <Link to="/">خانه</Link>
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="row" style={{ gap: 6 }}>
          <span>/</span>
          {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
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
      <button
        className="page-btn"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        قبلی
      </button>
      {from > 1 ? (
        <button className="page-btn" onClick={() => onChange(1)}>
          ۱
        </button>
      ) : null}
      {from > 2 ? <span className="muted">…</span> : null}
      {pages.map((item) => (
        <button
          key={item}
          className="page-btn"
          data-active={item === page}
          onClick={() => onChange(item)}
        >
          {item.toLocaleString('fa-IR')}
        </button>
      ))}
      {to < totalPages - 1 ? <span className="muted">…</span> : null}
      {to < totalPages ? (
        <button className="page-btn" onClick={() => onChange(totalPages)}>
          {totalPages.toLocaleString('fa-IR')}
        </button>
      ) : null}
      <button
        className="page-btn"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
      >
        بعدی
      </button>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="product-card">
      <div className="product-top">
        <div
          className="skeleton"
          style={{ aspectRatio: '1 / 1', borderRadius: 'var(--radius-sm)' }}
        />
      </div>
      <div className="product-body">
        <div className="skeleton" style={{ height: 11, width: '40%' }} />
        <div className="skeleton" style={{ height: 13 }} />
        <div className="skeleton" style={{ height: 13, width: '70%' }} />
        <div className="skeleton" style={{ height: 11, width: '50%' }} />
        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
          <div className="skeleton" style={{ height: 13, width: '45%' }} />
          <div className="skeleton" style={{ height: 22, width: '72%', marginTop: 6 }} />
        </div>
        <div className="skeleton" style={{ height: 42, marginTop: 10, borderRadius: 10 }} />
      </div>
    </div>
  );
}

export function Stars({ value = 0, count }) {
  const filled = Math.round(Number(value));
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="stars">
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} style={{ opacity: star <= filled ? 1 : 0.25 }}>
            ★
          </span>
        ))}
      </span>
      {count !== undefined ? (
        <span className="tiny muted">({count.toLocaleString('fa-IR')})</span>
      ) : null}
    </span>
  );
}
