import { Link } from 'react-router-dom';
import { Headphones, Instagram, Send, ShieldCheck, Truck } from 'lucide-react';

export default function Footer() {
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
              فروشگاه اینترنتی کالای دیجیتال: گوشی موبایل، لپ‌تاپ، تبلت، ساعت
              هوشمند و لوازم جانبی، با ضمانت اصالت کالا و ارسال سریع به سراسر
              ایران.
            </p>
            <div className="row" style={{ gap: 10, marginTop: 16 }}>
              <span className="icon-btn" style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#fff' }}>
                <Instagram size={17} />
              </span>
              <span className="icon-btn" style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#fff' }}>
                <Send size={17} />
              </span>
            </div>
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
            <Link to="/account/returns">مرجوعی و بازگشت کالا</Link>
            <Link to="/account/wallet">کیف پول</Link>
            <Link to="/account/addresses">آدرس‌های من</Link>
          </div>

          <div>
            <h4>چرا تل‌کال؟</h4>
            <span className="row" style={{ gap: 8, paddingBlock: 5, fontSize: 13 }}>
              <ShieldCheck size={16} /> ضمانت اصالت کالا
            </span>
            <span className="row" style={{ gap: 8, paddingBlock: 5, fontSize: 13 }}>
              <Truck size={16} /> ارسال سریع
            </span>
            <span className="row" style={{ gap: 8, paddingBlock: 5, fontSize: 13 }}>
              <Headphones size={16} /> پشتیبانی ۲۴ ساعته
            </span>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© ۱۴۰۴ تل‌کال — تمامی حقوق محفوظ است.</span>
          <span>قیمت‌ها به تومان و شامل مالیات بر ارزش افزوده است.</span>
        </div>
      </div>
    </footer>
  );
}
