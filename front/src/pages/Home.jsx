import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Laptop,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  Truck,
  Watch,
  Headset,
  Package,
} from 'lucide-react';
import { api, buildQuery } from '../lib/api';
import { useCatalog } from '../context/CatalogContext';
import ProductCard from '../components/product/ProductCard';
import { ConnectionError, SkeletonCard } from '../components/ui/Primitives';
import { coverImage } from '../lib/format';

// Banner artwork lives in `public/banners/`: drop a file there and name
// it here. Anything in `public/` is served as-is at the same path, so
// `/banners/iphone-17.png` is all it takes - no import, no build step.
// A slide with no file falls back to a best-seller's photo, and then to
// a drawn shape, so the hero is never empty.
const SLIDES = [
  {
    eyebrow: 'فراتر از تصور',
    title: 'iPhone 17 Pro Max',
    sub: 'قدرت جدید در دستان شما — با ضمانت اصالت و ارسال سریع از تل‌کال.',
    cta: 'مشاهده و خرید',
    to: '/products?search=iphone',
    image: '/banners/iphone-17-pro-max.png',
    tint: 'linear-gradient(120deg, #eef2fb 0%, #e3e9f8 45%, #dbe3f6 100%)',
  },
  {
    eyebrow: 'کار و خلاقیت',
    title: 'لپ‌تاپ‌های حرفه‌ای',
    sub: 'از اولترابوک‌های سبک تا ورک‌استیشن‌های قدرتمند، با پشتیبانی ۲۴ ساعته.',
    cta: 'دیدن لپ‌تاپ‌ها',
    to: '/products?search=laptop',
    image: '/banners/laptops.png',
    tint: 'linear-gradient(120deg, #eef7f3 0%, #e2f0ea 45%, #dcefe6 100%)',
  },
  {
    eyebrow: 'همراه همیشگی',
    title: 'گجت‌های هوشمند',
    sub: 'ساعت هوشمند، هندزفری و لوازم جانبی اصل، با قیمت واقعی.',
    cta: 'دیدن گجت‌ها',
    to: '/products?sortBy=best_selling',
    image: '/banners/gadgets.png',
    tint: 'linear-gradient(120deg, #f6eef8 0%, #efe3f6 45%, #ead9f4 100%)',
  },
];

const TILE_ICONS = [Smartphone, Laptop, Tablet, Watch, Headset, Package];

const TRUST = [
  { icon: Truck, title: 'ارسال سریع', sub: 'به سراسر ایران' },
  { icon: ShieldCheck, title: 'ضمانت اصالت کالا', sub: 'خرید مطمئن' },
  { icon: RotateCcw, title: '۷ روز ضمانت بازگشت', sub: 'بدون قید و شرط' },
  { icon: Headphones, title: 'پشتیبانی ۲۴ ساعته', sub: 'همیشه در کنار شما' },
];

