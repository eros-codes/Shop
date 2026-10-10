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
import { coverImage, effectivePrice } from '../lib/format';

const CartContext = createContext(null);
const GUEST_KEY = 'tellcall.guestCart';

// A visitor can fill a basket before signing in: it lives in this
// browser until they do, and is folded into their account's basket at
// login by the API's merge endpoint.
function readGuestCart() {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGuestCart(lines) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(lines));
  } catch {
    // A full or blocked storage is not worth breaking the page over.
  }
}

function lineKey(productId, variantId) {
  return `${productId}:${variantId ?? 'default'}`;
}

export function CartProvider({ children }) {
  const { user, isAuthenticated, ready } = useAuth();
  const toast = useToast();
  const [lines, setLines] = useState(() => readGuestCart());
  const [loading, setLoading] = useState(false);
  // Whether `lines` is the real basket yet. A signed-in customer's basket
  // lives on the server, so until it has answered the cart only *looks*
  // empty - and checkout, reloaded (as phones do with background tabs),
  // took that for an empty cart and sent the customer away.
  const [settled, setSettled] = useState(false);
  const mergedFor = useRef(null);

  const loadServerCart = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const items = await api.get(`/products/basket/${user.id}`, { auth: true });
      setLines(
        (items ?? []).map((item) => ({
          id: item.id,
          productId: item.product?.id,
          variantId: item.variant?.id ?? null,
          quantity: item.quantity,
          title: item.product?.title ?? '',
          slug: item.product?.slug,
          variantTitle: item.variant?.title ?? null,
          image: coverImage(item.product),
          unitPrice: effectivePrice(item.product, item.variant),
          stock: item.variant?.stock ?? item.product?.stock ?? 0,
        })),
      );
    } catch (error) {
      toast.error(translateError(error));
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast]);

  // Signing in: whatever the visitor collected is sent once, then the
  // basket is read back from the server, which is the only copy from
  // then on.
  useEffect(() => {
    if (!ready) return;

    if (!isAuthenticated) {
      mergedFor.current = null;
      setLines(readGuestCart());
      setSettled(true);
      return;
    }
    if (mergedFor.current === user?.id) return;
    mergedFor.current = user?.id;
    setSettled(false);

    (async () => {
      const guestLines = readGuestCart();
      if (guestLines.length > 0) {
        try {
          const result = await api.post(
            '/products/basket/merge',
            {
              items: guestLines.map((line) => ({
                product_id: line.productId,
                variant_id: line.variantId ?? undefined,
                quantity: line.quantity,
              })),
            },
            { auth: true },
          );
          writeGuestCart([]);
          if (result?.merged > 0) {
            toast.success('سبد خرید شما به حساب‌تان منتقل شد');
          }
        } catch {
          // The merge failing must not cost the visitor their session.
        }
      }
      await loadServerCart();
      setSettled(true);
    })();
  }, [ready, isAuthenticated, user?.id, loadServerCart, toast]);

  const persistGuest = useCallback((next) => {
    setLines(next);
    writeGuestCart(next);
  }, []);

  const add = useCallback(
    async (product, variant, quantity = 1) => {
      const variantId = variant?.id ?? null;
      const stock = variant?.stock ?? product?.stock ?? 0;

      if (!isAuthenticated) {
        const current = readGuestCart();
        const key = lineKey(product.id, variantId);
        const existing = current.find(
          (line) => lineKey(line.productId, line.variantId) === key,
        );
        const wanted = (existing?.quantity ?? 0) + quantity;
        if (wanted > stock) {
          toast.error(
            stock > 0
              ? `تنها ${stock} عدد از این گزینه موجود است`
              : 'این گزینه موجود نیست',
          );
          return false;
        }
        const next = existing
          ? current.map((line) =>
              lineKey(line.productId, line.variantId) === key
                ? { ...line, quantity: wanted }
                : line,
            )
          : [
              ...current,
              {
                productId: product.id,
                variantId,
                quantity,
                title: product.title,
                slug: product.slug,
                variantTitle: variant?.title ?? null,
                image: coverImage(product),
                unitPrice: effectivePrice(product, variant),
                stock,
              },
            ];
        persistGuest(next);
        toast.success('به سبد خرید اضافه شد');
        return true;
      }

      try {
        // The API adds one unit per call, which is also what the
        // quantity stepper does.
        for (let i = 0; i < quantity; i += 1) {
          await api.post(
            '/products/basket',
            { product_id: product.id, variant_id: variantId ?? undefined },
            { auth: true },
          );
        }
        await loadServerCart();
        toast.success('به سبد خرید اضافه شد');
        return true;
      } catch (error) {
        toast.error(translateError(error));
        return false;
      }
    },
    [isAuthenticated, loadServerCart, persistGuest, toast],
  );

  const decrease = useCallback(
    async (line) => {
      if (!isAuthenticated) {
        const current = readGuestCart();
        const key = lineKey(line.productId, line.variantId);
        const next = current
          .map((item) =>
            lineKey(item.productId, item.variantId) === key
              ? { ...item, quantity: item.quantity - 1 }
              : item,
          )
          .filter((item) => item.quantity > 0);
        persistGuest(next);
        return;
      }

      try {
        await api.delete(
          '/products/basket',
          {
            product_id: line.productId,
            variant_id: line.variantId ?? undefined,
          },
          { auth: true },
        );
        await loadServerCart();
      } catch (error) {
        toast.error(translateError(error));
      }
    },
    [isAuthenticated, loadServerCart, persistGuest, toast],
  );

  const increase = useCallback(
    async (line) => {
      if (line.quantity >= line.stock) {
        toast.error(`تنها ${line.stock} عدد از این گزینه موجود است`);
        return;
      }
      await add(
        { id: line.productId, title: line.title, slug: line.slug },
        line.variantId ? { id: line.variantId, title: line.variantTitle, stock: line.stock } : null,
        1,
      );
    },
    [add, toast],
  );

  const remove = useCallback(
    async (line) => {
      if (!isAuthenticated) {
        const key = lineKey(line.productId, line.variantId);
        persistGuest(
          readGuestCart().filter(
            (item) => lineKey(item.productId, item.variantId) !== key,
          ),
        );
        return;
      }
      try {
        for (let i = 0; i < line.quantity; i += 1) {
          await api.delete(
            '/products/basket',
            {
              product_id: line.productId,
              variant_id: line.variantId ?? undefined,
            },
            { auth: true },
          );
        }
        await loadServerCart();
      } catch (error) {
        toast.error(translateError(error));
      }
    },
    [isAuthenticated, loadServerCart, persistGuest, toast],
  );

  const clearLocal = useCallback(() => {
    writeGuestCart([]);
    setLines([]);
  }, []);

  const totals = useMemo(() => {
    const count = lines.reduce((sum, line) => sum + line.quantity, 0);
    const goods = lines.reduce(
      (sum, line) => sum + Number(line.unitPrice ?? 0) * line.quantity,
      0,
    );
    return { count, goods };
  }, [lines]);

  const value = useMemo(
    () => ({
      lines,
      loading,
      settled,
      count: totals.count,
      goodsTotal: totals.goods,
      add,
      increase,
      decrease,
      remove,
      reload: loadServerCart,
      clearLocal,
    }),
    [lines, loading, settled, totals, add, increase, decrease, remove, loadServerCart, clearLocal],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}
