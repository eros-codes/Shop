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

  // Two stores, one list. A guest's favourites live in this browser; once
  // they sign in the server list is the truth, so it is loaded and the guest
  // list is folded into it rather than being quietly dropped. Without this
  // the hearts were initialised from localStorage exactly once, so a
  // signed-in customer's favourites disappeared on the next refresh even
  // though the rows were sitting on the server.
  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) return undefined;

    (async () => {
      try {
        const guest = new Set(
          JSON.parse(localStorage.getItem(GUEST_KEY) ?? '[]'),
        );
        const result = await api.get('/products/bookmark', { auth: true });
        const server = new Set((result?.productIds ?? []).map(Number));

        const toPush = [...guest].filter((id) => !server.has(id));
        await Promise.all(
          toPush.map((id) =>
            api
              .post('/products/bookmark', { product_id: id }, { auth: true })
              .catch(() => null),
          ),
        );
        toPush.forEach((id) => server.add(id));

        localStorage.removeItem(GUEST_KEY);
        if (!cancelled) setIds(server);
      } catch {
        // Offline or a stale token: keep whatever is on screen.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

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
