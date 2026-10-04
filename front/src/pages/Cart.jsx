import { Link, useNavigate } from 'react-router-dom';
import { ImageOff, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { Breadcrumb, Button, EmptyState } from '../components/ui/Primitives';
import { formatToman } from '../lib/format';

export default function Cart() {
  const { lines, goodsTotal, increase, decrease, remove, count } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (lines.length === 0) {
    return (
      <div className="container page">
        <Breadcrumb items={[{ label: 'سبد خرید' }]} />
        <div className="card">
          <EmptyState
            icon={<ShoppingBag size={30} />}
            title="سبد خرید شما خالی است"
            description="از میان گوشی، لپ‌تاپ، تبلت و گجت‌ها انتخاب کنید."
            action={
              <Link className="btn btn-primary" to="/products">
                شروع خرید
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container page">
      <Breadcrumb items={[{ label: 'سبد خرید' }]} />

      <div className="two-col">
        <div className="card card-pad">
          <div className="spread" style={{ marginBottom: 6 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>
              سبد خرید ({count.toLocaleString('fa-IR')} کالا)
            </h1>
            {!isAuthenticated ? (
              <span className="tiny muted">
                این سبد در همین مرورگر ذخیره شده و هنگام ورود به حساب‌تان منتقل می‌شود
              </span>
            ) : null}
          </div>

          {lines.map((line) => (
            <div className="cart-line" key={`${line.productId}-${line.variantId}`}>
              <Link
                to={`/product/${line.slug ?? line.productId}`}
                className="cart-thumb"
              >
                {line.image ? (
                  <img
                    src={line.image}
                    alt={line.title}
                    style={{ maxHeight: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <ImageOff size={22} color="var(--ink-300)" />
                )}
              </Link>

              <div className="stack" style={{ gap: 6 }}>
                <Link
                  to={`/product/${line.slug ?? line.productId}`}
                  className="strong"
                  style={{ fontSize: 14.5 }}
                >
                  {line.title}
                </Link>
                {line.variantTitle ? (
                  <span className="badge badge-muted" style={{ alignSelf: 'flex-start' }}>
                    {line.variantTitle}
                  </span>
                ) : null}
                <span className="small muted">
                  {formatToman(line.unitPrice)} × {line.quantity.toLocaleString('fa-IR')}
                </span>

                <div className="row" style={{ gap: 10, marginTop: 4 }}>
                  <div className="qty">
                    <button onClick={() => decrease(line)} aria-label="کاهش">
                      <Minus size={14} />
                    </button>
                    <span>{line.quantity.toLocaleString('fa-IR')}</span>
                    <button
                      onClick={() => increase(line)}
                      disabled={line.quantity >= line.stock}
                      aria-label="افزایش"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => remove(line)}
                  >
                    <Trash2 size={14} />
                    حذف
                  </button>
                </div>
              </div>

              <div className="strong" style={{ fontSize: 15, whiteSpace: 'nowrap' }}>
                {formatToman(line.unitPrice * line.quantity)}
              </div>
            </div>
          ))}
        </div>

        <div className="card card-pad summary">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
            خلاصه سفارش
          </h2>

          <div className="summary-row">
            <span className="muted">قیمت کالاها</span>
            <span>{formatToman(goodsTotal)}</span>
          </div>
          <div className="summary-row">
            <span className="muted">هزینه ارسال</span>
            <span className="small muted">در مرحله بعد محاسبه می‌شود</span>
          </div>
          <div className="summary-row">
            <span className="muted">مالیات بر ارزش افزوده</span>
            <span className="small muted">در مرحله بعد محاسبه می‌شود</span>
          </div>

          <div className="summary-row summary-total">
            <span>مبلغ قابل پرداخت</span>
            <span>{formatToman(goodsTotal)}</span>
          </div>

          <Button
            variant="primary"
            block
            size="lg"
            style={{ marginTop: 16 }}
            onClick={() =>
              navigate(isAuthenticated ? '/checkout' : '/login?next=/checkout')
            }
          >
            {isAuthenticated ? 'ادامه و تکمیل خرید' : 'ورود و تکمیل خرید'}
          </Button>

          <p className="tiny muted" style={{ marginTop: 12, lineHeight: 1.9 }}>
            مبلغ نهایی پس از انتخاب آدرس و روش ارسال، همراه با مالیات محاسبه و
            نمایش داده می‌شود.
          </p>
        </div>
      </div>
    </div>
  );
}
