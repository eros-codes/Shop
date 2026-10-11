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
  const signedInRef = useRef(isAuthenticated);
  signedInRef.current = isAuthenticated;

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

  // A guest's basket is a copy kept in this browser, with the price and
  // stock it had when each line went in - a basket filled last week still
  // showed last week's prices until checkout asked the customer to sign
  // in. Read every product again and bring the lines up to date; one that
  // has since been removed or switched off is taken out, and the customer
  // is told.
  const refreshGuest = useCallback(async () => {
    const productIds = [...new Set(readGuestCart().map((line) => line.productId))];
    if (productIds.length === 0) return;

    const fetched = await Promise.all(
      productIds.map((id) =>
        api
          .get(`/products/${id}`)
          .then((product) => [id, product])
          .catch((error) => [id, error?.status === 404 ? null : undefined]),
      ),
    );
    const products = new Map(fetched);

    // Applied to the basket as it is now, not as it was when the requests
    // went out: a line added meanwhile must not be lost.
    let dropped = 0;
    const next = readGuestCart().flatMap((line) => {
      const product = products.get(line.productId);
      if (product === undefined) return [line]; // not asked, or no answer
      const variant = line.variantId
        ? (product?.variants ?? []).find((item) => item.id === line.variantId)
        : null;
      if (!product || (line.variantId && (!variant || variant.is_active === false))) {
        dropped += 1;
        return [];
      }
      return [
        {
          ...line,
          title: product.title,
          slug: product.slug,
          variantTitle: variant?.title ?? line.variantTitle,
          image: coverImage(product) ?? line.image,
          unitPrice: effectivePrice(product, variant),
          stock: Number(variant?.stock ?? product.stock ?? 0),
        },
      ];
    });
    // Signed in while the products were loading: the basket on screen is
    // the account's now, and the merge has taken care of these lines.
    if (signedInRef.current) return;
    setLines(next);
    writeGuestCart(next);
    if (dropped > 0) {
      toast.error(
        `${dropped.toLocaleString('fa-IR')} کالا دیگر فروخته نمی‌شود و از سبد خرید برداشته شد`,
      );
    }
  }, [toast]);

  // Signing in: whatever the visitor collected is sent once, then the
  // basket is read back from the server, which is the only copy from
  // then on.
  useEffect(() => {
    if (!ready) return;

    if (!isAuthenticated) {
      mergedFor.current = null;
      setLines(readGuestCart());
      setSettled(true);
      void refreshGuest();
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
  }, [ready, isAuthenticated, user?.id, loadServerCart, refreshGuest, toast]);

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
        // All the units in one request: the API takes them or refuses
        // them together, so a failure no longer leaves part of them in.
        await api.post(
          '/products/basket',
          {
            product_id: product.id,
            variant_id: variantId ?? undefined,
            ...(quantity > 1 ? { quantity } : {}),
          },
          { auth: true },
        );
        await loadServerCart();
        toast.success('به سبد خرید اضافه شد');
        return true;
      } catch (error) {
        toast.error(translateError(error));
        // Someone else may have bought the last ones meanwhile: show the
        // basket as it really is.
        void loadServerCart();
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
        // The whole line in one request (it used to be one per unit).
        await api.delete(
          '/products/basket',
          {
            product_id: line.productId,
            variant_id: line.variantId ?? undefined,
            quantity: line.quantity,
          },
          { auth: true },
        );
        await loadServerCart();
      } catch (error) {
        toast.error(translateError(error));
        void loadServerCart();
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
      refreshGuest,
      clearLocal,
    }),
    [lines, loading, settled, totals, add, increase, decrease, remove, loadServerCart, refreshGuest, clearLocal],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}
