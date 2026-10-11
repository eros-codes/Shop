import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { translateError } from '../lib/errorMessages';

const WishlistContext = createContext(null);
const GUEST_KEY = 'tellcall.wishlist';

// Storage can be blocked outright; favourites are not worth breaking a
// page over.
function readGuest() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(Number) : []);
  } catch {
    return new Set();
  }
}

function writeGuest(ids) {
  try {
    if (ids.size) localStorage.setItem(GUEST_KEY, JSON.stringify([...ids]));
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    // See readGuest.
  }
}

// Favourites are a bookmark toggle on the API for signed-in customers,
// and a list in this browser for everyone else.
export function WishlistProvider({ children }) {
  const { isAuthenticated, ready, user } = useAuth();
  const toast = useToast();
  const [ids, setIds] = useState(readGuest);
  // Product ids with a toggle on its way to the server. The API's bookmark
  // is a toggle too, so a second tap before the first answered flipped it
  // back there while the heart on screen stayed filled.
  const pending = useRef(new Set());

  // Two stores, one list. A guest's favourites live in this browser; once
  // they sign in the server list is the truth, so it is loaded and the guest
  // list is folded into it rather than being quietly dropped.
  //
  // Signing out goes back to this browser's own (by then empty) list. The
  // hearts used to keep showing the account's favourites after sign-out -
  // on a shared computer, to the next person - and the next guest tap then
  // wrote that whole list into the browser.
  useEffect(() => {
    if (!ready) return undefined;
    if (!isAuthenticated) {
      setIds(readGuest());
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const guest = readGuest();
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

        writeGuest(new Set());
        if (!cancelled) setIds(server);
      } catch {
        // Offline or a stale token: keep whatever is on screen.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, isAuthenticated, user?.id]);

  const toggle = useCallback(
    async (productId) => {
      if (pending.current.has(productId)) return;
      const wasSaved = ids.has(productId);
      const next = new Set(ids);
      if (wasSaved) next.delete(productId);
      else next.add(productId);
      setIds(next);

      if (!isAuthenticated) {
        writeGuest(next);
        toast.toast(wasSaved ? 'از علاقه‌مندی‌ها حذف شد' : 'به علاقه‌مندی‌ها اضافه شد');
        return;
      }

      pending.current.add(productId);
      try {
        await api.post('/products/bookmark', { product_id: productId }, { auth: true });
        toast.toast(wasSaved ? 'از علاقه‌مندی‌ها حذف شد' : 'به علاقه‌مندی‌ها اضافه شد');
      } catch (error) {
        // Put back only this product: other hearts may have changed since.
        setIds((current) => {
          const restored = new Set(current);
          if (wasSaved) restored.add(productId);
          else restored.delete(productId);
          return restored;
        });
        toast.error(translateError(error));
      } finally {
        pending.current.delete(productId);
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