function useProducts(query) {
  const [state, setState] = useState({ items: [], loading: true, failed: false });
  const key = useMemo(() => buildQuery(query), [query]);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));

    api
      .get(`/products${key}`)
      .then((data) => {
        if (cancelled) return;
        setState({ items: data?.items ?? [], loading: false, failed: false });
      })
      .catch(() => {
        // A failed request is not an empty shop. Collapsing the two left the
        // page looking like a store with nothing in it whenever the API was
        // unreachable, with nothing on screen to explain why.
        if (!cancelled) setState({ items: [], loading: false, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
}

function Row({ title, icon, link, products, loading, failed }) {
  if (!loading && !failed && products.length === 0) return null;

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">
          {icon}
          {title}
        </h2>
        <Link className="section-link" to={link}>
          مشاهده همه
          <ArrowLeft size={15} />
        </Link>
      </div>
      {failed && !loading ? (
        <ConnectionError />
      ) : (
        <div className="product-grid">
          {loading
            ? Array.from({ length: 5 }).map((_, index) => (
                <SkeletonCard key={index} />
              ))
            : products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const { categories, brands } = useCatalog();
  const [slide, setSlide] = useState(0);
  // Image URLs that failed to load. Kept as state rather than hiding the
  // <img> in place: the banner file 404s before the product photos have
  // arrived, and a hidden element never came back once they did.
  const [broken, setBroken] = useState({});
  const touchStart = useRef(null);

  const bestSellers = useProducts({
    sortBy: 'best_selling',
    sortOrder: 'DESC',
    limit: 10,
  });
  const onSale = useProducts({ onSale: 'true', limit: 10 });
  const newest = useProducts({ sortBy: 'created_at', sortOrder: 'DESC', limit: 10 });

  useEffect(() => {
    const timer = setInterval(() => {
      setSlide((current) => (current + 1) % SLIDES.length);
    }, 6500);
    return () => clearInterval(timer);
  }, []);

  // The slider borrows a real product photo when the shop has one, and
  // falls back to a drawn shape when it does not - an empty catalogue
  // should still look deliberate.
  const heroImages = useMemo(
    () => bestSellers.items.map(coverImage).filter(Boolean),
    [bestSellers.items],
  );

  const tiles = categories.slice(0, 6);

  return (
    <div className="container page">
      <section
        className="hero"
        style={{ background: SLIDES[slide].tint, transition: 'background 0.6s ease' }}
        onTouchStart={(event) => {
          touchStart.current = event.touches[0].clientX;
        }}
        onTouchEnd={(event) => {
          if (touchStart.current === null) return;
          const dx = event.changedTouches[0].clientX - touchStart.current;
          touchStart.current = null;
          if (Math.abs(dx) < 40) return;
          // Right-to-left page: dragging the slide to the right brings the
          // next one in, the way the arrows below are laid out.
          setSlide((current) =>
            dx > 0 ? (current + 1) % SLIDES.length : (current - 1 + SLIDES.length) % SLIDES.length,
          );
        }}
      >
        {SLIDES.map((item, index) => (
          <div className="hero-slide" key={item.title} data-active={index === slide}>
            <div>
              <div className="hero-eyebrow">{item.eyebrow}</div>
              <h1 className="hero-title">{item.title}</h1>
              <p className="hero-sub">{item.sub}</p>
              <Link className="btn btn-primary btn-lg hero-cta" to={item.to}>
                {item.cta}
                <ArrowLeft size={17} />
              </Link>
            </div>
            <div className="hero-art">
              <span className="glow" />
              {(() => {
                const src = [item.image, heroImages[index]].find(
                  (candidate) => candidate && !broken[candidate],
                );
                return src ? (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    onError={() => setBroken((current) => ({ ...current, [src]: true }))}
                  />
                ) : (
                  <span className="placeholder-art">
                    <Sparkles size={40} />
                  </span>
                );
              })()}
            </div>
          </div>
        ))}

        <div className="hero-dots">
          {SLIDES.map((item, index) => (
            <button
              key={item.title}
              className="hero-dot"
              data-active={index === slide}
              onClick={() => setSlide(index)}
              aria-label={`اسلاید ${index + 1}`}
            />
          ))}
        </div>

        <div className="hero-nav">
          <button
            onClick={() => setSlide((slide + 1) % SLIDES.length)}
            aria-label="بعدی"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => setSlide((slide - 1 + SLIDES.length) % SLIDES.length)}
            aria-label="قبلی"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      </section>

      {tiles.length > 0 ? (
        <div className="tiles">
          {tiles.map((category, index) => {
            const Icon = TILE_ICONS[index % TILE_ICONS.length];
            return (
              <Link
                key={category.id}
                className="tile"
                to={`/products?categoryId=${category.id}`}
              >
                <span className="tile-icon">
                  <Icon size={24} />
                </span>
                <span className="tile-label">{category.title}</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      <div className="trust">
        {TRUST.map((item) => (
          <div className="trust-item" key={item.title}>
            <item.icon size={26} />
            <div>
              <div className="trust-title">{item.title}</div>
              <div className="trust-sub">{item.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <Row
        title="پرفروش‌ترین‌ها"
        link="/products?sortBy=best_selling"
        products={bestSellers.items}
        loading={bestSellers.loading}
          failed={bestSellers.failed}
      />

      <Row
        title="پیشنهاد ویژه"
        link="/products?onSale=true"
        products={onSale.items}
        loading={onSale.loading}
          failed={onSale.failed}
      />

      <Row
        title="جدیدترین‌ها"
        link="/products?sortBy=created_at"
        products={newest.items}
        loading={newest.loading}
          failed={newest.failed}
      />

      {brands.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">برندها</h2>
          </div>
          <div className="scroll-x">
            {brands.map((brand) => (
              <Link
                key={brand.id}
                to={`/products?brandId=${brand.id}`}
                className="card"
                style={{
                  padding: '14px 22px',
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                {brand.title}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
