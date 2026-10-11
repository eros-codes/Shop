import { Link } from 'react-router-dom';
import { Instagram, Send } from 'lucide-react';
import { useCatalog } from '../../context/CatalogContext';

// The year in the copyright line, in the calendar the shop uses. It was
// written in as ۱۴۰۴.
const persianYear = () => {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' }).format(new Date());
  } catch {
    return '';
  }
};

const socialStyle = { background: 'rgba(255,255,255,.08)', border: 'none', color: '#fff' };

export default function Footer() {
  const { shop } = useCatalog();
  const business = shop?.business ?? {};
  const enamad = business.enamad;

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="logo" style={{ marginBottom: 12 }}>
              <span className="logo-mark" style={{ color: '#fff' }}>
                tell<span style={{ color: 'var(--accent-500)' }}>call</span>
              </span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 2, color: '#a9b7d0' }}>
              فروشگاه اینترنتی کالای دیجیتال: گوشی موبایل، لپ‌تاپ، تبلت، ساعت هوشمند و
              لوازم جانبی، با ارسال سریع به سراسر ایران.
            </p>
            {/* Shown only once the shop has an account to link to; the
                icons used to sit here as decoration that went nowhere. */}
            {business.instagramUrl || business.telegramUrl ? (
              <div className="row" style={{ gap: 10, marginTop: 16 }}>
                {business.instagramUrl ? (
                  <a
                    className="icon-btn"
                    style={socialStyle}
                    href={business.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="اینستاگرام"
                  >
                    <Instagram size={17} />
                  </a>
                ) : null}
                {business.telegramUrl ? (
                  <a
                    className="icon-btn"
                    style={socialStyle}
                    href={business.telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="تلگرام"
                  >
                    <Send size={17} />
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <h4>خرید از تل‌کال</h4>
            <Link to="/products">همه کالاها</Link>
            <Link to="/products?onSale=true">پیشنهادهای ویژه</Link>
            <Link to="/products?sortBy=best_selling">پرفروش‌ترین‌ها</Link>
            <Link to="/products?inStock=true">کالاهای موجود</Link>
          </div>

          <div>
            <h4>خدمات مشتریان</h4>
            <Link to="/account/orders">پیگیری سفارش</Link>
            <Link to="/account/returns">مرجوعی‌های من</Link>
            <Link to="/account/tickets/new">ثبت تیکت پشتیبانی</Link>
            <Link to="/account/wallet">کیف پول</Link>
            <Link to="/account/addresses">آدرس‌های من</Link>
          </div>

          <div>
            <h4>راهنما</h4>
            <Link to="/return-policy">شرایط مرجوعی</Link>
            <Link to="/terms">قوانین و مقررات</Link>
            <Link to="/privacy">حریم خصوصی</Link>
            <Link to="/contact">تماس با ما</Link>
            {enamad ? (
              <a
                referrerPolicy="origin"
                target="_blank"
                rel="noopener"
                href={`https://trustseal.enamad.ir/?id=${encodeURIComponent(enamad.id)}&Code=${encodeURIComponent(enamad.code)}`}
                style={{ marginTop: 10, display: 'inline-block' }}
              >
                <img
                  referrerPolicy="origin"
                  src={`https://trustseal.enamad.ir/logo.aspx?id=${encodeURIComponent(enamad.id)}&Code=${encodeURIComponent(enamad.code)}`}
                  alt="نماد اعتماد الکترونیکی"
                  style={{ cursor: 'pointer', height: 84, background: '#fff', borderRadius: 8 }}
                />
              </a>
            ) : null}
          </div>
        </div>

        <div className="footer-bottom">
          <span>
            © {persianYear()} {business.legalName ?? 'تل‌کال'} — تمامی حقوق محفوظ است.
          </span>
          {/* It said prices included VAT. They do not: the tax is added at
              checkout, shown before payment. */}
          <span>قیمت‌ها به تومان است؛ مالیات بر ارزش افزوده هنگام تکمیل خرید محاسبه می‌شود.</span>
        </div>
      </div>
    </footer>
  );
}
