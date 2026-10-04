import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  Heart,
  LogIn,
  Menu,
  Search,
  ShoppingCart,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useCatalog } from '../../context/CatalogContext';
import { useWishlist } from '../../context/WishlistContext';

const QUICK_LINKS = [
  { label: 'پیشنهاد ویژه', to: '/products?onSale=true' },
  { label: 'پرفروش‌ها', to: '/products?sortBy=best_selling' },
  { label: 'جدیدترین‌ها', to: '/products?sortBy=created_at' },
];

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { categories } = useCatalog();
  const { count } = useCart();
  const { count: wishCount } = useWishlist();
  const { isAuthenticated, user } = useAuth();
  const [term, setTerm] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  const submit = (event) => {
    event.preventDefault();
    const query = term.trim();
    navigate(query ? `/products?search=${encodeURIComponent(query)}` : '/products');
  };

  return (
    <header className="header">
      <div className="container header-top">
        <button
          className="icon-btn burger"
          onClick={() => setMenuOpen(true)}
          aria-label="منو"
        >
          <Menu size={20} />
        </button>

        <Link to="/" className="logo">
          <span className="logo-mark">
            tell<span>call</span>
          </span>
          <span className="logo-tag">فروشگاه کالای دیجیتال</span>
        </Link>

        <form className="search search-desktop" onSubmit={submit} role="search">
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="جستجو در گوشی، لپ‌تاپ، تبلت و گجت‌ها…"
            aria-label="جستجوی کالا"
          />
          <button type="submit" aria-label="جستجو">
            <Search size={17} />
          </button>
        </form>

        <div className="header-actions">
          <Link
            className="header-action"
            to={isAuthenticated ? '/account' : '/login'}
          >
            {isAuthenticated ? <User size={20} /> : <LogIn size={20} />}
            <span>{isAuthenticated ? (user?.display_name ?? 'حساب من') : 'ورود / ثبت‌نام'}</span>
          </Link>

          <Link className="header-action" to="/account/favorites">
            <Heart size={20} />
            {wishCount > 0 ? <span className="count">{wishCount}</span> : null}
            <span>علاقه‌مندی‌ها</span>
          </Link>

          <Link className="header-action" to="/cart">
            <ShoppingCart size={20} />
            {count > 0 ? <span className="count">{count}</span> : null}
            <span>سبد خرید</span>
          </Link>
        </div>
      </div>

      <nav className="nav nav-desktop">
        <div className="container">
          <ul className="nav-list">
            <li className="nav-item">
              <Link className="nav-link is-primary" to="/products">
                <Menu size={16} />
                همه دسته‌بندی‌ها
                <ChevronDown size={14} />
              </Link>
              <div className="dropdown">
                {categories.length === 0 ? (
                  <span className="small muted" style={{ padding: 10, display: 'block' }}>
                    در حال بارگذاری…
                  </span>
                ) : (
                  categories.map((category) => (
                    <Link key={category.id} to={`/products?categoryId=${category.id}`}>
                      {category.title}
                    </Link>
                  ))
                )}
              </div>
            </li>

            {categories.slice(0, 5).map((category) => (
              <li key={category.id} className="nav-item">
                <Link
                  className="nav-link"
                  to={`/products?categoryId=${category.id}`}
                >
                  {category.title}
                  {category.children?.length ? <ChevronDown size={13} /> : null}
                </Link>
                {category.children?.length ? (
                  <div className="dropdown">
                    {category.children.map((child) => (
                      <Link key={child.id} to={`/products?categoryId=${child.id}`}>
                        {child.title}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}

            {QUICK_LINKS.map((link) => (
              <li key={link.to} className="nav-item">
                <Link className="nav-link" to={link.to}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {menuOpen ? (
        <>
          <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />
          <aside className="drawer">
            <div className="spread" style={{ marginBottom: 16 }}>
              <span className="strong">دسته‌بندی‌ها</span>
              <button className="icon-btn" onClick={() => setMenuOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form className="search" onSubmit={submit} style={{ marginBottom: 18 }}>
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="جستجو…"
              />
              <button type="submit" aria-label="جستجو">
                <Search size={16} />
              </button>
            </form>

            <div className="stack" style={{ gap: 2 }}>
              {categories.map((category) => (
                <div key={category.id}>
                  <Link
                    className="account-link"
                    to={`/products?categoryId=${category.id}`}
                  >
                    {category.title}
                  </Link>
                  {(category.children ?? []).map((child) => (
                    <Link
                      key={child.id}
                      className="account-link small"
                      style={{ paddingInlineStart: 28 }}
                      to={`/products?categoryId=${child.id}`}
                    >
                      {child.title}
                    </Link>
                  ))}
                </div>
              ))}
              <div className="divider" />
              {QUICK_LINKS.map((link) => (
                <Link key={link.to} className="account-link" to={link.to}>
                  {link.label}
                </Link>
              ))}
            </div>
          </aside>
        </>
      ) : null}
    </header>
  );
}
