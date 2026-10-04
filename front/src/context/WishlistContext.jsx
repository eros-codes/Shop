import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { translateError } from '../lib/errorMessages';

const WishlistContext = createContext(null);
const GUEST_KEY = 'tellcall.wishlist';

// Favourites are a bookmark toggle on the API for signed-in customers,
// and a list in this browser for everyone else.
export function WishlistProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const toast = useToast();
  const [ids, setIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(GUEST_KEY) ?? '[]'));
    } catch {
      return new Set();
    }
  });

  const toggle = useCallback(
    async (productId) => {
      const next = new Set(ids);
      const wasSaved = next.has(productId);
      if (wasSaved) next.delete(productId);
      else next.add(productId);
      setIds(next);

      if (!isAuthenticated) {
        localStorage.setItem(GUEST_KEY, JSON.stringify([...next]));
        toast.toast(wasSaved ? 'از علاقه‌مندی‌ها حذف شد' : 'به علاقه‌مندی‌ها اضافه شد');
        return;
      }

      try {
        await api.post('/products/bookmark', { product_id: productId }, { auth: true });
        toast.toast(wasSaved ? 'از علاقه‌مندی‌ها حذف شد' : 'به علاقه‌مندی‌ها اضافه شد');
      } catch (error) {
        setIds(ids);
        toast.error(translateError(error));
      }
    },
    [ids, isAuthenticated, toast],
  );

  const value = useMemo(
    () => ({ ids, has: (id) => ids.has(id), toggle, count: ids.size }),
    [ids, toggle],
  );

  return (
    <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
  );
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used inside WishlistProvider');
  return context;
}
