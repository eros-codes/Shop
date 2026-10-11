import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Breadcrumb } from '../components/ui/Primitives';
import Favorites from './account/Favorites';

// A guest's favourites live in this browser, but the only page that showed
// them was inside the account area - so the heart in the header, with its
// count of saved products, led a guest to the sign-in form instead.
export default function FavoritesPage() {
  const { ready, isAuthenticated } = useAuth();
  if (ready && isAuthenticated) return <Navigate to="/account/favorites" replace />;

  return (
    <div className="container page">
      <Breadcrumb items={[{ label: 'علاقه‌مندی‌ها' }]} />
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>علاقه‌مندی‌ها</h1>
      <Favorites />
      <p className="small muted" style={{ marginTop: 16 }}>
        این فهرست در همین مرورگر ذخیره شده و پس از ورود به حساب‌تان منتقل می‌شود.
      </p>
    </div>
  );
}
